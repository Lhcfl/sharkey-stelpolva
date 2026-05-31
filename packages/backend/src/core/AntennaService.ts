/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { promiseMap } from '@/misc/promise-map.js';
import { DI } from '@/di-symbols.js';
import * as Acct from '@/misc/acct.js';
import type { Packed } from '@/misc/json-schema.js';
import type { AntennasRepository } from '@/models/_.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { InternalEventService, type InternalEventTypes } from '@/global/InternalEventService.js';
import { CacheService } from './CacheService.js';

@Injectable()
export class AntennaService implements OnModuleInit, OnApplicationShutdown {
	// TODO implement QuantumSingleCache then replace this
	// TODO or implement QuantumKVCache.populate() and allow infinite lifetimes?
	private antennasFetched = false;
	private antennas = new Map<string, MiAntenna>();

	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private cacheService: CacheService,
		private utilityService: UtilityService,
		private globalEventService: GlobalEventService,
		private fanoutTimelineService: FanoutTimelineService,
		private readonly internalEventService: InternalEventService,
	) {}

	@bindThis
	private async onAntennaEvent<E extends 'antennaCreated' | 'antennaUpdated' | 'antennaDeleted'>(body: InternalEventTypes[E], type: E): Promise<void> {
		{
			{
				if (type !== 'antennaDeleted') {
					this.antennas.set(body.id, { // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
						...body,
						lastUsedAt: new Date(body.lastUsedAt),
						user: null, // joinなカラムは通常取ってこないので
						userList: null, // joinなカラムは通常取ってこないので
					});
				} else {
					this.antennas.delete(body.id);
				}
			}
		}
	}

	@bindThis
	public async updateAntenna(id: string, data: Partial<MiAntenna>) {
		await this.antennasRepository.update({ id }, data);
		await this.refreshAntenna(id);
	}

	@bindThis
	public async refreshAntenna(id: string): Promise<void> {
		const antenna = await this.antennasRepository.findOneBy({ id });
		if (antenna) {
			// This will be handled above to cache result
			await this.internalEventService.emit('antennaUpdated', antenna);
		}
	}

	@bindThis
	public async addNoteToAntennas(note: MiNote, noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean; }): Promise<void> {
		const antennas = await this.getAntennas();
		const antennasWithMatchResult = await promiseMap(antennas, async antenna => {
			const hit = await this.checkHitAntenna(antenna, note, noteUser);
			return [antenna, hit] as const;
		});
		const matchedAntennas = antennasWithMatchResult.filter(([, hit]) => hit).map(([antenna]) => antenna);

		const redisPipeline = this.redisForTimelines.pipeline();

		for (const antenna of matchedAntennas) {
			await this.fanoutTimelineService.push(`antennaTimeline:${antenna.id}`, note.id, 200, redisPipeline);
			await this.globalEventService.publishAntennaStream(antenna.id, 'note', note);
		}

		await redisPipeline.exec();
	}

	// NOTE: フォローしているユーザーのノート、リストのユーザーのノート、グループのユーザーのノート指定はパフォーマンス上の理由で無効になっている

	@bindThis
	public async checkHitAntenna(antenna: MiAntenna, note: (MiNote | Packed<'Note'>), noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean; }): Promise<boolean> {
		if (antenna.excludeNotesInSensitiveChannel && note.channel?.isSensitive) return false;

		if (antenna.excludeBots && noteUser.isBot) return false;

		if (antenna.localOnly && noteUser.host != null) return false;

		if (!antenna.withReplies && note.replyId != null) return false;

		if (note.visibility === 'specified') {
			if (note.userId !== antenna.userId) {
				if (note.visibleUserIds == null) return false;
				if (!note.visibleUserIds.includes(antenna.userId)) return false;
			}
		}

		if (note.visibility === 'followers') {
			const isFollowing = await this.cacheService.isFollowing(antenna.userId, note.userId);
			if (!isFollowing && antenna.userId !== note.userId) return false;
		}

		if (antenna.src === 'home') {
			// TODO
		} else if (antenna.src === 'list') {
			if (antenna.userListId == null) return false;
			const memberships = await this.cacheService.userListMembershipsCache.fetch(note.userId);
			const exists = memberships.has(antenna.userListId);
			if (!exists) return false;
		} else if (antenna.src === 'users') {
			const accts = antenna.users.map(x => {
				const { username, host } = Acct.parse(x);
				return this.utilityService.getFullApAccount(username, host).toLowerCase();
			});
			const matchUser = this.utilityService.getFullApAccount(noteUser.username, noteUser.host).toLowerCase();
			const matchWildcard = this.utilityService.getFullApAccount('*', noteUser.host).toLowerCase();
			if (!accts.includes(matchUser) && !accts.includes(matchWildcard)) return false;
		} else if (antenna.src === 'users_blacklist') {
			const accts = antenna.users.map(x => {
				const { username, host } = Acct.parse(x);
				return this.utilityService.getFullApAccount(username, host).toLowerCase();
			});
			const matchUser = this.utilityService.getFullApAccount(noteUser.username, noteUser.host).toLowerCase();
			const matchWildcard = this.utilityService.getFullApAccount('*', noteUser.host).toLowerCase();
			if (accts.includes(matchUser) || accts.includes(matchWildcard)) return false;
		}

		const keywords = antenna.keywords
			// Clean up
			.map(xs => xs.filter(x => x !== ''))
			.filter(xs => xs.length > 0);
		const excludeKeywords = antenna.excludeKeywords
			// Clean up
			.map(xs => xs.filter(x => x !== ''))
			.filter(xs => xs.length > 0);

		const _text = ((note.text ?? '') + '\n' + (note.cw ?? '')).trim();

		const checkMatch = (keyword: string) => {
			const [specialRule, data] = keyword.split(':');
			switch (specialRule) {
				case 'domain': {
					const host = noteUser.host;
					if (host == null) {
						return data === 'here';
					} else {
						return host === data;
					}
				}
				default:{
					return antenna.caseSensitive
						? _text.includes(keyword)
						: _text.toLowerCase().includes(keyword.toLowerCase());
				}
			}
		};

		if (keywords.length > 0) {
			if (!_text) return false;
			const matched = keywords.some(and => and.every(checkMatch));
			if (!matched) return false;
		}

		if (excludeKeywords.length > 0 && _text) {
			const matched = excludeKeywords.some(and => and.every(checkMatch));
			if (matched) return false;
		}

		if (antenna.withFile) {
			if (note.fileIds && note.fileIds.length === 0) return false;
		}

		// TODO: eval expression

		return true;
	}

	@bindThis
	public async getAntennas() {
		if (!this.antennasFetched) {
			const allAntennas = await this.antennasRepository.findBy({
				isActive: true,
			});
			this.antennas = new Map(allAntennas.map(a => [a.id, a]));
			this.antennasFetched = true;
		}

		return Array.from(this.antennas.values());
	}

	@bindThis
	public async onMoveAccount(src: MiUser, dst: MiUser): Promise<void> {
		// There is a possibility for users to add the srcUser to their antennas, but it's low, so we don't check it.

		// Get MiAntenna[] from cache and filter to select antennas with the src user is in the users list
		const srcUserAcct = this.utilityService.getFullApAccount(src.username, src.host).toLowerCase();
		const antennasToMigrate = (await this.getAntennas()).filter(antenna => {
			return antenna.users.some(user => {
				const { username, host } = Acct.parse(user);
				return this.utilityService.getFullApAccount(username, host).toLowerCase() === srcUserAcct;
			});
		});

		if (antennasToMigrate.length === 0) return;

		const antennaIds = antennasToMigrate.map(x => x.id);

		// Update the antennas by appending dst users acct to the users list
		const dstUserAcct = '@' + Acct.toString({ username: dst.username, host: dst.host });

		await this.antennasRepository.createQueryBuilder('antenna')
			.update()
			.set({
				users: () => 'array_append(antenna.users, :dstUserAcct)',
			})
			.where('antenna.id IN (:...antennaIds)', { antennaIds })
			.setParameters({ dstUserAcct })
			.execute();

		// announce update to event
		for (const newAntenna of await this.antennasRepository.findBy({ id: In(antennaIds) })) {
			await this.internalEventService.emit('antennaUpdated', newAntenna);
		}
	}

	@bindThis
	public onModuleInit(): void {
		this.internalEventService.on('antennaCreated', this.onAntennaEvent);
		this.internalEventService.on('antennaUpdated', this.onAntennaEvent);
		this.internalEventService.on('antennaUpdated', this.onAntennaEvent);
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.internalEventService.off('antennaCreated', this.onAntennaEvent);
		this.internalEventService.off('antennaUpdated', this.onAntennaEvent);
		this.internalEventService.off('antennaUpdated', this.onAntennaEvent);
	}
}
