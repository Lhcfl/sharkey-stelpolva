/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixSystemWebhookUpdatedAtDefault1747937504140 {
    name = 'FixSystemWebhookUpdatedAtDefault1747937504140'

    async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "system_webhook" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
		}

    async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "system_webhook" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
		}
}
