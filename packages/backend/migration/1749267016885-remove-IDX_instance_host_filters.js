/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveIDXInstanceHostFilters1749267016885 {
	name = 'RemoveIDXInstanceHostFilters1749267016885';

	async up(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_instance_host_filters"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`
			create index "IDX_instance_host_filters"
			on "instance" ("host", "isBlocked", "isSilenced", "isMediaSilenced", "isAllowListed", "isBubbled", "suspensionState")`);
		await queryRunner.query(`comment on index "IDX_instance_host_filters" is 'Covering index for host filter queries'`);
	}
}
