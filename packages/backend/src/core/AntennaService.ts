/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import * as Acct from '@/misc/acct.js';
import type { Packed } from '@/misc/json-schema.js';
import type { AntennasRepository, UserListMembershipsRepository } from '@/models/_.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { promiseMap } from '@/misc/promise-map.js';
import { CacheService } from './CacheService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class AntennaService implements OnApplicationShutdown {
	// TODO implement QuantumSingleCache then replace this
	private antennasFetched: boolean;
	private antennas: Map<string, MiAntenna>;

	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private cacheService: CacheService,
		private utilityService: UtilityService,
		private globalEventService: GlobalEventService,
		private fanoutTimelineService: FanoutTimelineService,
		private readonly internalEventService: InternalEventService,
	) {
		this.antennasFetched = false;
		this.antennas = new Map();

		this.redisForSub.on('message', this.onRedisMessage);
	}

	@bindThis
	private async onRedisMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'antennaCreated':
				case 'antennaUpdated':
					this.antennas.set(body.id, { // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
						...body,
						lastUsedAt: new Date(body.lastUsedAt),
						user: null, // joinなカラムは通常取ってこないので
						userList: null, // joinなカラムは通常取ってこないので
					});
					break;
				case 'antennaDeleted':
					this.antennas.delete(body.id);
					break;
				default:
					break;
			}
		}
	}

	@bindThis
	public async updateAntenna(id: string, data: Partial<MiAntenna>) {
		await this.antennasRepository.update({ id }, data);

		const antenna = this.antennas.get(id) ?? await this.antennasRepository.findOneBy({ id });
		if (antenna) {
			// This will be handled above to save result
			await this.internalEventService.emit('antennaUpdated', {
				...antenna,
				...data,
			});
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
			this.fanoutTimelineService.push(`antennaTimeline:${antenna.id}`, note.id, 200, redisPipeline);
			this.globalEventService.publishAntennaStream(antenna.id, 'note', note);
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
			const followings = await this.cacheService.userFollowingsCache.fetch(antenna.userId);
			const isFollowing = followings.has(note.userId);
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
			this.globalEventService.publishInternalEvent('antennaUpdated', newAntenna);
		}
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onRedisMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
