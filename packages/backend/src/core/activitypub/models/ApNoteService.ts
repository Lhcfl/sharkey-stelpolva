/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
import promiseLimit from 'promise-limit';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, PollsRepository, EmojisRepository, NotesRepository, MiMeta, ChannelsRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { toArray, toSingle, unique } from '@/misc/prelude/array.js';
import type { MiEmoji } from '@/models/Emoji.js';
import { AppLockService } from '@/core/AppLockService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteEditService } from '@/core/NoteEditService.js';
import type Logger from '@/logger.js';
import { IdService } from '@/core/IdService.js';
import { PollService } from '@/core/PollService.js';
import { StatusError } from '@/misc/status-error.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { checkHttps } from '@/misc/check-https.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isRetryableError } from '@/misc/is-retryable-error.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { extractMediaFromHtml } from '@/core/activitypub/misc/extract-media-from-html.js';
import { extractMediaFromMfm } from '@/core/activitypub/misc/extract-media-from-mfm.js';
import { getContentByType } from '@/core/activitypub/misc/get-content-by-type.js';
import { getOneApId, getApId, validPost, isEmoji, getApType, isApObject, isDocument, IApDocument, isLink } from '../type.js';
import { ApLoggerService } from '../ApLoggerService.js';
import { ApMfmService } from '../ApMfmService.js';
import { ApDbResolverService } from '../ApDbResolverService.js';
import { ApResolverService } from '../ApResolverService.js';
import { ApAudienceService } from '../ApAudienceService.js';
import { ApUtilityService } from '../ApUtilityService.js';
import { ApPersonService } from './ApPersonService.js';
import { extractApHashtags } from './tag.js';
import { ApMentionService } from './ApMentionService.js';
import { ApQuestionService } from './ApQuestionService.js';
import { ApImageService } from './ApImageService.js';
import type { Resolver } from '../ApResolverService.js';
import type { IObject, IPost } from '../type.js';

@Injectable()
export class ApNoteService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		private idService: IdService,
		private apMfmService: ApMfmService,
		private apResolverService: ApResolverService,

		// 循環参照のため / for circular dependency
		@Inject(forwardRef(() => ApPersonService))
		private apPersonService: ApPersonService,

		private utilityService: UtilityService,
		private apAudienceService: ApAudienceService,
		private apMentionService: ApMentionService,
		private apImageService: ApImageService,
		private apQuestionService: ApQuestionService,
		private appLockService: AppLockService,
		private pollService: PollService,
		private noteCreateService: NoteCreateService,
		private noteEditService: NoteEditService,
		private apDbResolverService: ApDbResolverService,
		private apLoggerService: ApLoggerService,
		private readonly apUtilityService: ApUtilityService,
	) {
		this.logger = this.apLoggerService.logger;
	}

	@bindThis
	public validateNote(
		object: IObject,
		uri: string,
		actor?: MiRemoteUser,
		user?: MiRemoteUser,
	): Error | null {
		this.utilityService.assertUrl(uri);
		const expectHost = this.utilityService.extractDbHost(uri);
		const apType = getApType(object);

		if (apType == null || !validPost.includes(apType)) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note from ${uri}: invalid object type ${apType ?? 'undefined'}`);
		}

		if (object.id && this.utilityService.extractDbHost(object.id) !== expectHost) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note from ${uri}: id has different host. expected: ${expectHost}, actual: ${this.utilityService.extractDbHost(object.id)}`);
		}

		const actualHost = object.attributedTo && this.utilityService.extractDbHost(getOneApId(object.attributedTo));
		if (object.attributedTo && actualHost !== expectHost) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note from ${uri}: attributedTo has different host. expected: ${expectHost}, actual: ${actualHost}`);
		}

		if (object.published && !this.idService.isSafeT(new Date(object.published).valueOf())) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', 'invalid Note from ${uri}: published timestamp is malformed');
		}

		if (actor) {
			const attribution = (object.attributedTo) ? getOneApId(object.attributedTo) : actor.uri;
			if (attribution !== actor.uri) {
				return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note from ${uri}: attribution does not match the actor that send it. attribution: ${attribution}, actor: ${actor.uri}`);
			}
			if (user && attribution !== user.uri) {
				return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note from ${uri}: updated attribution does not match original attribution. updated attribution: ${user.uri}, original attribution: ${attribution}`);
			}
		}

		return null;
	}

	/**
	 * Noteをフェッチします。
	 *
	 * Misskeyに対象のNoteが登録されていればそれを返します。
	 */
	@bindThis
	public async fetchNote(object: string | IObject): Promise<MiNote | null> {
		return await this.apDbResolverService.getNoteFromApId(object);
	}

	/**
	 * Returns true if the provided object / ID exists in the local database.
	 */
	@bindThis
	public async hasNote(object: string | IObject | [string | IObject]): Promise<boolean> {
		const uri = getApId(object);
		return await this.notesRepository.existsBy({ uri });
	}

	/**
	 * Noteを作成します。
	 */
	@bindThis
	public async createNote(value: string | IObject, actor?: MiRemoteUser, resolver?: Resolver, silent = false): Promise<MiNote | null> {
		// eslint-disable-next-line no-param-reassign
		if (resolver == null) resolver = this.apResolverService.createResolver();

		const object = await resolver.resolve(value);

		const entryUri = getApId(value);
		const err = this.validateNote(object, entryUri, actor);
		if (err) {
			this.logger.error(`Error creating note: ${renderInlineError(err)}`, {
				resolver: { history: resolver.getHistory() },
				value,
				object,
			});
			throw err;
		}

		const note = object as IPost;

		this.logger.debug(`Note fetched: ${JSON.stringify(note, null, 2)}`);

		if (note.id == null) {
			throw new UnrecoverableError(`failed to create note ${entryUri}: missing ID`);
		}

		if (!checkHttps(note.id)) {
			throw new UnrecoverableError(`failed to create note ${entryUri}: unexpected schema`);
		}

		const url = this.apUtilityService.findBestObjectUrl(note);

		this.logger.info(`Creating the Note: ${note.id}`);

		// 投稿者をフェッチ
		if (note.attributedTo == null) {
			throw new UnrecoverableError(`failed to create note: ${entryUri}: missing attributedTo`);
		}

		const uri = getOneApId(note.attributedTo);

		// ローカルで投稿者を検索し、もし凍結されていたらスキップ
		// eslint-disable-next-line no-param-reassign
		actor ??= await this.apPersonService.fetchPerson(uri) as MiRemoteUser | undefined;
		if (actor && actor.isSuspended) {
			throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', `failed to create note ${entryUri}: actor ${uri} has been suspended`);
		}

		const apMentions = await this.apMentionService.extractApMentions(note.tag, resolver);
		const apHashtags = extractApHashtags(note.tag);

		const cw = note.summary === '' ? null : note.summary;

		// テキストのパース
		let text =
			getContentByType(note, 'text/x.misskeymarkdown') ??
			getContentByType(note, 'text/markdown');
		if (text == null && typeof note.content === 'string') {
			text = this.apMfmService.htmlToMfm(note.content, note.tag);
		}

		const poll = await this.apQuestionService.extractPollFromQuestion(note, resolver).catch(() => undefined);

		//#region Contents Check
		// 添付ファイルとユーザーをこのサーバーで登録する前に内容をチェックする
		/**
		 * 禁止ワードチェック
		 */
		const hasProhibitedWords = this.noteCreateService.checkProhibitedWordsContain({ cw, text, pollChoices: poll?.choices });
		if (hasProhibitedWords) {
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', `failed to create note ${entryUri}: contains prohibited words`);
		}
		//#endregion

		// eslint-disable-next-line no-param-reassign
		actor ??= await this.apPersonService.resolvePerson(uri, resolver) as MiRemoteUser;

		// 解決した投稿者が凍結されていたらスキップ
		if (actor.isSuspended) {
			throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', `failed to create note ${entryUri}: actor ${actor.id} has been suspended`);
		}

		const noteAudience = await this.apAudienceService.parseAudience(actor, note.to, note.cc, resolver);
		let visibility = noteAudience.visibility;
		const visibleUsers = noteAudience.visibleUsers;

		// Audience (to, cc) が指定されてなかった場合
		if (visibility === 'specified' && visibleUsers.length === 0) {
			if (typeof value === 'string') {	// 入力がstringならばresolverでGETが発生している
				// こちらから匿名GET出来たものならばpublic
				visibility = 'public';
			}
		}

		const processErrors: string[] = [];

		// 添付ファイル
		// Note: implementation moved to getAttachment function to avoid duplication.
		// Please copy any upstream changes to that method! (It's in the bottom of this class)
		const { files, hasFileError } = await this.getAttachments(note, actor);
		if (hasFileError) {
			processErrors.push('attachmentFailed');
		}

		// リプライ
		const replyOrFailReason: MiNote | null | string = note.inReplyTo
			? await this.resolveNote(note.inReplyTo, { resolver })
				.then(x => {
					if (x == null) {
						this.logger.warn(`Specified inReplyTo "${note.inReplyTo}", but not found`);
						throw new IdentifiableError('1ebf0a96-2769-4973-a6c2-3dcbad409dff', `failed to create note ${entryUri}: could not fetch inReplyTo ${note.inReplyTo}`, true);
					}

					return x;
				})
				.catch(async err => {
					this.logger.warn(`error ${err.statusCode ?? err} fetching inReplyTo ${note.inReplyTo} for note ${entryUri}`);
					if (visibility === 'followers') { throw err; } // do not resolve private reply
					if (err instanceof IdentifiableError) {
						switch (err.id) {
							// when...
							case '689ee33f-f97c-479a-ac49-1b9f8140af99': // prohibited words
							case '04620a7e-044e-45ce-b72c-10e1bdc22e69': // host is blocked
							case '09d79f9e-64f1-4316-9cfa-e75c4d091574': // instance is blocked
							case '85ab9bd7-3a41-4530-959d-f07073900109': // actor is suspended
								throw err; // do not resolve reply to them
							case 'd592da9f-822f-4d91-83d7-4ceefabcf3d2': // hit recursion limit
								return 'hit recursion limit'; // eat recursion limit
						}
					}
					if (err instanceof StatusError) {
						if (err.statusCode === 404) { return '404'; } // eat 404 error
					}
					if (err instanceof UnrecoverableError) {
						return 'unrecoverable error'; // eat unrecoverableerror
					}
					throw new IdentifiableError('1ebf0a96-2769-4973-a6c2-3dcbad409dff', `failed to create note ${entryUri}: could not fetch inReplyTo ${note.inReplyTo}`, true, err);
				})
			: null;

		if (typeof replyOrFailReason === 'string') {
			// 添加一条错误消息表示该帖子有回复，但是解析出错
			text = `<small>(error: this note has a reply, but is an resolving error: ${replyOrFailReason})</small>\n\n` + text;
		}

		const reply = typeof replyOrFailReason === 'string' ? null : replyOrFailReason;

		// 引用
		const quote = await this.getQuote(note, entryUri, resolver);
		if (quote === null) {
			processErrors.push('quoteUnavailable');
		}

		if (reply && reply.userHost == null && reply.localOnly) {
			throw new IdentifiableError('12e23cec-edd9-442b-aa48-9c21f0c3b215', 'Cannot reply to local-only note');
		}
		if (quote && quote.userHost == null && quote.localOnly) {
			throw new IdentifiableError('12e23cec-edd9-442b-aa48-9c21f0c3b215', 'Cannot quote a local-only note');
		}

		// vote
		if (reply && reply.hasPoll) {
			const poll = await this.pollsRepository.findOneByOrFail({ noteId: reply.id });

			const tryCreateVote = async (name: string, index: number): Promise<null> => {
				if (poll.expiresAt && Date.now() > new Date(poll.expiresAt).getTime()) {
					this.logger.warn(`vote to expired poll from AP: actor=${actor.username}@${actor.host}, note=${note.id}, choice=${name}`);
				} else if (index >= 0) {
					this.logger.info(`vote from AP: actor=${actor.username}@${actor.host}, note=${note.id}, choice=${name}`);
					await this.pollService.vote(actor, reply, index);

					// リモートフォロワーにUpdate配信
					this.pollService.deliverQuestionUpdate(reply);
				}
				return null;
			};

			if (note.name) {
				return await tryCreateVote(note.name, poll.choices.findIndex(x => x === note.name));
			}
		}

		const emojis = await this.extractEmojis(note.tag ?? [], actor.host).catch(e => {
			this.logger.info(`extractEmojis: ${e}`);
			return [];
		});

		const apEmojis = emojis.map(emoji => emoji.name);

		const channel = await (async () => {
			if (visibility === 'public') {
				const channelPosc = text?.indexOf('\n📺 sc #');
				let channelName = channelPosc !== -1 ? text?.slice(channelPosc).trim() : null;
				if (channelName?.includes('\n')) channelName = null;
				return channelName
					?	await this.channelsRepository.findOneBy({ name: channelName })
					: null;
			}
			return null;
		})();

		try {
			return await this.noteCreateService.create(actor, {
				createdAt: note.published ? new Date(note.published) : null,
				files,
				reply,
				renote: quote ?? null,
				processErrors: processErrors.length > 0 ? processErrors : null,
				name: note.name,
				cw,
				text,
				localOnly: false,
				visibility,
				visibleUsers,
				apMentions,
				apHashtags,
				apEmojis,
				poll,
				uri: note.id,
				url: url,
				channel,
			}, silent);
		} catch (err: any) {
			if (err.name !== 'duplicated') {
				throw err;
			}
			this.logger.info('The note is already inserted while creating itself, reading again');
			const duplicate = await this.fetchNote(value);
			if (!duplicate) {
				throw new IdentifiableError('39c328e1-e829-458b-bfc9-65dcd513d1f8', `failed to create note ${entryUri}: the note creation failed with duplication error even when there is no duplication. This is likely a bug.`);
			}
			return duplicate;
		}
	}

	/**
	 * Noteを作成します。
	 */
	@bindThis
	public async updateNote(value: string | IObject, actor?: MiRemoteUser, resolver?: Resolver, silent = false): Promise<MiNote | null> {
		const noteUri = getApId(value);

		// URIがこのサーバーを指しているならスキップ
		if (this.utilityService.isUriLocal(noteUri)) {
			throw new UnrecoverableError(`failed to update note ${noteUri}: uri is local`);
		}

		//#region このサーバーに既に登録されているか
		const updatedNote = await this.notesRepository.findOneBy({ uri: noteUri });
		if (updatedNote == null) throw new UnrecoverableError(`failed to update note ${noteUri}: note does not exist`);

		const user = await this.usersRepository.findOneBy({ id: updatedNote.userId }) as MiRemoteUser | null;
		if (user == null) throw new UnrecoverableError(`failed to update note ${noteUri}: user does not exist`);

		resolver ??= this.apResolverService.createResolver();

		const object = await resolver.resolve(value);

		const entryUri = getApId(value);
		const err = this.validateNote(object, entryUri, actor, user);
		if (err) {
			this.logger.error(`Failed to update note ${noteUri}: ${renderInlineError(err)}`);
			throw err;
		}

		// `validateNote` checks that the actor and user are one and the same
		actor ??= user;

		const note = object as IPost;

		if (note.id == null) {
			throw new UnrecoverableError(`failed to update note ${entryUri}: missing ID`);
		}

		if (!checkHttps(note.id)) {
			throw new UnrecoverableError(`failed to update note ${entryUri}: unexpected schema`);
		}

		const url = this.apUtilityService.findBestObjectUrl(note);

		this.logger.info(`Creating the Note: ${note.id}`);

		if (actor.isSuspended) {
			throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', `failed to update note ${entryUri}: actor ${actor.id} has been suspended`);
		}

		const apMentions = await this.apMentionService.extractApMentions(note.tag, resolver);
		const apHashtags = extractApHashtags(note.tag);

		const cw = note.summary === '' ? null : note.summary;

		// テキストのパース
		let text =
			getContentByType(note, 'text/x.misskeymarkdown') ??
			getContentByType(note, 'text/markdown');
		if (text == null && typeof note.content === 'string') {
			text = this.apMfmService.htmlToMfm(note.content, note.tag);
		}

		const poll = await this.apQuestionService.extractPollFromQuestion(note, resolver).catch(() => undefined);

		//#region Contents Check
		// 添付ファイルとユーザーをこのサーバーで登録する前に内容をチェックする
		/**
		 * 禁止ワードチェック
		 */
		const hasProhibitedWords = this.noteCreateService.checkProhibitedWordsContain({ cw, text, pollChoices: poll?.choices });
		if (hasProhibitedWords) {
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', `failed to update note ${noteUri}: contains prohibited words`);
		}
		//#endregion

		const noteAudience = await this.apAudienceService.parseAudience(actor, note.to, note.cc, resolver);
		let visibility = noteAudience.visibility;
		const visibleUsers = noteAudience.visibleUsers;

		// Audience (to, cc) が指定されてなかった場合
		if (visibility === 'specified' && visibleUsers.length === 0) {
			if (typeof value === 'string') {	// 入力がstringならばresolverでGETが発生している
				// こちらから匿名GET出来たものならばpublic
				visibility = 'public';
			}
		}

		const processErrors: string[] = [];

		// 添付ファイル
		const { files, hasFileError } = await this.getAttachments(note, actor);
		if (hasFileError) {
			processErrors.push('attachmentFailed');
		}

		// リプライ
		const reply: MiNote | null = note.inReplyTo
			? await this.resolveNote(note.inReplyTo, { resolver })
				.then(x => {
					if (x == null) {
						this.logger.warn(`Specified inReplyTo "${note.inReplyTo}", but not found`);
						throw new IdentifiableError('1ebf0a96-2769-4973-a6c2-3dcbad409dff', `failed to update note ${entryUri}: could not fetch inReplyTo ${note.inReplyTo}`, true);
					}

					return x;
				})
				.catch(async err => {
					this.logger.warn(`error ${renderInlineError(err)} fetching inReplyTo ${note.inReplyTo} for note ${entryUri}`);
					throw new IdentifiableError('1ebf0a96-2769-4973-a6c2-3dcbad409dff', `failed to update note ${entryUri}: could not fetch inReplyTo ${note.inReplyTo}`, true, err);
				})
			: null;

		// 引用
		const quote = await this.getQuote(note, entryUri, resolver);
		if (quote === null) {
			processErrors.push('quoteUnavailable');
		}

		if (quote && quote.userHost == null && quote.localOnly) {
			throw new IdentifiableError('12e23cec-edd9-442b-aa48-9c21f0c3b215', 'Cannot quote a local-only note');
		}

		// vote
		if (reply && reply.hasPoll) {
			const poll = await this.pollsRepository.findOneByOrFail({ noteId: reply.id });

			const tryCreateVote = async (name: string, index: number): Promise<null> => {
				if (poll.expiresAt && Date.now() > new Date(poll.expiresAt).getTime()) {
					this.logger.warn(`vote to expired poll from AP: actor=${actor.username}@${actor.host}, note=${note.id}, choice=${name}`);
				} else if (index >= 0) {
					this.logger.info(`vote from AP: actor=${actor.username}@${actor.host}, note=${note.id}, choice=${name}`);
					await this.pollService.vote(actor, reply, index);

					// リモートフォロワーにUpdate配信
					this.pollService.deliverQuestionUpdate(reply);
				}
				return null;
			};

			if (note.name) {
				return await tryCreateVote(note.name, poll.choices.findIndex(x => x === note.name));
			}
		}

		const emojis = await this.extractEmojis(note.tag ?? [], actor.host).catch(e => {
			this.logger.info(`extractEmojis: ${e}`);
			return [];
		});

		const apEmojis = emojis.map(emoji => emoji.name);

		try {
			return await this.noteEditService.edit(actor, updatedNote.id, {
				createdAt: note.published ? new Date(note.published) : null,
				files,
				reply,
				renote: quote ?? null,
				processErrors: processErrors.length > 0 ? processErrors : null,
				name: note.name,
				cw,
				text,
				localOnly: false,
				visibility,
				visibleUsers,
				apMentions,
				apHashtags,
				apEmojis,
				poll,
				uri: note.id,
				url: url,
			}, silent);
		} catch (err: any) {
			if (err.name !== 'duplicated') {
				throw err;
			}
			this.logger.info('The note is already inserted while creating itself, reading again');
			const duplicate = await this.fetchNote(value);
			if (!duplicate) {
				throw new IdentifiableError('39c328e1-e829-458b-bfc9-65dcd513d1f8', `failed to update note ${entryUri}: the note update failed with duplication error even when there is no duplication. This is likely a bug.`);
			}
			return duplicate;
		}
	}

	/**
	 * Noteを解決します。
	 *
	 * Misskeyに対象のNoteが登録されていればそれを返し、そうでなければ
	 * リモートサーバーからフェッチしてMisskeyに登録しそれを返します。
	 */
	@bindThis
	public async resolveNote(value: string | IObject, options: { sentFrom?: string, resolver?: Resolver } = {}): Promise<MiNote | null> {
		const uri = getApId(value);

		if (!this.utilityService.isFederationAllowedUri(uri)) {
			throw new IdentifiableError('04620a7e-044e-45ce-b72c-10e1bdc22e69', `failed to resolve note ${uri}: host is blocked`);
		}

		//#region このサーバーに既に登録されていたらそれを返す
		const exist = await this.fetchNote(uri);
		if (exist) return exist;
		//#endregion

		// Bail if local URI doesn't exist
		if (this.utilityService.isUriLocal(uri)) {
			throw new IdentifiableError('cbac7358-23f2-4c70-833e-cffb4bf77913', `failed to resolve note ${uri}: URL is local and does not exist`);
		}

		const unlock = await this.appLockService.getApLock(uri);

		try {
			// Optimization: we can avoid re-fetching the value *if and only if* it matches the host authority that it was sent from.
			// Instances can create any object within their host authority, but anything outside of that MUST be untrusted.
			const haveSameAuthority = options.sentFrom && this.apUtilityService.haveSameAuthority(options.sentFrom, uri);
			const createFrom = haveSameAuthority ? value : uri;
			return await this.createNote(createFrom, undefined, options.resolver, true);
		} finally {
			unlock();
		}
	}

	@bindThis
	public async extractEmojis(tags: IObject | IObject[], host: string): Promise<MiEmoji[]> {
		// eslint-disable-next-line no-param-reassign
		host = this.utilityService.toPuny(host);

		const eomjiTags = toArray(tags).filter(isEmoji);

		const existingEmojis = await this.emojisRepository.findBy({
			host,
			name: In(eomjiTags.map(tag => tag.name.replaceAll(':', ''))),
		});

		return await Promise.all(eomjiTags.map(async tag => {
			const name = tag.name.replaceAll(':', '');
			tag.icon = toSingle(tag.icon);

			const exists = existingEmojis.find(x => x.name === name);

			if (exists) {
				if ((exists.updatedAt == null)
					|| (tag.id != null && exists.uri == null)
					|| (new Date(tag.updated) > exists.updatedAt)
					|| (tag.icon.url !== exists.originalUrl)
				) {
					await this.emojisRepository.update({
						host,
						name,
					}, {
						uri: tag.id,
						originalUrl: tag.icon.url,
						publicUrl: tag.icon.url,
						updatedAt: new Date(),
						// _misskey_license が存在しなければ `null`
						license: (tag._misskey_license?.freeText ?? null),
					});

					const emoji = await this.emojisRepository.findOneBy({ host, name });
					if (emoji == null) throw new Error(`emoji update failed: ${name}:${host}`);
					return emoji;
				}

				return exists;
			}

			this.logger.info(`register emoji host=${host}, name=${name}`);

			return await this.emojisRepository.insertOne({
				id: this.idService.gen(),
				host,
				name,
				uri: tag.id,
				originalUrl: tag.icon.url,
				publicUrl: tag.icon.url,
				updatedAt: new Date(),
				aliases: [],
				// _misskey_license が存在しなければ `null`
				license: (tag._misskey_license?.freeText ?? null)
			});
		}));
	}

	/**
	 * Fetches the note's quoted post.
	 * On success - returns the note.
	 * On skip (no quote) - returns undefined.
	 * On permanent error - returns null.
	 * On temporary error - throws an exception.
	 */
	private async getQuote(note: IPost, entryUri: string, resolver: Resolver): Promise<MiNote | null | undefined> {
		const quoteUris = new Set<string>();
		if (note._misskey_quote && typeof(note._misskey_quote as unknown) === 'string') quoteUris.add(note._misskey_quote);
		if (note.quoteUrl && typeof(note.quoteUrl as unknown) === 'string') quoteUris.add(note.quoteUrl);
		if (note.quoteUri && typeof(note.quoteUri as unknown) === 'string') quoteUris.add(note.quoteUri);

		// https://codeberg.org/fediverse/fep/src/branch/main/fep/044f/fep-044f.md
		if (note.quote && typeof(note.quote as unknown) === 'string') quoteUris.add(note.quote);

		// https://codeberg.org/fediverse/fep/src/branch/main/fep/e232/fep-e232.md
		const tags = toArray(note.tag).filter(tag => typeof(tag) === 'object' && isLink(tag));
		for (const tag of tags) {
			if (!tag.href || typeof (tag.href as unknown) !== 'string') continue;

			const mediaTypes = toArray(tag.mediaType);
			if (
				!mediaTypes.includes('application/ld+json; profile="https://www.w3.org/ns/activitystreams"') &&
				!mediaTypes.includes('application/activity+json')
			) continue;

			const rels = toArray(tag.rel);
			if (!rels.includes('https://misskey-hub.net/ns#_misskey_quote')) continue;

			quoteUris.add(tag.href);
		}

		// No quote, return undefined
		if (quoteUris.size < 1) return undefined;

		/**
		 * Attempts to resolve a quote by URI.
		 * Returns the note if successful, true if there's a retryable error, and false if there's a permanent error.
		 */
		const resolveQuote = async (uri: unknown): Promise<MiNote | boolean> => {
			if (typeof(uri) !== 'string' || !/^https?:/.test(uri)) {
				this.logger.warn(`Failed to resolve quote "${uri}" for note "${entryUri}": URI is invalid`);
				return false;
			}

			try {
				const quote = await this.resolveNote(uri, { resolver });

				if (quote == null) {
					this.logger.warn(`Failed to resolve quote "${uri}" for note "${entryUri}": fetch failed`);
					return false;
				}

				return quote;
			} catch (e) {
				this.logger.warn(`Failed to resolve quote "${uri}" for note "${entryUri}": ${renderInlineError(e)}`);
				return isRetryableError(e);
			}
		};

		const results = await Promise.all(Array.from(quoteUris).map(u => resolveQuote(u)));

		// Success - return the quote
		const quote = results.find(r => typeof(r) === 'object');
		if (quote) return quote;

		// Temporary / retryable error - throw error
		const tempError = results.find(r => r === true);
		if (tempError) throw new Error(`temporary error resolving quote for "${entryUri}"`);

		// Permanent error - return null
		return null;
	}

	/**
	 * Extracts and saves all media attachments from the provided note.
	 * Returns an array of all the created files.
	 */
	private async getAttachments(note: IPost, actor: MiRemoteUser): Promise<{ files: MiDriveFile[], hasFileError: boolean }> {
		const attachments = new Map<string, IApDocument & { url: string }>();

		// Extract inline media from HTML content.
		// Don't use source.content, _misskey_content, or anything else because those aren't HTML.
		const htmlContent = getContentByType(note, 'text/html', true);
		if (htmlContent) {
			for (const attach of extractMediaFromHtml(htmlContent)) {
				if (hasUrl(attach)) {
					attachments.set(attach.url, attach);
				}
			}
		}

		// Extract inline media from MFM / markdown content.
		const mfmContent =
			getContentByType(note, 'text/x.misskeymarkdown') ??
			getContentByType(note, 'text/markdown');
		if (mfmContent) {
			for (const attach of extractMediaFromMfm(mfmContent)) {
				if (hasUrl(attach)) {
					attachments.set(attach.url, attach);
				}
			}
		}

		// Some software (Peertube) attaches a thumbnail under "icon" instead of "attachment"
		const icon = getBestIcon(note);
		if (icon) {
			if (hasUrl(icon)) {
				attachments.set(icon.url, icon);
			}
		}

		// Populate AP attachments last, to overwrite any "fallback" elements that may have been inlined in HTML.
		// AP attachments should be considered canonical.
		for (const attach of toArray(note.attachment)) {
			if (hasUrl(attach)) {
				attachments.set(attach.url, attach);
			}
		}

		// Resolve all files w/ concurrency 2.
		// This prevents one big file from blocking the others.
		const limiter = promiseLimit<MiDriveFile | null>(2);
		const results = await Promise
			.all(Array
				.from(attachments.values())
				.map(attach => limiter(async () => {
					attach.sensitive ??= note.sensitive;
					return await this.resolveImage(actor, attach);
				})));

		// Process results
		let hasFileError = false;
		const files: MiDriveFile[] = [];
		for (const result of results) {
			if (result != null) {
				files.push(result);
			} else {
				hasFileError = true;
			}
		}

		return { files, hasFileError };
	}

	private async resolveImage(actor: MiRemoteUser, attachment: IApDocument & { url: string }): Promise<MiDriveFile | null> {
		try {
			return await this.apImageService.resolveImage(actor, attachment);
		} catch (err) {
			if (isRetryableError(err)) {
				this.logger.warn(`Temporary failure to resolve attachment at ${attachment.url}: ${renderInlineError(err)}`);
				throw err;
			} else {
				this.logger.warn(`Permanent failure to resolve attachment at ${attachment.url}: ${renderInlineError(err)}`);
				return null;
			}
		}
	}
}

function getBestIcon(note: IObject): IApDocument | null {
	const icons: IApDocument[] = toArray(note.icon);
	if (icons.length < 2) {
		return icons[0] ?? null;
	}

	return icons.reduce((best, i) => {
		if (!isApObject(i)) return best;
		if (!isDocument(i)) return best;
		if (!best) return i;
		if (!best.width || !best.height) return i;
		if (!i.width || !i.height) return best;
		if (i.width > best.width) return i;
		if (i.height > best.height) return i;
		return best;
	}, null as IApDocument | null) ?? null;
}

// Need this to make TypeScript happy...
function hasUrl<T extends IObject>(object: T): object is T & { url: string } {
	return typeof(object.url) === 'string';
}
