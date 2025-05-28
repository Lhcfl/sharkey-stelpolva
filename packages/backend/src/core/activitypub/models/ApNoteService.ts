/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
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
import { getOneApId, getApId, validPost, isEmoji, getApType, isApObject, isDocument, IApDocument } from '../type.js';
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
		this.apUtilityService.assertApUrl(uri);
		const expectHost = this.utilityService.extractDbHost(uri);
		const apType = getApType(object);

		if (apType == null || !validPost.includes(apType)) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: invalid object type ${apType ?? 'undefined'}`);
		}

		if (object.id && this.utilityService.extractDbHost(object.id) !== expectHost) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: id has different host. expected: ${expectHost}, actual: ${this.utilityService.extractDbHost(object.id)}`);
		}

		const actualHost = object.attributedTo && this.utilityService.extractDbHost(getOneApId(object.attributedTo));
		if (object.attributedTo && actualHost !== expectHost) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: attributedTo has different host. expected: ${expectHost}, actual: ${actualHost}`);
		}

		if (object.published && !this.idService.isSafeT(new Date(object.published).valueOf())) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', 'invalid Note: published timestamp is malformed');
		}

		if (actor) {
			const attribution = (object.attributedTo) ? getOneApId(object.attributedTo) : actor.uri;
			if (attribution !== actor.uri) {
				return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: attribution does not match the actor that send it. attribution: ${attribution}, actor: ${actor.uri}`);
			}
			if (user && attribution !== user.uri) {
				return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: updated attribution does not match original attribution. updated attribution: ${user.uri}, original attribution: ${attribution}`);
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
			this.logger.error(err.message, {
				resolver: { history: resolver.getHistory() },
				value,
				object,
			});
			throw err;
		}

		const note = object as IPost;

		this.logger.debug(`Note fetched: ${JSON.stringify(note, null, 2)}`);

		if (note.id == null) {
			throw new UnrecoverableError(`Refusing to create note without id: ${entryUri}`);
		}

		if (!checkHttps(note.id)) {
			throw new UnrecoverableError(`unexpected schema of note.id ${note.id} in ${entryUri}`);
		}

		const url = this.apUtilityService.findBestObjectUrl(note);

		this.logger.info(`Creating the Note: ${note.id}`);

		// 投稿者をフェッチ
		if (note.attributedTo == null) {
			throw new UnrecoverableError(`invalid note.attributedTo ${note.attributedTo} in ${entryUri}`);
		}

		const uri = getOneApId(note.attributedTo);

		// ローカルで投稿者を検索し、もし凍結されていたらスキップ
		// eslint-disable-next-line no-param-reassign
		actor ??= await this.apPersonService.fetchPerson(uri) as MiRemoteUser | undefined;
		if (actor && actor.isSuspended) {
			throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', `actor ${uri} has been suspended: ${entryUri}`);
		}

		const apMentions = await this.apMentionService.extractApMentions(note.tag, resolver);
		const apHashtags = extractApHashtags(note.tag);

		const cw = note.summary === '' ? null : note.summary;

		// テキストのパース
		let text: string | null = null;
		if (note.source?.mediaType === 'text/x.misskeymarkdown' && typeof note.source.content === 'string') {
			text = note.source.content;
		} else if (typeof note._misskey_content !== 'undefined') {
			text = note._misskey_content;
		} else if (typeof note.content === 'string') {
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
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', `Note contains prohibited words: ${entryUri}`);
		}
		//#endregion

		// eslint-disable-next-line no-param-reassign
		actor ??= await this.apPersonService.resolvePerson(uri, resolver) as MiRemoteUser;

		// 解決した投稿者が凍結されていたらスキップ
		if (actor.isSuspended) {
			throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', `actor has been suspended: ${entryUri}`);
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

		// 添付ファイル
		const files: MiDriveFile[] = [];

		for (const attach of toArray(note.attachment)) {
			attach.sensitive ??= note.sensitive;
			const file = await this.apImageService.resolveImage(actor, attach);
			if (file) files.push(file);
		}

		// Some software (Peertube) attaches a thumbnail under "icon" instead of "attachment"
		const icon = getBestIcon(note);
		if (icon) {
			icon.sensitive ??= note.sensitive;
			const file = await this.apImageService.resolveImage(actor, icon);
			if (file) files.push(file);
		}

		// リプライ
		const reply: MiNote | null = note.inReplyTo
			? await this.resolveNote(note.inReplyTo, { resolver })
				.then(x => {
					if (x == null) {
						this.logger.warn('Specified inReplyTo, but not found');
						throw new Error(`could not fetch inReplyTo ${note.inReplyTo} for note ${entryUri}`);
					}

					return x;
				})
				.catch(async err => {
					this.logger.warn(`error ${err.statusCode ?? err} fetching inReplyTo ${note.inReplyTo} for note ${entryUri}`);
					this.logger.warn(`Error in inReplyTo ${note.inReplyTo} - ${err.statusCode ?? err}`);
					if (visibility === 'followers') { throw err; } // private reply
					if (err.message === 'Instance is blocked') { throw err; }
					if (err.message === 'blocked host') { throw err; }
					if (err instanceof IdentifiableError) {
						if (err.id === '85ab9bd7-3a41-4530-959d-f07073900109') { throw err; } // actor has been suspended
						if (err.id === 'd592da9f-822f-4d91-83d7-4ceefabcf3d2') { return null; } // hit recursion limit:
					}
					if (err instanceof StatusError) {
						if (err.statusCode === 404) { return null; } // eat 404 error
					}
					if (err instanceof UnrecoverableError) {
						return null; // eat unrecoverableerror
					}
					throw err;
				})
			: null;

		// 引用
		const quote = await this.getQuote(note, entryUri, resolver);
		const processErrors = quote === null ? ['quoteUnavailable'] : null;

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
				processErrors,
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
				throw new Error(`The note creation failed with duplication error even when there is no duplication: ${entryUri}`);
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
		if (noteUri.startsWith(this.config.url + '/')) throw new UnrecoverableError(`uri points local: ${noteUri}`);

		//#region このサーバーに既に登録されているか
		const updatedNote = await this.notesRepository.findOneBy({ uri: noteUri });
		if (updatedNote == null) throw new Error(`Note is not registered (no note): ${noteUri}`);

		const user = await this.usersRepository.findOneBy({ id: updatedNote.userId }) as MiRemoteUser | null;
		if (user == null) throw new Error(`Note is not registered (no user): ${noteUri}`);

		// eslint-disable-next-line no-param-reassign
		if (resolver == null) resolver = this.apResolverService.createResolver();

		const object = await resolver.resolve(value);

		const entryUri = getApId(value);
		const err = this.validateNote(object, entryUri, actor, user);
		if (err) {
			this.logger.error(err.message, {
				resolver: { history: resolver.getHistory() },
				value,
				object,
			});
			throw err;
		}

		// `validateNote` checks that the actor and user are one and the same
		// eslint-disable-next-line no-param-reassign
		actor ??= user;

		const note = object as IPost;

		this.logger.debug(`Note fetched: ${JSON.stringify(note, null, 2)}`);

		if (note.id == null) {
			throw new UnrecoverableError(`Refusing to update note without id: ${noteUri}`);
		}

		if (!checkHttps(note.id)) {
			throw new UnrecoverableError(`unexpected schema of note.id ${note.id} in ${noteUri}`);
		}

		const url = this.apUtilityService.findBestObjectUrl(note);

		this.logger.info(`Creating the Note: ${note.id}`);

		if (actor.isSuspended) {
			throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', `actor ${actor.id} has been suspended: ${noteUri}`);
		}

		const apMentions = await this.apMentionService.extractApMentions(note.tag, resolver);
		const apHashtags = extractApHashtags(note.tag);

		const cw = note.summary === '' ? null : note.summary;

		// テキストのパース
		let text: string | null = null;
		if (note.source?.mediaType === 'text/x.misskeymarkdown' && typeof note.source.content === 'string') {
			text = note.source.content;
		} else if (typeof note._misskey_content !== 'undefined') {
			text = note._misskey_content;
		} else if (typeof note.content === 'string') {
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
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', `Note contains prohibited words: ${noteUri}`);
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

		// 添付ファイル
		const files: MiDriveFile[] = [];

		for (const attach of toArray(note.attachment)) {
			attach.sensitive ??= note.sensitive;
			const file = await this.apImageService.resolveImage(actor, attach);
			if (file) files.push(file);
		}

		// Some software (Peertube) attaches a thumbnail under "icon" instead of "attachment"
		const icon = getBestIcon(note);
		if (icon) {
			icon.sensitive ??= note.sensitive;
			const file = await this.apImageService.resolveImage(actor, icon);
			if (file) files.push(file);
		}

		// リプライ
		const reply: MiNote | null = note.inReplyTo
			? await this.resolveNote(note.inReplyTo, { resolver })
				.then(x => {
					if (x == null) {
						this.logger.warn('Specified inReplyTo, but not found');
						throw new Error(`could not fetch inReplyTo ${note.inReplyTo} for note ${entryUri}`);
					}

					return x;
				})
				.catch(async err => {
					this.logger.warn(`error ${err.statusCode ?? err} fetching inReplyTo ${note.inReplyTo} for note ${entryUri}`);
					throw err;
				})
			: null;

		// 引用
		const quote = await this.getQuote(note, entryUri, resolver);
		const processErrors = quote === null ? ['quoteUnavailable'] : null;

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
				processErrors,
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
				throw new Error(`The note creation failed with duplication error even when there is no duplication: ${noteUri}`);
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
			// TODO convert to identifiable error
			throw new StatusError(`blocked host: ${uri}`, 451, 'blocked host');
		}

		//#region このサーバーに既に登録されていたらそれを返す
		const exist = await this.fetchNote(uri);
		if (exist) return exist;
		//#endregion

		// Bail if local URI doesn't exist
		if (this.utilityService.isUriLocal(uri)) {
			// TODO convert to identifiable error
			throw new StatusError(`cannot resolve local note: ${uri}`, 400, 'cannot resolve local note');
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
		if (note._misskey_quote) quoteUris.add(note._misskey_quote);
		if (note.quoteUrl) quoteUris.add(note.quoteUrl);
		if (note.quoteUri) quoteUris.add(note.quoteUri);

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
					this.logger.warn(`Failed to resolve quote "${uri}" for note "${entryUri}": request error`);
					return false;
				}

				return quote;
			} catch (e) {
				if (e instanceof Error) {
					this.logger.warn(`Failed to resolve quote "${uri}" for note "${entryUri}":`, e);
				} else {
					this.logger.warn(`Failed to resolve quote "${uri}" for note "${entryUri}": ${e}`);
				}

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
}

function getBestIcon(note: IObject): IObject | null {
	const icons: IObject[] = toArray(note.icon);
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
