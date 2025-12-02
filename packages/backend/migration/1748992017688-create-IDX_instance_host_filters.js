/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CreateIDXInstanceHostFilters1748992017688 {
	name = 'CreateIDXInstanceHostFilters1748992017688';

	async up(queryRunner) {
		await queryRunner.query(`
			create index "IDX_instance_host_filters"
			on "instance" ("host", "isBlocked", "isSilenced", "isMediaSilenced", "isAllowListed", "isBubbled", "suspensionState")`);
		await queryRunner.query(`comment on index "IDX_instance_host_filters" is 'Covering index for host filter queries'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_instance_host_filters"`);
	}
}
