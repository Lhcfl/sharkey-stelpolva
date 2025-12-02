/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixIDXInstanceHostKey1748990662839 {
	name = 'FixIDXInstanceHostKey1748990662839';

	async up(queryRunner) {
		// must include host for index-only scans: https://www.postgresql.org/docs/current/indexes-index-only-scans.html
		await queryRunner.query(`DROP INDEX "public"."IDX_instance_host_key"`);
		await queryRunner.query(`
			create index "IDX_instance_host_key"
			on "instance" ((lower(reverse("host"::text)) || '.'::text) text_pattern_ops)
			include ("host")
		`);
		await queryRunner.query(`comment on index "IDX_instance_host_key" is 'Expression index for finding instances by base domain'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_instance_host_key"`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_instance_host_key" ON "instance" (((lower(reverse("host")) || '.')::text) text_pattern_ops)`);
	}
}
