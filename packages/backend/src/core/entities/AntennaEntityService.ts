/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { AntennasRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiAntenna } from '@/models/Antenna.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class AntennaEntityService {
	constructor(
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private idService: IdService,
	) {
	}

	@bindThis
	public async packMany(
		sources: (string | MiAntenna)[],
	): Promise<Packed<'Antenna'>[]> {
		const antennas: MiAntenna[] = [];
		const toFetch: string[] = [];

		for (const src of sources) {
			if (typeof(src) === 'string') {
				toFetch.push(src);
			} else {
				antennas.push(src);
			}
		}

		if (toFetch.length > 0) {
			const fetched = await this.antennasRepository.findBy({ id: In(toFetch) });
			for (const antenna of fetched) {
				antennas.push(antenna);
			}
		}

		return antennas.map(antenna => this.packInternal(antenna));
	}

	@bindThis
	public async pack(
		src: MiAntenna['id'] | MiAntenna,
	): Promise<Packed<'Antenna'>> {
		const antenna = typeof src === 'object' ? src : await this.antennasRepository.findOneByOrFail({ id: src });
		return this.packInternal(antenna);
	}

	private packInternal(antenna: MiAntenna): Packed<'Antenna'> {
		return {
			id: antenna.id,
			createdAt: this.idService.parse(antenna.id).date.toISOString(),
			name: antenna.name,
			keywords: antenna.keywords,
			excludeKeywords: antenna.excludeKeywords,
			src: antenna.src,
			userListId: antenna.userListId,
			users: antenna.users,
			caseSensitive: antenna.caseSensitive,
			localOnly: antenna.localOnly,
			excludeBots: antenna.excludeBots,
			withReplies: antenna.withReplies,
			withFile: antenna.withFile,
			excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
			isActive: antenna.isActive,
			hasUnreadNote: false, // TODO
			notify: false, // 後方互換性のため
		};
	}
}
