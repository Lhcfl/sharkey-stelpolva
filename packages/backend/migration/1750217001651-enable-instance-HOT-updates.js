/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// https://www.cybertec-postgresql.com/en/hot-updates-in-postgresql-for-better-performance/

/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
export class EnableInstanceHOTUpdates1750217001651 {
	name = 'EnableInstanceHOTUpdates1750217001651';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "instance" SET (fillfactor = 50)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "instance" SET (fillfactor = 100)`);
	}
}
