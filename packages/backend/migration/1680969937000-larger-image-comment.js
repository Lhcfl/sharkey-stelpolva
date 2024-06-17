/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class largerImageComment1680969937000 {
    name = 'largerImageComment1680969937000';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "drive_file" ALTER COLUMN "comment" TYPE character varying(8192)`, undefined);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "drive_file" ALTER COLUMN "comment" TYPE character varying(512)`, undefined);
    }

}
