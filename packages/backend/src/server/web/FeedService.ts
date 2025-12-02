/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { Feed } from 'feed';
import { parse as mfmParse } from 'mfm-js';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, NotesRepository, UserProfilesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/User.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { MfmService } from "@/core/MfmService.js";
import { TimeService } from '@/global/TimeService.js';

@Injectable()
export class FeedService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
		private mfmService: MfmService,
		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async packFeed(user: MiUser) {
		const author = {
			link: `${this.config.url}/@${user.username}`,
			name: user.name ?? user.username,
		};

		const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });

		const notes = user.requireSigninToViewContents ? [] : await this.notesRepository.find({
			where: {
				userId: user.id,
				renoteId: IsNull(),
				visibility: In(['public', 'home']),
			},
			order: { id: -1 },
			take: 20,
		});

		const feed = new Feed({
			id: author.link,
			title: `${author.name} (@${user.username}@${this.config.host})`,
			updated: notes.length !== 0 ? this.idService.parse(notes[0].id).date : undefined,
			generator: 'Sharkey',
			description: `${user.notesCount} Notes, ${profile.followingVisibility === 'public' ? user.followingCount : '?'} Following, ${profile.followersVisibility === 'public' ? user.followersCount : '?'} Followers${profile.description ? ` · ${profile.description}` : ''}`,
			link: author.link,
			image: (user.avatarId == null ? null : user.avatarUrl) ?? this.userEntityService.getIdenticonUrl(user),
			feedLinks: {
				json: `${author.link}.json`,
				atom: `${author.link}.atom`,
			},
			author,
			copyright: user.name ?? user.username,
		});

		const followersOnlyBefore = user.makeNotesFollowersOnlyBefore;
		const hiddenBefore = user.makeNotesHiddenBefore;

		for (const note of notes) {
			const createdAt = new Date(this.idService.parse(note.id).date);

			if (this.shouldHideNote(followersOnlyBefore, createdAt) || this.shouldHideNote(hiddenBefore, createdAt)) {
				continue;
			}

			const files = note.fileIds.length > 0 ? await this.driveFilesRepository.findBy({
				id: In(note.fileIds),
			}) : [];
			const file = files.find(file => file.type.startsWith('image/'));
			const text = note.text;

			feed.addItem({
				title: `New note by ${author.name}`,
				link: `${this.config.url}/notes/${note.id}`,
				date: this.idService.parse(note.id).date,
				description: note.cw ?? undefined,
				content: text ? this.mfmService.toHtml(mfmParse(text), JSON.parse(note.mentionedRemoteUsers)) ?? undefined : undefined,
				image: file ? this.driveFileEntityService.getPublicUrl(file) : undefined,
			});
		}

		return feed;
	}

	// this logic is copied from NoteEntityService.hideNote
	private shouldHideNote(reference: number | null, createdAt: Date): boolean {
		if ((reference !== null)
				&& (
					(reference <= 0 && (this.timeService.now - createdAt.getTime() > 0 - (reference * 1000)))
						|| (reference > 0 && (createdAt.getTime() < reference * 1000))
				)
		) {
			return true;
		}
		return false;
	}
}
