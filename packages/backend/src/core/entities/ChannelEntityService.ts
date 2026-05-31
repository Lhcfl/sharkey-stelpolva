/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ChannelFavoritesRepository, ChannelFollowingsRepository, ChannelsRepository, DriveFilesRepository, NotesRepository, MiDriveFile } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/User.js';
import type { MiChannel } from '@/models/Channel.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';
import { NoteEntityService } from './NoteEntityService.js';

@Injectable()
export class ChannelEntityService {
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.channelFavoritesRepository)
		private channelFavoritesRepository: ChannelFavoritesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private noteEntityService: NoteEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async packMany(
		sources: (string | MiChannel)[],
		me?: { id: MiUser['id'] } | null | undefined,
		detailed?: boolean,
	): Promise<Packed<'Channel'>[]> {
		const channels: MiChannel[] = [];
		const toFetch: string[] = [];

		for (const src of sources) {
			if (typeof(src) === 'string') {
				toFetch.push(src);
			} else {
				channels.push(src);
			}
		}

		if (toFetch.length > 0) {
			const fetched = await this.channelsRepository.findBy({ id: In(toFetch) });
			for (const channel of fetched) {
				channels.push(channel);
			}
		}

		if (channels.length < 1) {
			return [];
		}

		const meId = me?.id;
		const channelIds = channels.map(c => c.id);
		const followingIds = new Set<string>();
		const favoritedIds = new Set<string>();
		const packedPinnedNotes = new Map<string, Packed<'Note'>>();
		const bannerFiles = new Map<string, MiDriveFile>();

		if (meId) {
			const followings = await this.channelFollowingsRepository.find({
				where: { followerId: meId, followeeId: In(channelIds) },
				select: { followeeId: true },
			});
			for (const { followeeId } of followings) {
				followingIds.add(followeeId);
			}

			const favorites = await this.channelFavoritesRepository.find({
				where: { userId: meId, channelId: In(channelIds) },
				select: { channelId: true },
			});
			for (const { channelId } of favorites) {
				favoritedIds.add(channelId);
			}

			const allPinnedNotes = new Set(channels.flatMap(c => c.pinnedNoteIds)).values().toArray();
			if (allPinnedNotes.length > 0) {
				const notes = await this.notesRepository.findBy({ id: In(allPinnedNotes ) });
				const packedNotes = await this.noteEntityService.packMany(notes, me);
				for (const note of packedNotes) {
					packedPinnedNotes.set(note.id, note);
				}
			}

			const allBanners = new Set(channels.map(c => c.bannerId).filter(id => id != null)).values().toArray();
			if (allBanners.length > 0) {
				const banners = await this.driveFilesRepository.findBy({ id: In(allBanners) });
				for (const banner of banners) {
					bannerFiles.set(banner.id, banner);
				}
			}
		}

		return channels.map(channel => {
			const banner = channel.bannerId ? bannerFiles.get(channel.bannerId) : undefined;
			const isFollowing = followingIds.has(channel.id);
			const isFavorited = favoritedIds.has(channel.id);
			const hasUnreadNote = false; // Not implemented
			const pinnedNotes = channel.pinnedNoteIds
				.map(noteId => packedPinnedNotes.get(noteId))
				.filter(note => note != null);
			return this.packInternal(channel, me, detailed ?? false, banner, isFollowing, isFavorited, hasUnreadNote, pinnedNotes);
		});
	}

	@bindThis
	public async pack(
		src: MiChannel['id'] | MiChannel,
		me?: { id: MiUser['id'] } | null | undefined,
		detailed?: boolean,
	): Promise<Packed<'Channel'>> {
		const channel = typeof src === 'object' ? src : await this.channelsRepository.findOneByOrFail({ id: src });
		const meId = me ? me.id : null;

		const banner = channel.bannerId ? await this.driveFilesRepository.findOneBy({ id: channel.bannerId }) : null;

		const isFollowing = meId ? await this.channelFollowingsRepository.exists({
			where: {
				followerId: meId,
				followeeId: channel.id,
			},
		}) : false;

		const isFavorited = meId ? await this.channelFavoritesRepository.exists({
			where: {
				userId: meId,
				channelId: channel.id,
			},
		}) : false;

		const pinnedNotes = detailed && channel.pinnedNoteIds.length > 0
			? (
				await this.noteEntityService.packMany(await this.notesRepository.find({
					where: {
						id: In(channel.pinnedNoteIds),
					},
				}), me)
			)
			: undefined;

		return this.packInternal(channel, me, detailed, banner, isFollowing, isFavorited, false, pinnedNotes);
	}

	private packInternal(
		channel: MiChannel,
		me: { id: string } | null | undefined,
		detailed: boolean | undefined,
		banner: MiDriveFile | null | undefined,
		isFollowing: boolean | undefined,
		isFavorited: boolean | undefined,
		hasUnreadNote: boolean | undefined,
		pinnedNotes: Packed<'Note'>[] | undefined,
	): Packed<'Channel'> {
		return {
			id: channel.id,
			createdAt: this.idService.parse(channel.id).date.toISOString(),
			lastNotedAt: channel.lastNotedAt ? channel.lastNotedAt.toISOString() : null,
			name: channel.name,
			description: channel.description,
			userId: channel.userId,
			bannerUrl: banner ? this.driveFileEntityService.getPublicUrl(banner) : null,
			pinnedNoteIds: channel.pinnedNoteIds,
			color: channel.color,
			isArchived: channel.isArchived,
			usersCount: channel.usersCount,
			notesCount: channel.notesCount,
			isSensitive: channel.isSensitive,
			allowRenoteToExternal: channel.allowRenoteToExternal,

			...(me ? {
				isFollowing,
				isFavorited,
				hasUnreadNote,
			} : {}),

			...(detailed ? {
				pinnedNotes: pinnedNotes?.sort((a, b) => channel.pinnedNoteIds.indexOf(a.id) - channel.pinnedNoteIds.indexOf(b.id)),
			} : {}),
		};
	}
}

