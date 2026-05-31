/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module, type Import } from '@nestjs/common';
import { ServerModule } from '@/server/ServerModule.js';

/** External module dependencies */
const $Imports = [
	ServerModule,
] as const satisfies Import[];

@Module({
	imports: $Imports,
	exports: [$Imports].flat(),
})
export class MainModule {}
