/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixMetaUrlPreviewUserAgentDefault1747938263980 {
	name = 'FixMetaUrlPreviewUserAgentDefault1747938263980'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "urlPreviewUserAgent" DROP DEFAULT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "urlPreviewUserAgent" SET DEFAULT NULL`);
	}
}
