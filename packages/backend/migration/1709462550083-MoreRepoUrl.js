/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MoreRepoUrl1709462550083 {
  name = 'MoreRepoUrl1709462550083'

  async up(queryRunner) {
    await queryRunner.query(`UPDATE "meta" SET "repositoryUrl"=DEFAULT WHERE "repositoryUrl" IN ('https://git.joinfirefish.org/firefish/firefish','https://codeberg/firefish/firefish','https://codeberg.org/calckey/calckey','https://iceshrimp.dev/iceshrimp/iceshrimp')`);
    await queryRunner.query(`UPDATE "meta" SET "feedbackUrl"=DEFAULT WHERE "feedbackUrl" IN ('https://git.joinfirefish.org/firefish/firefish/issues','https://codeberg/firefish/firefish/issues','https://codeberg.org/calckey/calckey/firefish/firefish/issues','https://iceshrimp.dev/iceshrimp/iceshrimp/issues/new','https://iceshrimp.dev/iceshrimp/iceshrimp/issues')`);
  }

  async down(queryRunner) {
  }
}
