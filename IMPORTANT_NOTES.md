# Basic Precautions

When using a service with Sharkey, there are several important points to keep in mind.

1. Because it is decentralized, there is no guarantee that data you upload will be deleted from all other servers even if you delete it once. (However, this applies to the internet in general.)

2. Even for posts made in private, there is no guarantee that the recipient's server will treat them as private in the same way. Please exercise caution when posting personal or confidential information. (Again, this applies to the internet in general.)

3. The "Drive" feature is NOT secure cloud storage. This feature exists for easier managing of your uploaded files.
Any data uploaded, whether shared via post or not, will be publicly accessible. Please use 3rd party cloud storage providers if you need to upload data with sensitive information of any kind. 

4. Account deletion can be a resource-intensive process and may take a long time. In cases with a lot of uploaded data, it may even be impossible to delete an account.

5. Please disable ad blockers. Some servers may rely on advertising revenue to cover operating costs. Additionally, ad blockers can mistakenly block content and features unrelated to ads, potentially causing issues with the client's functionality and preventing normal use of Sharkey. Therefore, we recommend turning off ad blockers and similar features when using Sharkey.

Please understand these points and enjoy using the service.

# Upgrade Notes

## 2024.9.0

### Following Feed

When upgrading an existing instance to version 2024.9.0, the Following Feed will initially be empty.
The feed will gradually fill as new posts federate, but it may be desirable to back-fill the feed with existing data.
This database script will populate the feed with the latest post of each type for all users, ensuring that data is fully populated after the update.
Run this after migrations but before starting the instance.
Warning: the script may take a long time to execute! 

```postgresql
INSERT INTO latest_note (user_id, note_id, is_public, is_reply, is_quote)
SELECT
	"userId" as user_id,
	id as note_id,
	visibility = 'public' AS is_public,
	"replyId" IS NOT NULL AS is_reply,
	(
		"renoteId" IS NOT NULL
			AND (
			text IS NOT NULL
				OR cw IS NOT NULL
				OR "replyId" IS NOT NULL
				OR "hasPoll"
				OR "fileIds" != '{}'
			)
		) AS is_quote
FROM note
WHERE ( -- Exclude pure renotes (boosts)
				"renoteId" IS NULL
					OR text IS NOT NULL
					OR cw IS NOT NULL
					OR "replyId" IS NOT NULL
					OR "hasPoll"
					OR "fileIds" != '{}'
				)
ORDER BY id DESC -- This part is very important: it ensures that we only load the *latest* notes of each type. Do not remove it!
ON CONFLICT DO NOTHING; -- Any conflicts are guaranteed to be older notes that we can ignore.
```
