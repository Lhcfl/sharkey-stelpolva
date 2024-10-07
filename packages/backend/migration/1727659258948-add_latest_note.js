/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddLatestNote1727659258948 {
	name = 'AddLatestNote1727659258948';

	async up(queryRunner) {
		await queryRunner.query('CREATE TABLE "latest_note" ("user_id" character varying(32) NOT NULL, "note_id" character varying(32) NOT NULL, CONSTRAINT "PK_f619b62bfaafabe68f52fb50c9a" PRIMARY KEY ("user_id"))');
		await queryRunner.query('ALTER TABLE "latest_note" ADD CONSTRAINT "FK_20e346fffe4a2174585005d6d80" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
		await queryRunner.query('ALTER TABLE "latest_note" ADD CONSTRAINT "FK_47a38b1c13de6ce4e5090fb1acd" FOREIGN KEY ("note_id") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "latest_note" DROP CONSTRAINT "FK_47a38b1c13de6ce4e5090fb1acd"');
		await queryRunner.query('ALTER TABLE "latest_note" DROP CONSTRAINT "FK_20e346fffe4a2174585005d6d80"');
		await queryRunner.query('DROP TABLE "latest_note"');
	}
}
