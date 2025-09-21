export class StpvCreatePgroonga1727538349222 {
	name = "StpvCreatePgroonga1727538349222";

	async up(queryRunner) {
		await queryRunner.query(
			`CREATE EXTENSION IF NOT EXISTS pgroonga`,
		);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP EXTENSION IF EXISTS pgroonga`);
	}
}
