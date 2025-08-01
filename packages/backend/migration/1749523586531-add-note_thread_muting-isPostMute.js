/**
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddNoteThreadMutingIsPostMute1749523586531 {
    name = 'AddNoteThreadMutingIsPostMute1749523586531'

    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_ae7aab18a2641d3e5f25e0c4ea"`);
        await queryRunner.query(`ALTER TABLE "note_thread_muting" ADD "isPostMute" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "note_thread_muting"."isPostMute" IS 'If true, then this mute applies only to the referenced note. If false (default), then it applies to all replies as well.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_01f7ab05099400012e9a7fd42b" ON "note_thread_muting" ("userId", "threadId", "isPostMute") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_01f7ab05099400012e9a7fd42b"`);
        await queryRunner.query(`COMMENT ON COLUMN "note_thread_muting"."isPostMute" IS 'If true, then this mute applies only to the referenced note. If false (default), then it applies to all replies as well.'`);
        await queryRunner.query(`ALTER TABLE "note_thread_muting" DROP COLUMN "isPostMute"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ae7aab18a2641d3e5f25e0c4ea" ON "note_thread_muting" ("userId", "threadId") `);
    }
}
