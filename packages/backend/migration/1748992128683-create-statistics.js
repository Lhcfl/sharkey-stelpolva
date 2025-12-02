/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CreateStatistics1748992128683 {
	name = 'CreateStatistics1748992128683';

	async up(queryRunner) {
		await queryRunner.query(`CREATE STATISTICS "STTS_instance_isBlocked_isBubbled" (mcv) ON "isBlocked", "isBubbled" FROM "instance"`);
		await queryRunner.query(`CREATE STATISTICS "STTS_instance_isBlocked_isSilenced" (mcv) ON "isBlocked", "isSilenced" FROM "instance"`);
		await queryRunner.query(`CREATE STATISTICS "STTS_note_replyId_replyUserId_replyUserHost" (dependencies) ON "replyId", "replyUserId", "replyUserHost" FROM "note"`)
		await queryRunner.query(`CREATE STATISTICS "STTS_note_renoteId_renoteUserId_renoteUserHost" (dependencies) ON "renoteId", "renoteUserId", "renoteUserHost" FROM "note"`);
		await queryRunner.query(`CREATE STATISTICS "STTS_note_userId_userHost" (mcv) ON "userId", "userHost" FROM "note"`);
		await queryRunner.query(`CREATE STATISTICS "STTS_note_replyUserId_replyUserHost" (mcv) ON "replyUserId", "replyUserHost" FROM "note"`);
		await queryRunner.query(`CREATE STATISTICS "STTS_note_renoteUserId_renoteUserHost" (mcv) ON "renoteUserId", "renoteUserHost" FROM "note"`);
		await queryRunner.query(`ANALYZE "note", "instance"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP STATISTICS "STTS_instance_isBlocked_isBubbled"`);
		await queryRunner.query(`DROP STATISTICS "STTS_instance_isBlocked_isSilenced"`);
		await queryRunner.query(`DROP STATISTICS "STTS_note_replyId_replyUserId_replyUserHost"`);
		await queryRunner.query(`DROP STATISTICS "STTS_note_renoteId_renoteUserId_renoteUserHost"`);
		await queryRunner.query(`DROP STATISTICS "STTS_note_userId_userHost"`);
		await queryRunner.query(`DROP STATISTICS "STTS_note_replyUserId_replyUserHost"`);
		await queryRunner.query(`DROP STATISTICS "STTS_note_renoteUserId_renoteUserHost"`);
		await queryRunner.query(`ANALYZE "note", "instance"`);
	}
}
