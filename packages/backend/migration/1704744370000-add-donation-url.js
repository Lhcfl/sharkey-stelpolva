export class AddDonationUrl1704744370000 {
    name = 'AddDonationUrl1704744370000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "donationUrl" character varying(1024)`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "donationUrl"`);
    }
}
