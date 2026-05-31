/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
export class AddUserDeletedAt1774625336796 {
	name = 'AddUserDeletedAt1774625336796'

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."deletedAt" IS 'When the account was deleted.'`);
	}

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deletedAt"`);
	}
}
