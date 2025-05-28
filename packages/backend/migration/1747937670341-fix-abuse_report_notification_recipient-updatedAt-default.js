/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixAbuseReportNotificationRecipientUpdatedAtDefault1747937670341 {
	name = 'FixAbuseReportNotificationRecipientUpdatedAtDefault1747937670341'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "abuse_report_notification_recipient" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "abuse_report_notification_recipient" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
	}
}
