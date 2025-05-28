/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddEntityComments1747935197708 {
	name = 'AddEntityComments1747935197708'

	async up(queryRunner) {
		await queryRunner.query(`COMMENT ON COLUMN "user"."backgroundId" IS 'The ID of background DriveFile.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."isSilenced" IS 'Whether the User is silenced.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."noindex" IS 'Whether the User''s notes dont get indexed.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."speakAsCat" IS 'Whether the User speaks in nya.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."listenbrainz" IS 'The ListenBrainz username of the User.'`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAt" IS 'The update time of the Note.'`);
		await queryRunner.query(`COMMENT ON COLUMN "meta"."trustedLinkUrlPatterns" IS 'An array of URL strings or regex that can be used to omit warnings about redirects to external sites. Separate them with spaces to specify AND, and enclose them with slashes to specify regular expressions. Each item is regarded as an OR.'`);
		await queryRunner.query(`COMMENT ON COLUMN "note_edit"."oldDate" IS 'The old date from before the edit'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`COMMENT ON COLUMN "note_edit"."oldDate" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "meta"."trustedLinkUrlPatterns" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAt" IS 'The updated date of the Note.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."listenbrainz" IS 'listenbrainz username to fetch currently playing.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."speakAsCat" IS 'Whether to speak as a cat if chosen.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."noindex" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."isSilenced" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."backgroundId" IS NULL`);
	}
}
