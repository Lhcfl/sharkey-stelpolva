# SkRateLimiterService - Leaky Bucket Rate Limit Implementation

SkRateLimiterService replaces Misskey's RateLimiterService for all use cases.
It offers a simplified API, detailed metrics, and support for Rate Limit headers.
The prime feature is an implementation of Leaky Bucket - a flexible rate limiting scheme that better supports bursty request patterns common with human interaction.

## Compatibility

The API is backwards-compatible with existing limit definitions, but it's preferred to use the new BucketRateLimit interface.
Legacy limits will be "translated" into a bucket limit in a way that attempts to respect max, duration, and minInterval (if present).
SkRateLimiterService is not quite plug-and-play compatible with existing call sites, as it no longer throws when a limit is exceeded.
Instead, the returned LimitInfo object will have `blocked` set to true.
Callers are responsible for checking this property and taking any desired action, such as rejecting a request or returning limit details.

Rate limit factors are also handled differently.
Instead of providing an optional parameter for callers, SkRateLimiterServer accepts an `MiUser` parameter that is used to compute the factor directly.
If a user is not available (such as for unauthenticated callers), then the Role Template factor is used instead.
To avoid confusion, the `factor` parameter has been removed entirely and is now an implementation detail.

## Headers

LimitInfo objects (returned by `SkRateLimitService.limit()`) can be passed to `rate-limit-utils.sendRateLimitHeaders()` to send standard rate limit headers with an HTTP response.
The defined headers are:

| Header                  | Definition                                                                                                                                                                                                     | Example                    |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------|
| `X-RateLimit-Remaining` | Number of calls that can be made without triggering the rate limit. Will be zero if the limit is already exceeded, or will be exceeded by the next request.                                                    | `X-RateLimit-Remaining: 1` |
| `X-RateLimit-Clear`     | Time in seconds required to completely clear the rate limit "bucket".                                                                                                                                          | `X-RateLimit-Clear: 1.5`   |
| `X-RateLimit-Reset`     | Contains the number of seconds to wait before retrying the current request. Clients should delay for at least this long before making another call. Only included if the rate limit has already been exceeded. | `X-RateLimit-Reset: 0.755` |
| `Retry-After`           | Like `X-RateLimit-Reset`, but measured in seconds (rounded up). Preserved for backwards compatibility, and only included if the rate limit has already been exceeded.                                          | `Retry-After: 2`           |

Note: rate limit headers are not standardized, except for `Retry-After`.
Header meanings and usage have been devised by adapting common patterns to work with a leaky bucket rate limit model.

## Performance

SkRateLimiterService makes between 0 and 4 redis transactions per rate limit check.
The first call is read-only, while the others perform at least one write operation.
No calls are made if a client has already been blocked at least once, as the block status is stored in a short-term memory cache.
Two integer keys are stored per client/subject, and both expire together after the maximum duration of the limit.
While performance has not been formally tested, it's expected that SkRateLimiterService has an impact roughly on par with the legacy RateLimiterService.
Redis memory usage should be notably lower due to the reduced number of keys and avoidance of set / array constructions.
If redis load does become a concern, then a dedicated node can be assigned via the `redisForRateLimit` config setting.

To prevent Redis DoS, SkRateLimiterService internally tracks the number of concurrent requests for each unique client/endpoint combination.
If the number of requests exceeds the limit's maximum value, then any further requests are automatically rejected.
The lockout will automatically end when the number of active requests drops to within the limit value.

## Concurrency and Multi-Node Correctness

To provide consistency across multi-node environments, leaky bucket is implemented with only atomic operations (`Increment`, `Decrement`, `Add`, and `Subtract`).
This allows the use of Optimistic Locking with read-modify-check logic.
If a data conflict is detected during the "drip" phase, then it's safely reverted by executing its inverse (`Increment` <-> `Decrement`, `Add` <-> `Subtract`).
We don't need to check for conflicts when adding the current request to the bucket, as all other logic already accounts for the case where the bucket has been "overfilled".
Should an extra request slip through, the limit delay will be extended until the bucket size is back within limits.

There is one non-atomic `Set` operation used to populate the initial Timestamp value, but we can safely ignore data races there.
Any possible conflict would have to occur within a few-milliseconds window, which means that the final value can be no more than a few milliseconds off from the expected value.
This error does not compound, as all further operations are relative (Increment and Add).
Thus, it's considered an acceptable tradeoff given the limitations imposed by Redis and ioredis.

In-process memory caches are used sparingly to avoid consistency problems.
Besides the role factor cache, there is one "important" cache which directly impacts limit calculations: the lockout cache.
This cache stores response data for blocked limits, preventing repeated calls to redis if a client ignores the 429 errors and continues making requests.
Consistency is guaranteed by only caching blocked limits (allowances are not cached), and by limiting cached data to the duration of the block.
This ensures that stale limit info is never used.

## Algorithm Pseudocode

The Atomic Leaky Bucket algorithm is described here, in pseudocode:

```
# Terms
# * Now - UNIX timestamp of the current moment
# * Bucket Size - Maximum number of requests allowed in the bucket
# * Counter - Number of requests in the bucket
# * Drip Rate - How often to decrement counter
# * Drip Size - How much to decrement the counter
# * Timestamp - UNIX timestamp of last bucket drip
# * Delta Counter - Difference between current and expected counter value
# * Delta Timestamp - Difference between current and expected timestamp value 

# 0 - Calculations
dripRate = ceil((limit.dripRate ?? 1000) * factor);
dripSize = ceil(limit.dripSize ?? 1);
bucketSize = max(ceil(limit.size / factor), 1);
maxExpiration = max(ceil((dripRate * ceil(bucketSize / dripSize)) / 1000), 1);;

# 1 - Read
MULTI
  GET 'counter' INTO counter
  GET 'timestamp' INTO timestamp
EXEC

# 2 - Drip
if (counter > 0) {
  # Deltas
  deltaCounter = floor((now - timestamp) / dripRate) * dripSize;
  deltaCounter = min(deltaCounter, counter);
  deltaTimestamp = deltaCounter * dripRate;
  if (deltaCounter > 0) {
    # Update
    expectedTimestamp = timestamp
    MULTI
      GET 'timestamp' INTO canaryTimestamp
      INCRBY 'timestamp' deltaTimestamp
      EXPIRE 'timestamp' maxExpiration
      GET 'timestamp' INTO timestamp
      DECRBY 'counter' deltaCounter
      EXPIRE 'counter' maxExpiration
      GET 'counter' INTO counter
    EXEC
    # Rollback
    if (canaryTimestamp != expectedTimestamp) {
      MULTI
        DECRBY 'timestamp' deltaTimestamp
        GET 'timestamp' INTO timestmamp
        INCRBY 'counter' deltaCounter
        GET 'counter' INTO counter
      EXEC
    }
  }
}

# 3 - Check
blocked = counter >= bucketSize
if (!blocked) {
  if (timestamp == 0) {
    # Edge case - set the initial value for timestamp.
    # Otherwise the first request will immediately drip away.
    MULTI
      SET 'timestamp', now
      EXPIRE 'timestamp' maxExpiration
      INCR 'counter'
      EXPIRE 'counter' maxExpiration
      GET 'counter' INTO counter
    EXEC
  } else {
    MULTI
      INCR 'counter'
      EXPIRE 'counter' maxExpiration
      GET 'counter' INTO counter
    EXEC
  }
}

# 4 - Handle
if (blocked) {
  # Application-specific code goes here.
  # At this point blocked, counter, and timestamp are all accurate and synced to redis.
  # Caller can apply limits, calculate headers, log audit failure, or anything else.
}
```

## Notes, Resources, and Further Reading

* https://en.wikipedia.org/wiki/Leaky_bucket#As_a_meter
* https://ietf-wg-httpapi.github.io/ratelimit-headers/darrelmiller-policyname/draft-ietf-httpapi-ratelimit-headers.txt
* https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
* https://stackoverflow.com/a/16022625
