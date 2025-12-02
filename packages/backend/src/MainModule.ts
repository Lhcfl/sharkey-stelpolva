/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { ServerModule } from '@/server/ServerModule.js';
import { DaemonModule } from '@/daemons/DaemonModule.js';

@Module({
	imports: [
		ServerModule,
		DaemonModule,
	],
})
export class MainModule {}
