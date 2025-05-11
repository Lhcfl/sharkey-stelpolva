export class IndexUserNullDistinct1746813431756 {
	name = 'Indexusernulldistinct1746813431756'

	async up(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_5deb01ae162d1d70b80d064c27"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5deb01ae162d1d70b80d064c27" ON "user" ("usernameLower", "host") NULLS NOT DISTINCT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_5deb01ae162d1d70b80d064c27"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5deb01ae162d1d70b80d064c27" ON "user" ("usernameLower", "host") `);
	}
}
