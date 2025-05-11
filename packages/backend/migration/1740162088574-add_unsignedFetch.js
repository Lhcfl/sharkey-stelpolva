import { loadConfig } from '../built/config.js';

export class AddUnsignedFetch1740162088574 {
	name = 'AddUnsignedFetch1740162088574'

	async up(queryRunner) {
		// meta.allowUnsignedFetch
		await queryRunner.query(`CREATE TYPE "public"."meta_allowunsignedfetch_enum" AS ENUM('never', 'always', 'essential')`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "allowUnsignedFetch" "public"."meta_allowunsignedfetch_enum" NOT NULL DEFAULT 'always'`);

		// user.allowUnsignedFetch
		await queryRunner.query(`CREATE TYPE "public"."user_allowunsignedfetch_enum" AS ENUM('never', 'always', 'essential', 'staff')`);
		await queryRunner.query(`ALTER TABLE "user" ADD "allowUnsignedFetch" "public"."user_allowunsignedfetch_enum" NOT NULL DEFAULT 'staff'`);

		// Special one-time migration: allow unauthorized fetch for system accounts
		await queryRunner.query(`UPDATE "user" SET "allowUnsignedFetch" = 'always' WHERE "username" LIKE '%.%' AND "host" IS null`);

		// Special one-time migration: convert legacy config "" to meta setting ""
		const config = await loadConfig();
		if (config.checkActivityPubGetSignature) {
			// noinspection SqlWithoutWhere
			await queryRunner.query(`UPDATE "meta" SET "allowUnsignedFetch" = 'never'`);
		}
	}

	async down(queryRunner) {
		// user.allowUnsignedFetch
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "allowUnsignedFetch"`);
		await queryRunner.query(`DROP TYPE "public"."user_allowunsignedfetch_enum"`);

		// meta.allowUnsignedFetch
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "allowUnsignedFetch"`);
		await queryRunner.query(`DROP TYPE "public"."meta_allowunsignedfetch_enum"`);
	}
}
