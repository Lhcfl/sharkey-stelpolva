/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class TrackLatestNoteType1728420772835 {
    name = 'TrackLatestNoteType1728420772835'

    async up(queryRunner) {
				await queryRunner.query(`ALTER TABLE "latest_note" DROP CONSTRAINT "PK_f619b62bfaafabe68f52fb50c9a"`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD "is_public" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD "is_reply" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD "is_quote" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD CONSTRAINT "PK_a44ac8ca9cb916faeefc0912abd" PRIMARY KEY ("user_id", is_public, is_reply, is_quote)`);
		}

    async down(queryRunner) {
				await queryRunner.query(`ALTER TABLE "latest_note" DROP CONSTRAINT "PK_a44ac8ca9cb916faeefc0912abd"`);
				await queryRunner.query(`ALTER TABLE "latest_note" DROP COLUMN is_quote`);
				await queryRunner.query(`ALTER TABLE "latest_note" DROP COLUMN is_reply`);
				await queryRunner.query(`ALTER TABLE "latest_note" DROP COLUMN is_public`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD CONSTRAINT "PK_f619b62bfaafabe68f52fb50c9a" PRIMARY KEY ("user_id")`);
		}
}
