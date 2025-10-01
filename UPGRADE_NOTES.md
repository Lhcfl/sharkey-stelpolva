# Upgrade Notes

## 2025.5.2

### Mark instance as NSFW

The "Mark instance as NSFW" has been removed in favor of the new "mandatory CW" / "force CW" system.
Moderators can now apply any Content Warning of their choice to all notes from an instance by populating the "Force content warning" field on that instance's info page.
The new Content Warning applies immediately, is retroactive, and does not federate or "infect" replies in a thread.

The upgrade will automatically set a content warning of "NSFW" for instances that were formerly marked as NSFW, which displays as `[instance name] is flagged: "NSFW"` to users.
The `notes` table is also cleaned up to remove any leftover "Instance is marked as NSFW" content warnings from posts.
Staff can then remove or modify the new CW as usual.

## 2025.2.2

### Authorized Fetch

This version retires the configuration entry `checkActivityPubGetSignature`, which is now replaced with the new "Authorized Fetch" settings under Control Panel/Security.
The database migrations will automatically import the value of this configuration file, but it will never be read again after upgrading.
To avoid confusion and possible mis-configuration, please remove the entry **after** completing the upgrade.
Do not remove it before migration, or else the setting will reset to default (disabled)!

## 2024.10.0

### Hellspawns

**Note: this workaround is no longer needed on Sharkey version 2025.5.2 and later, as "Mark instance as NSFW" has been completely rewritten.**

Sharkey versions before 2024.10 suffered from a bug in the "Mark instance as NSFW" feature.
When a user from such an instance boosted a note, the boost would be converted to a hellspawn (pure renote with Content Warning).
Hellspawns are buggy and do not properly federate, so it may be desirable to correct any that already exist in the database.
The following script will correct any local or remote hellspawns in the database.

```postgresql
/* Remove "instance is marked as NSFW" hellspawns */
UPDATE "note"
SET "cw" = null
WHERE
	"renoteId" IS NOT NULL
	AND "text" IS NULL
	AND "cw" = 'Instance is marked as NSFW'
	AND "replyId" IS NULL
	AND "hasPoll" = false
	AND "fileIds" = '{}';

/* Fix legacy / user-created hellspawns */
UPDATE "note"
SET "text" = '.'
WHERE
	"renoteId" IS NOT NULL
	AND "text" IS NULL
	AND "cw" IS NOT NULL
	AND "replyId" IS NULL
	AND "hasPoll" = false
	AND "fileIds" = '{}';
```

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
