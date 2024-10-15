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
