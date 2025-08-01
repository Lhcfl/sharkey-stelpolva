/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChangeChatMessageTextType1753574755478 {
	name = 'ChangeChatMessageTextType1753574755478'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" ALTER COLUMN "text" TYPE text`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" ALTER COLUMN "text" TYPE varchar(4096)`);
	}
}
