/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class TrackLatestNoteType1728420772835 {
    name = 'TrackLatestNoteType1728420772835'

    async up(queryRunner) {
				await queryRunner.query(`ALTER TABLE "latest_note" DROP CONSTRAINT "PK_f619b62bfaafabe68f52fb50c9a"`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD "isPublic" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD "isReply" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD "isQuote" boolean NOT NULL DEFAULT false`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD CONSTRAINT "PK_a44ac8ca9cb916faeefc0912abd" PRIMARY KEY ("user_id", "isPublic", "isReply", "isQuote")`);
		}

    async down(queryRunner) {
				await queryRunner.query(`ALTER TABLE "latest_note" DROP CONSTRAINT "PK_a44ac8ca9cb916faeefc0912abd"`);
				await queryRunner.query(`ALTER TABLE "latest_note" DROP COLUMN "isQuote"`);
				await queryRunner.query(`ALTER TABLE "latest_note" DROP COLUMN "isReply"`);
				await queryRunner.query(`ALTER TABLE "latest_note" DROP COLUMN "isPublic"`);
				await queryRunner.query(`ALTER TABLE "latest_note" ADD CONSTRAINT "PK_f619b62bfaafabe68f52fb50c9a" PRIMARY KEY ("user_id")`);
		}
}
