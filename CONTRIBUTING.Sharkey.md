# Contribution guide

We're glad you're interested in contributing to Sharkey! In this
document you will find the information you need to contribute to the
project. Please *also* read Misskey's contribution guide,
[CONTRIBUTING.md](CONTRIBUTING.md).

## Issues

Before creating an issue, please check the following:

- To avoid duplication, please search for similar issues before
  creating a new issue.

- Do not use Issues to ask questions or for troubleshooting.

  - Issues should only be used for feature requests, suggestions, and
    bug tracking.
  - For questions and troubleshooting, join [our Discord
    server](https://discord.gg/6VgKmEqHNk) or tag the official Sharkey
    fedi account,
    [@sharkey@sharkey.team](https://sharkey.team/@sharkey).

> [!WARNING]
> Do not close issues that are about to be resolved. It
> should remain open until a commit that actually resolves it is
> merged.

## Well-known branches

- **`stable`** branch is tracking the latest release and used for
  production purposes.
- **`develop`** branch is where we work for the next release.

  - When you create a merge request, target it to this branch.

## Creating a Merge Request

Thank you for your merge request! Before creating an MR, please check the
following:

- If possible, prefix the title with a keyword that identifies the
  type of this MR, like `fix` / `refactor` / `feat` / `enhance` /
  `perf` / `chore` etc

- Make sure that the granularity of this MR is
  appropriate. Please do not include more than one type of change or
  interest in a single MR.

- If there is an Issue which will be resolved by this MR, please
  include a reference to the Issue in the text.

- Check if there are any documents that need to be created or updated
  due to this change.

- If you have added a feature or fixed a bug, please add a test case
  if possible.

- Please make sure that tests and Lint are passed in advance. You can
  run it with `pnpm test` and `pnpm lint`. See the [testing
  section](#testing) for more info.

- If this MR includes new translated strings, or changes to existing
  translations, make sure you have edited `sharkey-locales/en-US.yml`
  and *not* any of the files under `locales/` (the files under
  `locales/` must stay identical to Misskey)

- If this MR includes UI changes, please attach a screenshot in the
  text.

## Release process

(See also [the
wiki](https://activitypub.software/TransFem-org/Sharkey/-/wikis/release-process))

### Creating a release
#### Prerequisites
Before creating a release, we must ensure that:
- `develop` contains exactly the code we want to release.

  - It can be useful to mark MRs we want to release with the
    [`for-next-release`
    label](https://activitypub.software/TransFem-org/Sharkey/-/merge_requests?label_name[]=for-next-release).

- We have tested it enough to be confident we can release it to the
  world.

- The CI pipeline (build, test, lint) passes.

- The backend end-to-end tests (`pnpm --filter=backend test:e2e`) pass
  on your machine.

- `package.json` and `packages/misskey-js/package.json` on `develop`
  have a `"version": "2027.12.0-dev"` or something similarly
  non-prod-looking.

- The
  [changelogs](https://activitypub.software/TransFem-org/Sharkey/-/wikis/changelogs)
  contain all the changes we want to announce.

#### To release
To create a release, we must:

1. Create a new Branch based on `develop` to change the version to a
  prod-looking one (e.g. `2027.12.1`).

	- Try to avoid using the same version as Misskey, both to reduce
    confusion, and because (unlike branches) tags are not scoped by
    remote and will confuse multi-remote clones.

2. Create an MR to merge the new branch into `stable`.

3. Once that MR is merged, go to
  https://activitypub.software/TransFem-org/Sharkey/-/releases and
  create a new release.

  - For the tag, use the same version you just set on `stable`
    (e.g. `2027.12.1`).

  - Make sure the tag will be created on `stable`.

	- For the release name, again use the version (e.g. `2027.12.1`).

	- For the release notes, copy the [changelogs](changelogs).

4. Wait for all the pipelines to complete.

	- In the [container
    registry](https://activitypub.software/TransFem-org/Sharkey/container_registry/2?orderBy=NAME&sort=desc&search[]=)
    you should get (of course with the right version):

	  - `latest`
		- `2027.12.1-amd64`
		- `2027.12.1-arm64`

5. Announce the release on the official account!

#### Post release
After creating a release, we must:

- Branch off `develop`, merge `stable` into that new branch, change the version
  to the *next* number (e.g. `2028.1.0-dev`), create a MR for this
  branch, and get it merged.

### Hotfixes / security releases

Sometimes we need to release changes to the latest stable release, *without* whatever has been merged into `develop`. For example, a security fix.

In these cases:

1. Create a branch off `stable` - let's call it `hotfix/2027.12.2`, for
   example - and change the version number on this branch.

2. Create branches off `stable`, one per fix (like normal feature /
   bugfix branches, but starting from the released code), and send MRs
   targeting `hotfix/2027.12.2`.

3. Once all the fixes have been merged into `hotfix/2027.12.2`, create
   a MR targeting `stable`.

4. Now carry on through the normal release process (from step 3 of the
   "[To release](#To%20Release)" section).

## Icon Font (Shark Font)

Sharkey has its own Icon Font called Shark Font which can be found at
https://activitypub.software/TransFem-org/shark-font

Build instructions can all be found over there in the `README`.

If you have an icon suggestion or want to add an Icon please open an
issue/merge request over at that repo.

When updating the font, make sure to copy **all generated files** from
the `dest` folder into `packages/backend/assets/fonts/sharkey-icons`.

For the CSS, copy the file content and replace the old content in
`style.css` and for the WOFF, TTF and SVG simply replace them.

## Development

### Accessing source code

In order to submit code changes, you will need to create a fork of the
main repository. This can be done via the GitLab UI, by pressing the
"Fork" button while signed into an activitypub.software GitLab
account.

Once you have created a fork, you should clone it locally and update
submodules using Git. For example, to clone using SSH, use the
following commands, replacing "<YOUR_USERNAME>" with your GitLab
username:

```bash
git clone git@activitypub.software:<YOUR_USERNAME>/Sharkey.git
git submodule update --init
```

### Environment setup

Before developing, you should set up a testing environment. You can do
this using Docker via the Docker Compose plugin. You will also need to
have `pnpm` installed.

(You may wish to perform this setup using system-wide software
installed separately, e.g. via a package manager, or using
Devcontainer. Both are possible, but they will require manual setup
that will not be covered in this document.)

First, you will need to copy
[`.config/docker_example.env`](.config/docker_example.env) to
`.config/docker.env`. This file will contain configurations for the
PostgreSQL database, such as username and password. You may set these
as you wish. You will also need to copy
[`.config/example.yml`](.config/example.yml) to
`.config/default.yml`. This file will contain configurations for
Sharkey. Ensure that the username and password in the `db:` section
match the ones set in `docker.env`.

Now, use the following command to start a local database container:

```bash
docker compose -f compose.local-db.yml up -d
```

This will run a local PostgreSQL database server in the
background. (To stop the database, run `docker compose -f
compose.local-db.yml down`.)

Once the database is active, run the following commands:

```bash
pnpm build
pnpm migrate
```

This will build Sharkey and perform database migrations. After
finishing the migration, the database will be ready for use.

### Start developing

After making code changes, you can run Sharkey using the following
command:

```bash
pnpm dev
```

- Checks server-side source files and automatically builds them if
  they are modified. Automatically starts the server process(es).

- Vite HMR (just the `vite` command) is available. The behavior may be
  different from production.

- Service Worker is watched by esbuild.

- Sharkey is served on the port configured with `port` in
	`.config/default.yml`.  If you have not changed it from the default,
	you can access it at `http://localhost:3000`.

### Testing

(See also [Misskey's docs about testing](./CONTRIBUTING.md#testing)).

To run many of the tests, you need a dedicated database. To set this up:

1. Start PostgreSQL and Redis

	- This is covered in the [environment setup](#Environment%20setup) section.

2. Create the test configuration file, by copying
   `.config/test-example.yml` to `.config/test.yml`.

	```bash
	cp .config/test-example.yml .config/test.yml
	```

3. Start the database container:

	```bash
	docker compose -f packages/backend/test/compose.yml up -d
	```

Now you can run `pnpm test` and `pnpm --filter=backend test:e2e` to
run the tests.

To stop the database container, run `docker compose -f
packages/backend/test/compose.yml up -d down`

### Environment Variables

- `MISSKEY_CONFIG_DIR` changes the directory where config files are
  searched. Defaults to [`.config/`](.config/) at the top of the repository.
- `MISSKEY_CONFIG_YML` changes the configuration file name. Defaults
  to `default.yml` (e.g. you can set `MISSKEY_CONFIG_YML=2nd.yml` to
  load `.config/2nd.yml`).
- `MISSKEY_WEBFINGER_USE_HTTP` if set to `true`, WebFinger requests
  will be http instead of https, useful for testing federation between
  servers in localhost.

> [!WARNING]
> Never use `MISSKEY_WEBFINGER_USE_HTTP` for a real instance in production,
> as it will expose user information to the network.

## Continuous integration

Sharkey uses GitLab CI for executing automated tests.

Configuration files are located in [`.gitlab-ci.yml`](.gitlab-ci.yml).

### Merging from Misskey into Sharkey

Make sure you have both remotes in the same clone. To do this, run
the following command to add Misskey's remote to your local clone:

```bash
git remote add misskey https://github.com/misskey-dev/misskey.git
```

Then, to perform the merge:

```bash
git remote update   # Update branches to track the new remote.
git checkout develop   # Checkout Sharkey's develop branch.
git checkout -m merge/$(date +%Y-%m-%d)   # Create/switch to a merge branch for the current date.
git merge --no-ff misskey/develop   # Merge from Misskey's develop branch, forcing a merge commit.
```

Fix conflicts and *commit!*
- Conflicts in `pnpm-lock.yaml` can be fixed by rejecting changes and running `pnpm install`.
- Conflicts in `packages/misskey-js/etc` and `packages/misskey-js/src/autogen` can be fixed by rejecting changes and running `pnpm run build-misskey-js-with-types`.
- Conflicts in `locales/index.d.ts` can be fixed by rejecting changes and running `pnpm run build-assets`.
- Conflicts in any `package.json` file can be fixed by merging only added/removed dependencies, then running `pnpm run sync-dependency-versions`. Other changes (not dependencies) will need to be merged manually.
- Conflicts involving `this.timeService.now` or `this.timeService.date` can be resolved by accepting remote changes. ESLint will highlight all the missing references in a later step.

*After that commit*, do all the extra work on the same branch:

- Copy all changes (commit after each step):
    - in `packages/backend/src/core/activitypub/models/ApNoteService.ts`, from `createNote` to `updateNote`
    - from `packages/backend/src/core/NoteCreateService.ts` to `packages/backend/src/core/NoteEditService.ts`
    - from `packages/backend/src/server/api/endpoints/notes/create.ts` to `packages/backend/src/server/api/endpoints/notes/edit.ts`
    - from MK note components to SK note components (if sensible)
        - from `packages/frontend/src/components/MkNote.vue` to `packages/frontend/src/components/SkNote.vue`
        - from `packages/frontend/src/components/MkNoteDetailed.vue` to `packages/frontend/src/components/SkNoteDetailed.vue`
        - from `packages/frontend/src/components/MkNoteHeader.vue` to `packages/frontend/src/components/SkNoteHeader.vue`
        - from `packages/frontend/src/components/MkNoteSimple.vue` to `packages/frontend/src/components/SkNoteSimple.vue`
        - from `packages/frontend/src/components/MkNoteSub.vue` to `packages/frontend/src/components/SkNoteSub.vue`
    - from MK note components to Dynamic note components (if the public signature changed)
        - from `packages/frontend/src/components/MkNote.vue` to `packages/frontend/src/components/DynamicNote.vue`
        - from `packages/frontend/src/components/MkNoteDetailed.vue` to `packages/frontend/src/components/DynamicNoteDetailed.vue`
        - from `packages/frontend/src/components/MkNoteSimple.vue` to `packages/frontend/src/components/DynamicNoteSimple.vue`
    - from the global timeline to the bubble timeline
        - `packages/backend/src/server/api/stream/channels/global-timeline.ts`
        - `packages/backend/src/server/api/stream/channels/bubble-timeline.ts`
        - `packages/frontend/src/timelines.ts`
        - `packages/frontend/src/components/MkTimeline.vue`
        - `packages/frontend/src/pages/timeline.vue`
        - `packages/frontend/src/ui/deck/tl-column.vue`
        - `packages/frontend/src/widgets/WidgetTimeline.vue`
    - from `packages/backend/src/queue/processors/InboxProcessorService.ts` to `packages/backend/src/core/UpdateInstanceQueue.ts`, where `updateInstanceQueue` is impacted
    - from `.config/example.yml` to `.config/ci.yml` and `chart/files/default.yml`
    - in `packages/backend/src/core/MfmService.ts`, from `toHtml` to `toMastoApiHtml`
    - from `verifyLink` in `packages/backend/src/core/activitypub/models/ApPersonService.ts` to `verifyFieldLinks` in `packages/backend/src/misc/verify-field-link.ts` (if sensible)
- Check for changes that may require additional work:
  - If there have been any changes to the federated user data (the
    `renderPerson` function in
    `packages/backend/src/core/activitypub/ApRendererService.ts`), make
    sure that the set of fields in `userNeedsPublishing` and
    `profileNeedsPublishing` in
    `packages/backend/src/server/api/endpoints/i/update.ts` are still
    correct.
  - Check for any new instances of any memory cache class.
    (`MemoryKVCache`, `MemorySingleCache`, `RedisKVCache`, `RedisSingleCache`, and `QuantumKVCache` are the current ones.)
  	These can usually be kept as-is, but all instances must be managed by `CacheManagementService`.
    The conversion is easy:
    1. Make sure that `CacheManagementService` is available.
       In most cases, it can be injected through DI.
       (it's in the `GlobalModule` which should be available everywhere.)
    2. Find where the cache is constructed.
       If it's a field initializer, then move it to the constructor (splitting declaration and initialization.)
    3. Replace the `new Whatever()` statement with a call to `cacheManagementService.createWhatever()`.
       Arguments can be kept as-is, but remove any references to `Redis`, `InternalEventService`, or `TimeService`.
       (these are provided by `CacheManagementService` directly.)
    4. Remove any calls to `dispose()` the cache.
       Disposal is managed by `CacheManagementService`, so attempting to call any `dispose` or `onApplicationShutdown` method will produce a type error.
  - Check for any new calls to native time functions:
    - `Date.now()` - replace with `this.timeService.now`.
       Inject `TimeService` via DI if it's not already available.
    - `new Date()` - if there's a value passed in, then leave it.
    But the no-args constructor should be replaced with `this.timeService.date`.
      Inject `TimeService` via DI if it's not already available.
    - `setTimeout` - migrate to `this.timeService.startTimer` or `this.timeService.startPromiseTimer`.
      The parameters should be the same, but the return type is different.
      You may need to replace some `NodeJS.Timeout` types with `this.timerHandle`.
			Inject `TimeService` via DI if it's not already available.
    - `setInterval` - migrate to `this.timeService.startTimer`.
    	Migration is mostly the same as `setTimeout`, but with one major difference:
    	You must add `{ repeated: true }` as the final option parameter.
    	If this is omitted, the code will compile but the interval will only fire once!
  - Check for any new Chart subclasses, and make sure to inject `TimeService` and implement `getCurrentDate`.
  - Check for any new Channel subclasses and add all missing DI parameters.

- Check the changes against our `develop` branch (`git diff develop`)
  and against Misskey's `develop` branch (`git diff misskey/develop`).

- Re-generate `misskey-js` (`pnpm build-misskey-js-with-types`) and
  commit.

- Re-generate locales (`pnpm run build-assets`) and commit.

- Build the frontend with this command:

    ```bash
    rm -rf built/
    NODE_ENV=development pnpm --filter=frontend --filter=frontend-embed --filter=frontend-shared build
    ```

- Make sure there aren't any new `ti-*` classes (Tabler Icons), and
  replace them with appropriate `ph-*` ones (Phosphor Icons) in
  [`vite.replaceicons.ts`](packages/frontend/vite.replaceIcons.ts).

    - This command should show you want to change: `grep -ohrP
      '(?<=["'\''](ti )?)(ti-(?!fw)[\w\-]+)' --exclude \*.map --
      built/ | sort -u`.

    - NOTE: `ti-fw` is a special class that's defined by Misskey,
      leave it alone.

    - After every change, re-build the frontend and check again, until
      there are no more `ti-*` classes in the built files.

    - Commit!

- Double-check the new migration, that they won't conflict with our db
  changes: `git diff develop -- packages/backend/migration/`

- Run `pnpm clean; pnpm build`.

- Run tests `pnpm test; pnpm --filter backend test:e2e` (requires a
  test database, [see above](#testing)) and fix them all (the e2e
  tests randomly fail with weird errors like `relation "users" does
  not exist`, run them again if that happens).

- Run lint `pnpm --filter=backend --filter=frontend-shared lint` +
  `pnpm --filter=frontend --filter=frontend-embed eslint` and fix all
  the problems.

Then push and open a Merge Request.

### Memory Caches

Sharkey offers multiple memory cache implementations, each meant for a
different use case. The following table compares the available
options:

| Cache               | Type      | Consistency | Persistence | Data Source | Cardinality | Eviction | Description                                                                                                                                                                                                                                                                |
|---------------------|-----------|-------------|-------------|-------------|-------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `MemoryKVCache`     | Key-Value | None        | None        | Caller      | Single      | Lifetime | Implements a basic in-memory Key-Value store. The implementation is entirely synchronous, except for user-provided data sources.                                                                                                                                           |
| `MemorySingleCache` | Single    | None        | None        | Caller      | Single      | Lifetime | Implements a basic in-memory Single Value store. The implementation is entirely synchronous, except for user-provided data sources.                                                                                                                                        |
| `RedisKVCache`      | Key-Value | Eventual    | Redis       | Callback    | Single      | Lifetime | Extends `MemoryKVCache` with Redis-backed persistence and a pre-defined callback data source. This provides eventual consistency guarantees based on the memory cache lifetime.                                                                                            |
| `RedisSingleCache`  | Single    | Eventual    | Redis       | Callback    | Single      | Lifetime | Extends `MemorySingleCache` with Redis-backed persistence and a pre-defined callback data source. This provides eventual consistency guarantees based on the memory cache lifetime.                                                                                        |
| `QuantumKVCache`    | Key-Value | Immediate   | None        | Callback    | Multiple    | Lifetime | Combines `MemoryKVCache` with a pre-defined callback data source and immediate consistency via Redis sync events. The implementation offers multi-item batch overloads for efficient bulk operations. **This is the recommended cache implementation for most use cases.** |

Key-Value caches store multiple entries per cache, while Single caches
store a single value that can be accessed directly.  Consistency
refers to the consistency of cached data between different processes
in the instance cluster: "None" means no consistency guarantees,
"Eventual" caches will gradually become consistent after some unknown
time, and "Immediate" consistency ensures accurate data ASAP after the
update.  Caches with persistence can retain their data after a reboot
through an external service such as Redis.  If a data source is
supported, then this allows the cache to directly load missing data in
response to a fetch.  "Caller" data sources are passed into the fetch
method(s) directly, while "Callback" sources are passed in as a
function when the cache is first initialized.  The cardinality of a
cache refers to the number of items that can be updated in a single
operation, and eviction, finally, is the method that the cache uses to
evict stale data.

#### Selecting a cache implementation

For most cache uses, `QuantumKVCache` should be considered first. It
offers strong consistency guarantees, multiple cardinality, and a
cleaner API surface than the older caches.

An alternate cache implementation should be considered if any of the
following apply:

- The data is particularly slow to calculate or difficult to
  access. In these cases, either `RedisKVCache` or `RedisSingleCache`
  should be considered.

- If stale data is acceptable, then consider `MemoryKVCache` or
  `MemorySingleCache`. These synchronous implementations have much
  less overhead than the other options.

- There is only one data item, or all data items must be fetched
  together. Using `MemorySingleCache` or `RedisSingleCache` could
  provide a cleaner implementation without resorting to hacks like a
  fixed key.

- It's necessary to use `null` as a data value.
  `QuantumKVCache` does not allow null values, and thus another option should be chosen.

### Inter-Process Communication

Sharkey can utilize multiple processes for a single server.
When running in this mode, a mechanism to synchronization changes between each process is necessary.
This is accomplished through the use of **Redis IPC**.

#### IPC Options

There are three methods to access this IPC system, all of which are available through Dependency Injection:
* Using the `pub` and `sub` Redis instances to directly establish channels.
  This should only be done when necessary, like when implementing very low-level utilities.
* The `publishInternalEvent` method of `GlobalEventService`.
  This method will asynchronously publish an event to redis, which will forward it to all connected processes - **including the sending process**.
  Due to this and other issues, `publishInternalEvent` should be considered obsolete and avoided in new code.
  Instead, consider one of the other options.
* `InternalEventService`, which is the newest and recommended way to handle IPC.
  The `emit` method accepts arguments identical to `publishInternalEvent`, which eases migration, while also accepting a configuration object to control event propagation.
  Additionally, `InternalEventService` ensures that local event listeners are called *before* notifying other processes, avoiding potential data races and other weirdness.

#### When to use IPC

IPC should be used whenever cacheable data is modified.
By cacheable, we mean any data that could be stored in any of the supported memory caches.
Changes to `MiUser`, `MiUserProfile`, or `MiInstance` entities should **always** be considered cacheable, but these are not the only options.
A major exception is when the local data is cached in a Quantum cache (`QuantumKVCache`).
Quantum caches automatically call `InternalEventService.emit` to synchronize changes, so you only need to `await set()` and the changes will be reflected in other processes' caches too.
