/*
 * SPDX-FileCopyrightText: bunnybeam and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AnnouncementConfetti1751912435779 {
  async up(queryRunner) {
    await queryRunner.query(`ALTER TABLE "announcement" ADD "confetti" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE INDEX "IDX_94aabe9f742bc9808264a1c97c" ON "announcement" ("confetti") `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX "public"."IDX_94aabe9f742bc9808264a1c97c"`);
    await queryRunner.query(`ALTER TABLE "announcement" DROP COLUMN "confetti"`);
  }
}
