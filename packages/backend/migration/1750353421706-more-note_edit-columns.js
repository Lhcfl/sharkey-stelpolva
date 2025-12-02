/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MoreNoteEditColumns1750353421706 {
	name = 'MoreNoteEditColumns1750353421706'

	async up(queryRunner) {
		// Update column types
		await queryRunner.query(`ALTER TABLE "note_edit" ALTER COLUMN "cw" TYPE text USING "cw"::text`);

		// Rename columns
		await queryRunner.query(`ALTER TABLE "note_edit" RENAME COLUMN "oldText" TO "text"`);
		await queryRunner.query(`ALTER TABLE "note_edit" RENAME COLUMN "cw" TO "newCw"`);

		// Add new fields
		await queryRunner.query(`ALTER TABLE "note_edit" ADD "userId" character varying(32)`);
		await queryRunner.query(`COMMENT ON COLUMN "note_edit"."userId" IS 'The ID of author.'`);
		await queryRunner.query(`ALTER TABLE "note_edit" ADD CONSTRAINT "FK_7f1ded0f6e8a5bef701b7e698ab" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

		await queryRunner.query(`ALTER TABLE "note_edit" ADD "renoteId" character varying(32)`);
		await queryRunner.query(`COMMENT ON COLUMN "note_edit"."renoteId" IS 'The ID of renote target. Will always be null for older edits'`);
		await queryRunner.query(`ALTER TABLE "note_edit" ADD CONSTRAINT "FK_d3003e5256bcbfad6c3588835c0" FOREIGN KEY ("renoteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

		await queryRunner.query(`ALTER TABLE "note_edit" ADD "replyId" character varying(32)`);
		await queryRunner.query(`COMMENT ON COLUMN "note_edit"."replyId" IS 'The ID of reply target. Will always be null for older edits'`);
		await queryRunner.query(`ALTER TABLE "note_edit" ADD CONSTRAINT "FK_f34b53ab9b39774ca014972ad84" FOREIGN KEY ("replyId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

		await queryRunner.query(`ALTER TABLE "note_edit" ADD "visibility" "public"."note_visibility_enum"`);

		await queryRunner.query(`ALTER TABLE "note_edit" ADD "cw" text`);
		await queryRunner.query(`COMMENT ON COLUMN "note_edit"."cw" IS 'Will always be null for older edits'`);

		await queryRunner.query(`ALTER TABLE "note_edit" ADD "hasPoll" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`COMMENT ON COLUMN "note_edit"."hasPoll" IS 'Whether this revision had a poll. Will always be false for older edits'`);

		// Populate non-nullable fields
		await queryRunner.query(`
			UPDATE "note_edit" "e"
			SET
				"visibility" = "n"."visibility",
				"userId" = "n"."userId"
			FROM "note" "n"
			WHERE "n"."id" = "e"."noteId"
		`);
		await queryRunner.query(`ALTER TABLE "note_edit" ALTER COLUMN "visibility" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "note_edit" ALTER COLUMN "userId" SET NOT NULL`);
	}

	async down(queryRunner) {
		// Drop new columns
		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "visibility"`);
		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "hasPoll"`);
		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "cw"`);

		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "userId"`);

		await queryRunner.query(`ALTER TABLE "note_edit" DROP CONSTRAINT "FK_f34b53ab9b39774ca014972ad84"`);
		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "replyId"`);

		await queryRunner.query(`ALTER TABLE "note_edit" DROP CONSTRAINT "FK_d3003e5256bcbfad6c3588835c0"`);
		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "renoteId"`);

		await queryRunner.query(`ALTER TABLE "note_edit" DROP CONSTRAINT "FK_7f1ded0f6e8a5bef701b7e698ab"`);
		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "userId"`);

		// Rename new columns
		await queryRunner.query(`ALTER TABLE "note_edit" RENAME COLUMN "text" TO "oldText"`);
		await queryRunner.query(`ALTER TABLE "note_edit" RENAME COLUMN "newCw" TO "cw"`);

		// Revert column types
		await queryRunner.query(`ALTER TABLE "note_edit" ALTER COLUMN "cw" TYPE varchar(512) USING "cw"::varchar(512)`);
	}
}
