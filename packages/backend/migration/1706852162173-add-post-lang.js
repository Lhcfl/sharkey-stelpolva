export class AddPostLang1706852162173 {
    name = 'AddPostLang1706852162173'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "lang" character varying(10)`);
				await queryRunner.query(`ALTER TABLE "note_edit" ADD "lang" character varying(10)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "lang"`);
				await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "lang"`);
    }
}
