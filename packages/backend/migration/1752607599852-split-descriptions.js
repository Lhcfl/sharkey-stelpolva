export class SplitDescriptions1752607599852 {
	name = 'SplitDescriptions1752607599852'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN "about" TEXT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "about"`);
	}
}
