/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMetaEnableProxyAccount1746029830779 {
	name = 'AddMetaEnableProxyAccount1746029830779'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableProxyAccount" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableProxyAccount"`);
	}
}
