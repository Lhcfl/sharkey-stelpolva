/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RenameFollowingVisibility1747934911491 {
	name = 'RenameFollowingVisibility1747934911491'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TYPE "public"."user_profile_followingvisibility_enum" RENAME TO "user_profile_followingVisibility_enum"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TYPE "public"."user_profile_followingVisibility_enum" RENAME TO "user_profile_followingvisibility_enum"`);
	}
}
