/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Entity, MastodonEntity, MisskeyEntity } from 'megalodon';
import * as mfm from 'mfm-js';
import { MastodonNotificationType } from 'megalodon/built/lib/mastodon/notification.js';
import { NotificationType } from 'megalodon/built/lib/notification.js';
import { DI } from '@/di-symbols.js';
import { MfmService } from '@/core/MfmService.js';
import type { Config } from '@/config.js';
import { IMentionedRemoteUsers, MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { NoteEditsRepository, UserProfilesRepository } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { IdService } from '@/core/IdService.js';
import type { Packed } from '@/misc/json-schema.js';
import { MastodonDataService } from '@/server/api/mastodon/MastodonDataService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { appendContentWarning } from '@/misc/append-content-warning.js';
import { isRenote } from '@/misc/is-renote.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { promiseMap } from '@/misc/promise-map.js';

// Missing from Megalodon apparently
// https://docs.joinmastodon.org/entities/StatusEdit/
export interface StatusEdit {
	content: string;
	spoiler_text: string;
	sensitive: boolean;
	created_at: string;
	account: MastodonEntity.Account;
	poll?: {
		options: {
			title: string;
		}[]
	},
	media_attachments: MastodonEntity.Attachment[],
	emojis: MastodonEntity.Emoji[],
}

export const escapeMFM = (text: string): string => text
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;')
	.replace(/'/g, '&#39;')
	.replace(/`/g, '&#x60;')
	.replace(/\r?\n/g, '<br>');

@Injectable()
export class MastodonConverters {
	constructor(
		@Inject(DI.config)
		private readonly config: Config,

		@Inject(DI.userProfilesRepository)
		private readonly userProfilesRepository: UserProfilesRepository,

		@Inject(DI.noteEditsRepository)
		private readonly noteEditsRepository: NoteEditsRepository,

		private readonly mfmService: MfmService,
		private readonly getterService: GetterService,
		private readonly customEmojiService: CustomEmojiService,
		private readonly idService: IdService,
		private readonly driveFileEntityService: DriveFileEntityService,
		private readonly mastodonDataService: MastodonDataService,
		private readonly federatedInstanceService: FederatedInstanceService,
	) {}

	private encode(u: MiUser, m: IMentionedRemoteUsers): MastodonEntity.Mention {
		let acct = u.username;
		let acctUrl = `https://${u.host || this.config.host}/@${u.username}`;
		let url: string | null = null;
		if (u.host) {
			const info = m.find(r => r.username === u.username && r.host === u.host);
			acct = `${u.username}@${u.host}`;
			acctUrl = `https://${u.host}/@${u.username}`;
			if (info) url = info.url ?? info.uri;
		}
		return {
			id: u.id,
			username: u.username,
			acct: acct,
			url: url ?? acctUrl,
		};
	}

	public fileType(s: string): 'unknown' | 'image' | 'gifv' | 'video' | 'audio' {
		if (s === 'image/gif') {
			return 'gifv';
		}
		if (s.includes('image')) {
			return 'image';
		}
		if (s.includes('video')) {
			return 'video';
		}
		if (s.includes('audio')) {
			return 'audio';
		}
		return 'unknown';
	}

	public encodeFile(f: Packed<'DriveFile'>): MastodonEntity.Attachment {
		const { width, height } = f.properties;
		const size = (width && height) ? `${width}x${height}` : undefined;
		const aspect = (width && height) ? (width / height) : undefined;

		return {
			id: f.id,
			type: this.fileType(f.type),
			url: f.url,
			remote_url: f.url,
			preview_url: f.thumbnailUrl,
			text_url: f.url,
			meta: {
				original: {
					width,
					height,
					size,
					aspect,
				},
				width,
				height,
				size,
				aspect,
			},
			description: f.comment ?? null,
			blurhash: f.blurhash ?? null,
		};
	}

	public async getUser(id: string): Promise<MiUser> {
		return this.getterService.getUser(id).then(p => {
			return p;
		});
	}

	private encodeField(f: Entity.Field): MastodonEntity.Field {
		return {
			name: f.name,
			value: this.mfmService.toMastoApiHtml(mfm.parse(f.value), [], true) ?? escapeMFM(f.value),
			verified_at: null,
		};
	}

	public async convertAccount(account: Entity.Account | MiUser): Promise<MastodonEntity.Account> {
		const user = await this.getUser(account.id);
		const profile = await this.userProfilesRepository.findOneBy({ userId: user.id });
		const emojis = await this.customEmojiService.populateEmojis(user.emojis, user.host ? user.host : this.config.host);
		const emoji: Entity.Emoji[] = [];
		Object.entries(emojis).forEach(entry => {
			const [key, value] = entry;
			emoji.push({
				shortcode: key,
				static_url: value,
				url: value,
				visible_in_picker: true,
				category: undefined,
			});
		});
		const fqn = `${user.username}@${user.host ?? this.config.hostname}`;
		let acct = user.username;
		let acctUrl = `https://${user.host || this.config.host}/@${user.username}`;
		const acctUri = `https://${this.config.host}/users/${user.id}`;
		if (user.host) {
			acct = `${user.username}@${user.host}`;
			acctUrl = `https://${user.host}/@${user.username}`;
		}

		const bioText = profile?.description && this.mfmService.toMastoApiHtml(mfm.parse(profile.description));

		return await awaitAll({
			id: account.id,
			username: user.username,
			acct: acct,
			fqn: fqn,
			display_name: user.name ?? user.username,
			locked: user.isLocked,
			created_at: this.idService.parse(user.id).date.toISOString(),
			followers_count: profile?.followersVisibility === 'public' ? user.followersCount : 0,
			following_count: profile?.followingVisibility === 'public' ? user.followingCount : 0,
			statuses_count: user.notesCount,
			note: bioText ?? '',
			url: user.uri ?? acctUrl,
			uri: user.uri ?? acctUri,
			avatar: user.avatarUrl ?? 'https://dev.joinsharkey.org/static-assets/avatar.png',
			avatar_static: user.avatarUrl ?? 'https://dev.joinsharkey.org/static-assets/avatar.png',
			header: user.bannerUrl ?? 'https://dev.joinsharkey.org/static-assets/transparent.png',
			header_static: user.bannerUrl ?? 'https://dev.joinsharkey.org/static-assets/transparent.png',
			emojis: emoji,
			moved: null, //FIXME
			fields: profile?.fields.map(p => this.encodeField(p)) ?? [],
			bot: user.isBot,
			discoverable: user.isExplorable,
			noindex: user.noindex,
			group: null,
			suspended: user.isSuspended,
			limited: user.isSilenced,
		});
	}

	public async getEdits(id: string, me: MiLocalUser | null): Promise<StatusEdit[]> {
		const note = await this.mastodonDataService.getNote(id, me);
		if (!note) {
			return [];
		}

		const noteUser = await this.getUser(note.userId);
		const noteInstance = noteUser.instance ?? (noteUser.host ? await this.federatedInstanceService.fetch(noteUser.host) : null);
		const account = await this.convertAccount(noteUser);
		const edits = await this.noteEditsRepository.find({ where: { noteId: note.id }, order: { id: 'ASC' } });
		const history: StatusEdit[] = [];

		const mentionedRemoteUsers = JSON.parse(note.mentionedRemoteUsers);
		const renote = isRenote(note) ? await this.mastodonDataService.requireNote(note.renoteId, me) : null;

		// TODO this looks wrong, according to mastodon docs
		let lastDate = this.idService.parse(note.id).date;

		for (const edit of edits) {
			// TODO avoid re-packing files for each edit
			const files = await this.driveFileEntityService.packManyByIds(edit.fileIds);

			let cw = edit.cw ?? '';
			if (note.mandatoryCW) {
				cw = appendContentWarning(cw, note.mandatoryCW);
			}
			if (noteUser.mandatoryCW) {
				cw = appendContentWarning(cw, noteUser.mandatoryCW);
			}
			if (noteInstance?.mandatoryCW) {
				cw = appendContentWarning(cw, noteInstance.mandatoryCW);
			}

			const isQuote = renote && (edit.cw || edit.newText || edit.fileIds.length > 0 || note.replyId);
			const quoteUri = isQuote
				? renote.url ?? renote.uri ?? `${this.config.url}/notes/${renote.id}`
				: null;

			const item = {
				account: account,
				content: this.mfmService.toMastoApiHtml(mfm.parse(edit.newText ?? ''), mentionedRemoteUsers, false, quoteUri) ?? '',
				created_at: lastDate.toISOString(),
				emojis: [], //FIXME
				sensitive: !!cw,
				spoiler_text: cw,
				media_attachments: files.length > 0 ? files.map((f) => this.encodeFile(f)) : [],
			};
			lastDate = edit.updatedAt;
			history.push(item);
		}

		return history;
	}

	private async convertReblog(status: Entity.Status | null, me: MiLocalUser | null): Promise<MastodonEntity.Status | null> {
		if (!status) return null;
		return await this.convertStatus(status, me);
	}

	public async convertStatus(status: Entity.Status, me: MiLocalUser | null, hints?: { note?: MiNote, user?: MiUser }): Promise<MastodonEntity.Status> {
		const convertedAccount = this.convertAccount(status.account);
		const note = hints?.note ?? await this.mastodonDataService.requireNote(status.id, me);
		const noteUser = hints?.user ?? note.user ?? await this.getUser(status.account.id);
		const mentionedRemoteUsers = JSON.parse(note.mentionedRemoteUsers);

		const emojis = await this.customEmojiService.populateEmojis(note.emojis, noteUser.host ? noteUser.host : this.config.host);
		const emoji: Entity.Emoji[] = [];
		Object.entries(emojis).forEach(entry => {
			const [key, value] = entry;
			emoji.push({
				shortcode: key,
				static_url: value,
				url: value,
				visible_in_picker: true,
				category: undefined,
			});
		});

		const mentions = promiseMap(note.mentions, async p => {
			try {
				const u = await this.getUser(p);
				return this.encode(u, mentionedRemoteUsers);
			} catch {
				return null;
			}
		}, { limit: 4 })
			.then((p: Entity.Mention[]) => p.filter(m => m));

		const tags = note.tags.map(tag => {
			return {
				name: tag,
				url: `${this.config.url}/tags/${tag}`,
			} as Entity.Tag;
		});

		// This must mirror the usual isQuote / isPureRenote logic used elsewhere.
		const isQuote = note.renoteId && (note.text || note.cw || note.fileIds.length > 0 || note.hasPoll || note.replyId);

		const renote: Promise<MiNote> | null = note.renoteId ? this.mastodonDataService.requireNote(note.renoteId, me) : null;

		const quoteUri = Promise.resolve(renote).then(renote => {
			if (!renote || !isQuote) return null;
			return renote.url ?? renote.uri ?? `${this.config.url}/notes/${renote.id}`;
		});

		const text = note.text;
		const content = text !== null
			? quoteUri.then(quote => this.mfmService.toMastoApiHtml(mfm.parse(text), mentionedRemoteUsers, false, quote) ?? escapeMFM(text))
			: '';

		let cw = note.cw ?? '';
		if (note.mandatoryCW) {
			cw = appendContentWarning(cw, note.mandatoryCW);
		}
		if (noteUser.mandatoryCW) {
			cw = appendContentWarning(cw, noteUser.mandatoryCW);
		}

		const reblogged = await this.mastodonDataService.hasReblog(note.id, me);

		// noinspection ES6MissingAwait
		return await awaitAll({
			id: note.id,
			uri: note.uri ?? `https://${this.config.host}/notes/${note.id}`,
			url: note.url ?? note.uri ?? `https://${this.config.host}/notes/${note.id}`,
			account: convertedAccount,
			in_reply_to_id: note.replyId,
			in_reply_to_account_id: note.replyUserId,
			reblog: !isQuote ? this.convertReblog(status.reblog, me) : null,
			content: content,
			content_type: 'text/x.misskeymarkdown',
			text: note.text,
			created_at: status.created_at,
			edited_at: note.updatedAt?.toISOString() ?? null,
			emojis: emoji,
			replies_count: note.repliesCount,
			reblogs_count: note.renoteCount,
			favourites_count: status.favourites_count,
			reblogged,
			favourited: status.favourited,
			muted: status.muted,
			sensitive: status.sensitive || !!cw,
			spoiler_text: cw,
			visibility: status.visibility,
			media_attachments: status.media_attachments.map((a: Entity.Attachment) => convertAttachment(a)),
			mentions: mentions,
			tags: tags,
			card: null, //FIXME
			poll: status.poll ?? null,
			application: null, //FIXME
			language: null, //FIXME
			pinned: false, //FIXME
			bookmarked: false, //FIXME
			quote_id: isQuote ? status.reblog?.id : undefined,
			quote: isQuote ? this.convertReblog(status.reblog, me) : null,
			reactions: status.emoji_reactions,
		});
	}

	public async convertConversation(conversation: Entity.Conversation, me: MiLocalUser | null): Promise<MastodonEntity.Conversation> {
		return {
			id: conversation.id,
			accounts: await promiseMap(conversation.accounts, async (a: Entity.Account) => await this.convertAccount(a), { limit: 4 }),
			last_status: conversation.last_status ? await this.convertStatus(conversation.last_status, me) : null,
			unread: conversation.unread,
		};
	}

	public async convertNotification(notification: Entity.Notification, me: MiLocalUser | null): Promise<MastodonEntity.Notification | null> {
		const status = notification.status
			? await this.convertStatus(notification.status, me).catch(() => null)
			: null;

		// We sometimes get notifications for inaccessible notes, these should be ignored.
		if (!status) {
			return null;
		}

		return {
			account: await this.convertAccount(notification.account),
			created_at: notification.created_at,
			id: notification.id,
			status,
			type: convertNotificationType(notification.type as NotificationType),
		};
	}

	public convertApplication(app: MisskeyEntity.App): MastodonEntity.Application {
		return {
			name: app.name,
			scopes: app.permission,
			redirect_uri: app.callbackUrl,
			redirect_uris: [app.callbackUrl],
		};
	}
}

function simpleConvert<T>(data: T): T {
	// copy the object to bypass weird pass by reference bugs
	return Object.assign({}, data);
}

function convertNotificationType(type: NotificationType): MastodonNotificationType {
	switch (type) {
		case 'emoji_reaction': return 'reaction';
		case 'poll_vote':
		case 'poll_expired':
			return 'poll';
		// Not supported by mastodon
		case 'move':
			return type as MastodonNotificationType;
		default: return type;
	}
}

export function convertAnnouncement(announcement: Entity.Announcement): MastodonEntity.Announcement {
	return {
		...announcement,
		updated_at: announcement.updated_at ?? announcement.published_at,
	};
}

export function convertAttachment(attachment: Entity.Attachment): MastodonEntity.Attachment {
	const { width, height } = attachment.meta?.original ?? attachment.meta ?? {};
	const size = (width && height) ? `${width}x${height}` : undefined;
	const aspect = (width && height) ? (width / height) : undefined;
	return {
		...attachment,
		meta: attachment.meta ? {
			...attachment.meta,
			original: {
				...attachment.meta.original,
				width,
				height,
				size,
				aspect,
				frame_rate: String(attachment.meta.fps),
				duration: attachment.meta.duration,
				bitrate: attachment.meta.audio_bitrate ? parseInt(attachment.meta.audio_bitrate) : undefined,
			},
			width,
			height,
			size,
			aspect,
		} : null,
	};
}
export function convertFilter(filter: Entity.Filter): MastodonEntity.Filter {
	return simpleConvert(filter);
}
export function convertList(list: Entity.List): MastodonEntity.List {
	return {
		id: list.id,
		title: list.title,
		replies_policy: list.replies_policy ?? 'followed',
	};
}
export function convertFeaturedTag(tag: Entity.FeaturedTag): MastodonEntity.FeaturedTag {
	return simpleConvert(tag);
}

export function convertPoll(poll: Entity.Poll): MastodonEntity.Poll {
	return simpleConvert(poll);
}

// Megalodon sometimes returns broken / stubbed relationship data
export function convertRelationship(relationship: Partial<Entity.Relationship> & { id: string }): MastodonEntity.Relationship {
	return {
		id: relationship.id,
		following: relationship.following ?? false,
		showing_reblogs: relationship.showing_reblogs ?? true,
		notifying: relationship.notifying ?? true,
		languages: [],
		followed_by: relationship.followed_by ?? false,
		blocking: relationship.blocking ?? false,
		blocked_by: relationship.blocked_by ?? false,
		muting: relationship.muting ?? false,
		muting_notifications: relationship.muting_notifications ?? false,
		requested: relationship.requested ?? false,
		requested_by: relationship.requested_by ?? false,
		domain_blocking: relationship.domain_blocking ?? false,
		endorsed: relationship.endorsed ?? false,
		note: relationship.note ?? '',
	};
}
