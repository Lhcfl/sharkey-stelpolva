/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { DataSource, In } from 'typeorm';
import * as Redis from 'ioredis';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import type { IMentionedRemoteUsers } from '@/models/Note.js';
import { MiNote } from '@/models/Note.js';
import type { NoteEditsRepository, ChannelFollowingsRepository, ChannelsRepository, FollowingsRepository, InstancesRepository, MiMeta, MutingsRepository, NotesRepository, NoteThreadMutingsRepository, UserListMembershipsRepository, UserProfilesRepository, UsersRepository, PollsRepository } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiApp } from '@/models/App.js';
import { concat } from '@/misc/prelude/array.js';
import { IdService } from '@/core/IdService.js';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { isRemoteUser, isLocalUser } from '@/models/User.js';
import { MiPoll, type IPoll } from '@/models/Poll.js';
import type { MiChannel } from '@/models/Channel.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { RelayService } from '@/core/RelayService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { UserWebhookService } from '@/core/UserWebhookService.js';
import { QueueService } from '@/core/QueueService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { RemoteUserResolveService } from '@/core/RemoteUserResolveService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { SearchService } from '@/core/SearchService.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { CacheService } from '@/core/CacheService.js';
import { isReply } from '@/misc/is-reply.js';
import { trackTask } from '@/misc/promise-tracker.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { LatestNoteService } from '@/core/LatestNoteService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { TimeService } from '@/global/TimeService.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import { isPureRenote } from '@/misc/is-renote.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';

type NotificationType = 'reply' | 'renote' | 'quote' | 'mention' | 'edited';

class NotificationManager {
	private notifier: { id: MiUser['id']; };
	private note: MiNote;
	private queue: {
		target: MiLocalUser['id'];
		reason: NotificationType;
	}[];

	constructor(
		private mutingsRepository: MutingsRepository,
		private notificationService: NotificationService,
		notifier: { id: MiUser['id']; },
		note: MiNote,
	) {
		this.notifier = notifier;
		this.note = note;
		this.queue = [];
	}

	@bindThis
	public push(notifiee: MiLocalUser['id'], reason: NotificationType) {
		// 自分自身へは通知しない
		if (this.notifier.id === notifiee) return;

		const exist = this.queue.find(x => x.target === notifiee);

		if (exist) {
			// 「メンションされているかつ返信されている」場合は、メンションとしての通知ではなく返信としての通知にする
			if (reason !== 'mention') {
				exist.reason = reason;
			}
		} else {
			this.queue.push({
				reason: reason,
				target: notifiee,
			});
		}
	}

	@bindThis
	public async notify() {
		for (const x of this.queue) {
			if (x.reason === 'renote') {
				this.notificationService.createNotification(x.target, 'renote', {
					noteId: this.note.id,
					targetNoteId: this.note.renoteId!,
				}, this.notifier.id);
			} else {
				this.notificationService.createNotification(x.target, x.reason, {
					noteId: this.note.id,
				}, this.notifier.id);
			}
		}
	}
}

type MinimumUser = {
	id: MiUser['id'];
	host: MiUser['host'];
	username: MiUser['username'];
	uri: MiUser['uri'];
};

export type Option = {
	createdAt?: Date | null;
	name?: string | null;
	text?: string | null;
	reply?: MiNote | null;
	renote?: MiNote | null;
	files?: MiDriveFile[] | null;
	poll?: IPoll | null;
	localOnly?: boolean | null;
	reactionAcceptance?: MiNote['reactionAcceptance'];
	cw?: string | null;
	visibility?: string;
	visibleUsers?: MinimumUser[] | null;
	channel?: MiChannel | null;
	apMentions?: MinimumUser[] | null;
	apHashtags?: string[] | null;
	apEmojis?: string[] | null;
	uri?: string | null;
	url?: string | null;
	app?: MiApp | null;
	updatedAt?: Date | null;
	editcount?: boolean | null;
	processErrors?: string[] | null;
	mandatoryCW?: string | null;
};

@Injectable()
export class NoteEditService implements OnApplicationShutdown {
	#shutdownController = new AbortController();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.noteThreadMutingsRepository)
		private noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.noteEditsRepository)
		private noteEditsRepository: NoteEditsRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		private noteEntityService: NoteEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private queueService: QueueService,
		private fanoutTimelineService: FanoutTimelineService,
		private notificationService: NotificationService,
		private relayService: RelayService,
		private federatedInstanceService: FederatedInstanceService,
		private webhookService: UserWebhookService,
		private remoteUserResolveService: RemoteUserResolveService,
		private apDeliverManagerService: ApDeliverManagerService,
		private apRendererService: ApRendererService,
		private roleService: RoleService,
		private searchService: SearchService,
		private activeUsersChart: ActiveUsersChart,
		private instanceChart: InstanceChart,
		private utilityService: UtilityService,
		private userBlockingService: UserBlockingService,
		private cacheService: CacheService,
		private latestNoteService: LatestNoteService,
		private noteCreateService: NoteCreateService,
		private readonly timeService: TimeService,
		private readonly noteVisibilityService: NoteVisibilityService,
		private readonly collapsedQueueService: CollapsedQueueService,
	) {
	}

	@bindThis
	public async edit(user: MiUser, editid: MiNote['id'], data: Option, silent = false): Promise<MiNote> {
		if (!editid) {
			throw new UnrecoverableError('edit failed: missing editid');
		}

		const oldNote = await this.notesRepository.findOneBy({
			id: editid,
		});

		if (oldNote == null) {
			throw new UnrecoverableError(`edit failed for ${editid}: missing oldnote`);
		}

		if (oldNote.userId !== user.id) {
			throw new UnrecoverableError(`edit failed for ${editid}: user is not the note author`);
		}

		// we never want to change the replyId, so fetch the original "parent"
		if (oldNote.replyId) {
			data.reply = await this.notesRepository.findOneBy({ id: oldNote.replyId });
		} else {
			data.reply = undefined;
		}

		// changing visibility on an edit is ill-defined, let's try to
		// keep the same visibility as the original note
		data.visibility = oldNote.visibility;
		data.localOnly = oldNote.localOnly;

		// チャンネル外にリプライしたら対象のスコープに合わせる
		// (クライアントサイドでやっても良い処理だと思うけどとりあえずサーバーサイドで)
		if (data.reply && data.channel && data.reply.channelId !== data.channel.id) {
			if (data.reply.channelId) {
				data.channel = await this.channelsRepository.findOneBy({ id: data.reply.channelId });
			} else {
				data.channel = null;
			}
		}

		// チャンネル内にリプライしたら対象のスコープに合わせる
		// (クライアントサイドでやっても良い処理だと思うけどとりあえずサーバーサイドで)
		if (data.reply && (data.channel == null) && data.reply.channelId) {
			data.channel = await this.channelsRepository.findOneBy({ id: data.reply.channelId });
		}

		if (data.updatedAt == null) data.updatedAt = this.timeService.date;
		if (data.visibility == null) data.visibility = 'public';
		if (data.localOnly == null) data.localOnly = false;
		if (data.channel != null) data.visibility = 'public';
		if (data.channel != null) data.visibleUsers = [];
		if (data.channel != null) data.localOnly = true;

		if (data.visibility === 'public' && data.channel == null) {
			const sensitiveWords = this.meta.sensitiveWords;
			if (this.utilityService.isKeyWordIncluded(data.cw ?? data.text ?? '', sensitiveWords)) {
				data.visibility = 'home';
			} else if ((await this.roleService.getUserPolicies(user.id)).canPublicNote === false) {
				data.visibility = 'home';
			}
		}

		const hasProhibitedWords = this.noteCreateService.checkProhibitedWordsContain({
			cw: data.cw,
			text: data.text,
			pollChoices: data.poll?.choices,
		}, this.meta.prohibitedWords);

		if (hasProhibitedWords) {
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', 'Note contains prohibited words');
		}

		const inSilencedInstance = this.utilityService.isSilencedHost(this.meta.silencedHosts, user.host);

		if (data.visibility === 'public' && inSilencedInstance && user.host !== null) {
			data.visibility = 'home';
		}

		if (this.isRenote(data)) {
			if (isPureRenote(data.renote)) {
				throw new IdentifiableError('fd4cc33e-2a37-48dd-99cc-9b806eb2031a', 'Cannot renote a pure renote (boost)');
			}

			switch (data.renote.visibility) {
				case 'public':
					// public noteは無条件にrenote可能
					break;
				case 'home':
					// home noteはhome以下にrenote可能
					if (data.visibility === 'public') {
						data.visibility = 'home';
					}
					break;
				case 'followers':
					// 他人のfollowers noteはreject
					if (data.renote.userId !== user.id) {
						throw new IdentifiableError('be9529e9-fe72-4de0-ae43-0b363c4938af', 'Renote target is not public or home');
					}

					// Renote対象がfollowersならfollowersにする
					data.visibility = 'followers';
					break;
				case 'specified':
					// specified / direct noteはreject
					throw new IdentifiableError('be9529e9-fe72-4de0-ae43-0b363c4938af', 'Renote target is not public or home');
			}

			if (data.renote.userId !== user.id) {
				// Check local-only
				if (data.renote.localOnly && user.host != null) {
					throw new IdentifiableError('12e23cec-edd9-442b-aa48-9c21f0c3b215', 'Remote user cannot renote a local-only note');
				}

				// Check visibility
				const visibilityCheck = await this.noteVisibilityService.checkNoteVisibilityAsync(data.renote, user.id);
				if (!visibilityCheck.accessible) {
					throw new IdentifiableError('be9529e9-fe72-4de0-ae43-0b363c4938af', 'Cannot renote an invisible note');
				}

				// Check blocking
				if (await this.userBlockingService.checkBlocked(data.renote.userId, user.id)) {
					throw new IdentifiableError('b6352a84-e5cd-4b05-a26c-63437a6b98ba', 'Renote target is blocked');
				}
			}

			// Check for recursion
			if (data.renote.id === oldNote.id) {
				throw new IdentifiableError('33510210-8452-094c-6227-4a6c05d99f02', `edit failed for ${oldNote.id}: note cannot quote itself`);
			}
			for (let nextRenoteId = data.renote.renoteId; nextRenoteId != null;) {
				if (nextRenoteId === oldNote.id) {
					throw new IdentifiableError('ea93b7c2-3d6c-4e10-946b-00d50b1a75cb', `edit failed for ${oldNote.id}: note cannot quote a quote of itself`);
				}

				// TODO create something like threadId but for quotes, that way we don't need full recursion
				const next = await this.notesRepository.findOne({ where: { id: nextRenoteId }, select: { renoteId: true } });
				nextRenoteId = next?.renoteId ?? null;
			}
		}

		// Check quote permissions
		await this.noteCreateService.checkQuotePermissions(data, user);

		// 返信対象がpublicではないならhomeにする
		if (data.reply && data.reply.visibility !== 'public' && data.visibility === 'public') {
			data.visibility = 'home';
		}

		// ローカルのみをRenoteしたらローカルのみにする
		if (this.isRenote(data) && data.renote.localOnly && data.channel == null) {
			data.localOnly = true;
		}

		// ローカルのみにリプライしたらローカルのみにする
		if (data.reply && data.reply.localOnly && data.channel == null) {
			data.localOnly = true;
		}

		const maxTextLength = user.host == null
			? this.config.maxNoteLength
			: this.config.maxRemoteNoteLength;

		if (data.text) {
			if (data.text.length > maxTextLength) {
				data.text = data.text.slice(0, maxTextLength);
			}
			data.text = data.text.trim();
			if (data.text === '') {
				data.text = null;
			}
		}

		const maxCwLength = user.host == null
			? this.config.maxCwLength
			: this.config.maxRemoteCwLength;

		if (data.cw) {
			if (data.cw.length > maxCwLength) {
				data.cw = data.cw.slice(0, maxCwLength);
			}
			data.cw = data.cw.trim();
			if (data.cw === '') {
				data.cw = null;
			}
		}

		let tags = data.apHashtags;
		let emojis = data.apEmojis;
		let mentionedUsers = data.apMentions;

		// Parse MFM if needed
		if (!tags || !emojis || !mentionedUsers) {
			const tokens = data.text ? mfm.parse(data.text) : [];
			const cwTokens = data.cw ? mfm.parse(data.cw) : [];
			const choiceTokens = data.poll && data.poll.choices
				? concat(data.poll.choices.map(choice => mfm.parse(choice)))
				: [];

			const combinedTokens = tokens.concat(cwTokens).concat(choiceTokens);

			tags = data.apHashtags ?? extractHashtags(combinedTokens);

			emojis = data.apEmojis ?? extractCustomEmojisFromMfm(combinedTokens);

			mentionedUsers = data.apMentions ?? await this.noteCreateService.extractMentionedUsers(user, combinedTokens);
		}

		// if the host is media-silenced, custom emojis are not allowed
		if (this.utilityService.isMediaSilencedHost(this.meta.mediaSilencedHosts, user.host)) emojis = [];

		tags = tags.filter(tag => Array.from(tag).length <= 128).splice(0, 32);

		if (data.reply && (user.id !== data.reply.userId) && !mentionedUsers.some(u => u.id === data.reply!.userId)) {
			mentionedUsers.push(await this.usersRepository.findOneByOrFail({ id: data.reply!.userId }));
		}

		if (data.visibility === 'specified') {
			if (data.visibleUsers == null) throw new Error('invalid param');

			for (const u of data.visibleUsers) {
				if (!mentionedUsers.some(x => x.id === u.id)) {
					mentionedUsers.push(u);
				}
			}

			if (data.reply && !data.visibleUsers.some(x => x.id === data.reply!.userId)) {
				data.visibleUsers.push(await this.usersRepository.findOneByOrFail({ id: data.reply!.userId }));
			}
		}

		if (mentionedUsers.length > 0 && mentionedUsers.length > (await this.roleService.getUserPolicies(user.id)).mentionLimit) {
			throw new IdentifiableError('9f466dab-c856-48cd-9e65-ff90ff750580', 'Note contains too many mentions');
		}

		const update: Partial<MiNote> = {};
		if (data.text !== undefined && data.text !== oldNote.text) {
			update.text = data.text;
		}
		if (data.cw !== undefined && data.cw !== oldNote.cw) {
			update.cw = data.cw;
		}
		if (data.poll !== undefined && oldNote.hasPoll !== !!data.poll) {
			update.hasPoll = !!data.poll;
		}
		if (data.mandatoryCW !== undefined && oldNote.mandatoryCW !== data.mandatoryCW) {
			update.mandatoryCW = data.mandatoryCW;
		}

		// TODO deep-compare files
		const filesChanged = oldNote.fileIds.length || data.files?.length;

		const oldPoll = await this.pollsRepository.findOneBy({ noteId: oldNote.id });
		const oldPollData = oldPoll ? { choices: oldPoll.choices, multiple: oldPoll.multiple, expiresAt: oldPoll.expiresAt?.toISOString() ?? null } : null;
		const newPollData = data.poll ? { choices: data.poll.choices, multiple: data.poll.multiple, expiresAt: data.poll.expiresAt ?? null } : null;
		const pollChanged = data.poll !== undefined && JSON.stringify(oldPollData) !== JSON.stringify(newPollData);

		if (Object.keys(update).length > 0 || filesChanged || pollChanged) {
			const exists = await this.noteEditsRepository.findOneBy({ noteId: oldNote.id });

			await this.noteEditsRepository.insert({
				id: this.idService.gen(),
				userId: oldNote.userId,
				noteId: oldNote.id,
				renoteId: oldNote.renoteId,
				replyId: oldNote.replyId,
				visibility: oldNote.visibility,
				text: oldNote.text || undefined,
				newText: update.text || undefined,
				cw: oldNote.cw || undefined,
				newCw: update.cw || undefined,
				fileIds: oldNote.fileIds,
				oldDate: exists ? oldNote.updatedAt as Date : this.idService.parse(oldNote.id).date,
				updatedAt: this.timeService.date,
				hasPoll: oldPoll != null,
			});

			const note = new MiNote({
				id: oldNote.id,
				updatedAt: data.updatedAt ? data.updatedAt : this.timeService.date,
				fileIds: data.files ? data.files.map(file => file.id) : [],
				replyId: oldNote.replyId,
				renoteId: data.renote ? data.renote.id : null,
				channelId: data.channel ? data.channel.id : null,
				threadId: data.reply
					? data.reply.threadId
						? data.reply.threadId
						: data.reply.id
					: null,
				name: data.name,
				text: data.text,
				hasPoll: data.poll != null,
				cw: data.cw ?? null,
				tags: tags.map(tag => normalizeForSearch(tag)),
				emojis,
				reactions: oldNote.reactions,
				userId: user.id,
				localOnly: data.localOnly!,
				reactionAcceptance: data.reactionAcceptance,
				visibility: data.visibility as any,
				visibleUserIds: data.visibility === 'specified'
					? data.visibleUsers
						? data.visibleUsers.map(u => u.id)
						: []
					: [],

				attachedFileTypes: data.files ? data.files.map(file => file.type) : [],

				// 以下非正規化データ
				replyUserId: data.reply ? data.reply.userId : null,
				replyUserHost: data.reply ? data.reply.userHost : null,
				renoteUserId: data.renote ? data.renote.userId : null,
				renoteUserHost: data.renote ? data.renote.userHost : null,
				userHost: user.host,
				reactionAndUserPairCache: oldNote.reactionAndUserPairCache,
				mandatoryCW: data.mandatoryCW,
			});

			if (data.uri != null) note.uri = data.uri;
			if (data.url != null) note.url = data.url;
			if (data.processErrors !== undefined) note.processErrors = data.processErrors;

			if (mentionedUsers.length > 0) {
				note.mentions = mentionedUsers.map(u => u.id);
				const profiles = await this.userProfilesRepository.findBy({ userId: In(note.mentions) });
				note.mentionedRemoteUsers = JSON.stringify(mentionedUsers.filter(u => isRemoteUser(u)).map(u => {
					const profile = profiles.find(p => p.userId === u.id);
					const url = profile != null ? profile.url : null;
					return {
						uri: u.uri,
						url: url ?? undefined,
						username: u.username,
						host: u.host,
					} as IMentionedRemoteUsers[0];
				}));
			}

			if (pollChanged) {
				// Start transaction
				await this.db.transaction(async transactionalEntityManager => {
					await transactionalEntityManager.update(MiNote, oldNote.id, note);

					// Insert or update poll
					if (data.poll) {
						const poll = new MiPoll({
							noteId: note.id,
							choices: data.poll.choices,
							expiresAt: data.poll.expiresAt,
							multiple: data.poll.multiple,
							votes: new Array(data.poll.choices.length).fill(0),
							noteVisibility: note.visibility,
							userId: user.id,
							userHost: user.host,
							channelId: data.channel?.id ?? null,
						});

						if (oldPoll) {
							await transactionalEntityManager.update(MiPoll, { noteId: oldPoll.noteId }, poll);
						} else {
							await transactionalEntityManager.insert(MiPoll, poll);
						}
					// Delete poll
					} else if (oldPoll) {
						await transactionalEntityManager.delete(MiPoll, { noteId: oldPoll.noteId });
					}
				});
			} else {
				await this.notesRepository.update(oldNote.id, note);
			}

			// Re-fetch note to get the default values of null / unset fields.
			const edited = await this.notesRepository.findOneByOrFail({ id: note.id });

			await this.queueService.createPostNoteJob(note.id, silent, 'edit');

			return edited;
		} else {
			return oldNote;
		}
	}

	@bindThis
	public async postNoteEdited(note: MiNote, user: MiUser, data: MiNote & { poll: MiPoll | null }, silent: boolean, mentionedUsers: MinimumUser[]) {
		// Register host
		if (this.meta.enableStatsForFederatedInstances) {
			if (isRemoteUser(user)) {
				this.federatedInstanceService.fetchOrRegister(user.host).then(async i => {
					if (note.renote && note.text || !note.renote) {
						await this.collapsedQueueService.updateInstanceQueue.enqueue(i.id, { notesCountDelta: 1 });
					}
					if (this.meta.enableChartsForFederatedInstances) {
						this.instanceChart.updateNote(i.host, note, true);
					}
				});
			}
		}

		await this.collapsedQueueService.updateUserQueue.enqueue(user.id, { updatedAt: this.timeService.date });

		// ハッシュタグ更新
		await this.pushToTl(note, user);

		if (data.poll && data.poll.expiresAt) {
			const delay = data.poll.expiresAt.getTime() - this.timeService.now;
			await this.queueService.endedPollNotificationQueue.remove(`pollEnd:${note.id}`);
			await this.queueService.endedPollNotificationQueue.add(note.id, {
				noteId: note.id,
			}, {
				jobId: `pollEnd_${note.id}`,
				delay,
				removeOnComplete: true,
			});
		}

		if (!silent) {
			if (isLocalUser(user)) this.activeUsersChart.write(user);

			// Pack the note
			const noteObj = await this.noteEntityService.pack(note, null, { skipHide: true, withReactionAndUserPairCache: true });
			this.globalEventService.publishNoteStream(note.id, 'updated', {
				cw: note.cw,
				text: note.text ?? '',
			});

			await this.roleService.addNoteToRoleTimeline(noteObj);

			await this.webhookService.enqueueUserWebhook(user.id, 'note', { note: noteObj });

			const nm = new NotificationManager(this.mutingsRepository, this.notificationService, user, note);

			// If has in reply to note
			if (data.reply) {
				// 通知
				if (data.reply.userHost === null) {
					const threadId = data.reply.threadId ?? data.reply.id;

					const [
						isThreadMuted,
						userIdsWhoMeMuting,
					] = await Promise.all([
						this.cacheService.threadMutingsCache.fetch(data.reply.userId).then(ms => ms.has(threadId)),
						this.cacheService.userMutingsCache.fetch(data.reply.userId),
					]);

					const muted = isUserRelated(note, userIdsWhoMeMuting);

					if (!isThreadMuted && !muted) {
						nm.push(data.reply.userId, 'edited');
						this.globalEventService.publishMainStream(data.reply.userId, 'edited', noteObj);
						await this.webhookService.enqueueUserWebhook(data.reply.userId, 'reply', { note: noteObj });
					}
				}
			}

			await nm.notify();

			//#region AP deliver
			if (!data.localOnly && isLocalUser(user)) {
				await trackTask(async () => {
					const noteActivity = await this.apRendererService.renderNoteOrRenoteActivity(note, user, { renote: data.renote });
					const dm = this.apDeliverManagerService.createDeliverManager(user, noteActivity);

					// メンションされたリモートユーザーに配送
					for (const u of mentionedUsers.filter(u => isRemoteUser(u))) {
						dm.addDirectRecipe(u as MiRemoteUser);
					}

					// 投稿がリプライかつ投稿者がローカルユーザーかつリプライ先の投稿の投稿者がリモートユーザーなら配送
					if (data.reply && data.reply.userHost !== null) {
						const u = await this.usersRepository.findOneBy({ id: data.reply.userId });
						if (u && isRemoteUser(u)) dm.addDirectRecipe(u);
					}

					// 投稿がRenoteかつ投稿者がローカルユーザーかつRenote元の投稿の投稿者がリモートユーザーなら配送
					if (this.isRenote(data) && data.renote.userHost !== null) {
						const u = await this.usersRepository.findOneBy({ id: data.renote.userId });
						if (u && isRemoteUser(u)) dm.addDirectRecipe(u);
					}

					// フォロワーに配送
					if (['public', 'home', 'followers'].includes(note.visibility)) {
						dm.addFollowersRecipe();
					}

					if (['public', 'home'].includes(note.visibility)) {
						// Send edit event to all users who replied to,
						// renoted a post or reacted to a note.
						const noteId = note.id;
						const users = await this.usersRepository.createQueryBuilder()
							.where(
								'id IN (SELECT "userId" FROM note WHERE "replyId" = :noteId OR "renoteId" = :noteId UNION SELECT "userId" FROM note_reaction WHERE "noteId" = :noteId)',
								{ noteId },
							)
							.andWhere('host IS NOT NULL')
							.getMany();
						for (const u of users) {
							// User was verified to be remote by checking
							// whether host IS NOT NULL in SQL query.
							dm.addDirectRecipe(u as MiRemoteUser);
						}
					}

					await dm.execute();

					if (['public'].includes(note.visibility)) {
						await this.relayService.deliverToRelays(user, noteActivity);
					}
				});
			}
			//#endregion
		}

		if (data.channel) {
			await this.channelsRepository.increment({ id: data.channel.id }, 'notesCount', 1);
			await this.channelsRepository.update(data.channel.id, {
				lastNotedAt: this.timeService.date,
			});

			this.notesRepository.countBy({
				userId: user.id,
				channelId: data.channel.id,
			}).then(count => {
				// この処理が行われるのはノート作成後なので、ノートが一つしかなかったら最初の投稿だと判断できる
				// TODO: とはいえノートを削除して何回も投稿すればその分だけインクリメントされる雑さもあるのでどうにかしたい
				if (count === 1) {
					this.channelsRepository.increment({ id: data.channel!.id }, 'usersCount', 1);
				}
			});
		}

		// Update the Latest Note index / following feed
		await this.latestNoteService.handleUpdatedNoteDeferred(note);

		// Register to search database
		if (!user.noindex) await this.index(note);
	}

	@bindThis
	private isRenote(note: Option): note is Option & { renote: MiNote } {
		return note.renote != null;
	}

	@bindThis
	private isQuote(note: Option & { renote: MiNote }): note is Option & { renote: MiNote } & (
		{ text: string } | { cw: string } | { reply: MiNote } | { poll: IPoll } | { files: MiDriveFile[] }
	) {
		// NOTE: SYNC WITH misc/is-quote.ts
		return note.text != null ||
			note.reply != null ||
			note.cw != null ||
			note.poll != null ||
			(note.files != null && note.files.length > 0);
	}

	@bindThis
	private async index(note: MiNote) {
		if (note.text == null && note.cw == null) return;

		await this.searchService.indexNote(note);
	}

	@bindThis
	private async pushToTl(note: MiNote, user: { id: MiUser['id']; host: MiUser['host']; }) {
		if (!this.meta.enableFanoutTimeline) return;

		const r = this.redisForTimelines.pipeline();

		if (note.channelId) {
			this.fanoutTimelineService.push(`channelTimeline:${note.channelId}`, note.id, this.config.perChannelMaxNoteCacheCount, r);

			this.fanoutTimelineService.push(`userTimelineWithChannel:${user.id}`, note.id, note.userHost == null ? this.meta.perLocalUserUserTimelineCacheMax : this.meta.perRemoteUserUserTimelineCacheMax, r);

			const channelFollowings = await this.channelFollowingsRepository.find({
				where: {
					followeeId: note.channelId,
				},
				select: ['followerId'],
			});

			for (const channelFollowing of channelFollowings) {
				this.fanoutTimelineService.push(`homeTimeline:${channelFollowing.followerId}`, note.id, this.meta.perUserHomeTimelineCacheMax, r);
				if (note.fileIds.length > 0) {
					this.fanoutTimelineService.push(`homeTimelineWithFiles:${channelFollowing.followerId}`, note.id, this.meta.perUserHomeTimelineCacheMax / 2, r);
				}
			}
		} else {
			// TODO: キャッシュ？
			// eslint-disable-next-line prefer-const
			let [followings, userListMemberships] = await Promise.all([
				this.cacheService.getNonHibernatedFollowers(user.id),
				this.cacheService.userListMembershipsCache.fetch(user.id).then(ms => ms.values().toArray()),
			]);

			if (note.visibility === 'followers') {
				// TODO: 重そうだから何とかしたい Set 使う？
				userListMemberships = userListMemberships.filter(x => x.userListUserId === user.id || followings.some(f => f.followerId === x.userListUserId));
			}

			// TODO: あまりにも数が多いと redisPipeline.exec に失敗する(理由は不明)ため、3万件程度を目安に分割して実行するようにする
			for (const following of followings) {
				if (following.followerHost !== null) continue;
				// 基本的にvisibleUserIdsには自身のidが含まれている前提であること
				if (note.visibility === 'specified' && !note.visibleUserIds.some(v => v === following.followerId)) continue;

				// 「自分自身への返信 or そのフォロワーへの返信」のどちらでもない場合
				if (isReply(note, following.followerId)) {
					if (!following.withReplies) continue;
				}

				this.fanoutTimelineService.push(`homeTimeline:${following.followerId}`, note.id, this.meta.perUserHomeTimelineCacheMax, r);
				if (note.fileIds.length > 0) {
					this.fanoutTimelineService.push(`homeTimelineWithFiles:${following.followerId}`, note.id, this.meta.perUserHomeTimelineCacheMax / 2, r);
				}
			}

			for (const userListMembership of userListMemberships) {
				// ダイレクトのとき、そのリストが対象外のユーザーの場合
				if (
					note.visibility === 'specified' &&
					note.userId !== userListMembership.userListUserId &&
					!note.visibleUserIds.some(v => v === userListMembership.userListUserId)
				) continue;

				// 「自分自身への返信 or そのリストの作成者への返信」のどちらでもない場合
				if (isReply(note, userListMembership.userListUserId)) {
					if (!userListMembership.withReplies) continue;
				}

				this.fanoutTimelineService.push(`userListTimeline:${userListMembership.userListId}`, note.id, this.meta.perUserListTimelineCacheMax, r);
				if (note.fileIds.length > 0) {
					this.fanoutTimelineService.push(`userListTimelineWithFiles:${userListMembership.userListId}`, note.id, this.meta.perUserListTimelineCacheMax / 2, r);
				}
			}

			// 自分自身のHTL
			if (note.userHost == null) {
				if (note.visibility !== 'specified' || !note.visibleUserIds.some(v => v === user.id)) {
					this.fanoutTimelineService.push(`homeTimeline:${user.id}`, note.id, this.meta.perUserHomeTimelineCacheMax, r);
					if (note.fileIds.length > 0) {
						this.fanoutTimelineService.push(`homeTimelineWithFiles:${user.id}`, note.id, this.meta.perUserHomeTimelineCacheMax / 2, r);
					}
				}
			}

			// 自分自身以外への返信
			if (isReply(note)) {
				this.fanoutTimelineService.push(`userTimelineWithReplies:${user.id}`, note.id, note.userHost == null ? this.meta.perLocalUserUserTimelineCacheMax : this.meta.perRemoteUserUserTimelineCacheMax, r);

				if (note.visibility === 'public' && note.userHost == null) {
					this.fanoutTimelineService.push('localTimelineWithReplies', note.id, 300, r);
					if (note.replyUserHost == null) {
						this.fanoutTimelineService.push(`localTimelineWithReplyTo:${note.replyUserId}`, note.id, 300 / 10, r);
					}
				}
			} else {
				this.fanoutTimelineService.push(`userTimeline:${user.id}`, note.id, note.userHost == null ? this.meta.perLocalUserUserTimelineCacheMax : this.meta.perRemoteUserUserTimelineCacheMax, r);
				if (note.fileIds.length > 0) {
					this.fanoutTimelineService.push(`userTimelineWithFiles:${user.id}`, note.id, note.userHost == null ? this.meta.perLocalUserUserTimelineCacheMax / 2 : this.meta.perRemoteUserUserTimelineCacheMax / 2, r);
				}

				if (note.visibility === 'public' && note.userHost == null) {
					this.fanoutTimelineService.push('localTimeline', note.id, 1000, r);
					if (note.fileIds.length > 0) {
						this.fanoutTimelineService.push('localTimelineWithFiles', note.id, 500, r);
					}
				}
			}

			// checkHibernation moved to HibernateUsersProcessorService
		}

		await r.exec();
	}

	// checkHibernation moved to HibernateUsersProcessorService

	@bindThis
	public async dispose(): Promise<void> {
		this.#shutdownController.abort();
	}

	@bindThis
	public async onApplicationShutdown(signal?: string | undefined): Promise<void> {
		await this.dispose();
	}
}
