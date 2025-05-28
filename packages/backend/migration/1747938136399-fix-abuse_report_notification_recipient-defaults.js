/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixAbuseReportNotificationRecipientDefaults1747938136399 {
	name = 'FixAbuseReportNotificationRecipientDefaults1747938136399'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "abuse_report_notification_recipient" ALTER COLUMN "userId" DROP DEFAULT`);
		await queryRunner.query(`ALTER TABLE "abuse_report_notification_recipient" ALTER COLUMN "systemWebhookId" DROP DEFAULT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "abuse_report_notification_recipient" ALTER COLUMN "systemWebhookId" SET DEFAULT NULL`);
		await queryRunner.query(`ALTER TABLE "abuse_report_notification_recipient" ALTER COLUMN "userId" SET DEFAULT NULL`);
	}
}
