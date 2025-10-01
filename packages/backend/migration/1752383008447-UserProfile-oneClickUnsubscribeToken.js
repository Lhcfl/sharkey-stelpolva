/*
 * SPDX-FileCopyrightText: наб and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { nanoid } from 'nanoid';

export class UserProfileOneClickUnsubscribeToken1752383008447 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "oneClickUnsubscribeToken" TEXT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "oneClickUnsubscribeToken"`);
	}
}
