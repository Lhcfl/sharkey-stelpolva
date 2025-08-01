/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IdentifiableError } from '@/misc/identifiable-error.js';
import { fromTuple } from '@/misc/from-tuple.js';

export type Obj = { [x: string]: any };
export type ApObject = IObject | string | (IObject | string)[];

export interface IObject {
	'@context'?: string | string[] | Obj | Obj[];
	type: string | string[];
	id?: string;
	name?: string | null;
	summary?: string | null;
	_misskey_summary?: string;
	_misskey_followedMessage?: string | null;
	_misskey_requireSigninToViewContents?: boolean;
	_misskey_makeNotesFollowersOnlyBefore?: number | null;
	_misskey_makeNotesHiddenBefore?: number | null;
	published?: string;
	cc?: ApObject;
	to?: ApObject;
	attributedTo?: ApObject;
	attachment?: IApDocument[];
	inReplyTo?: any;
	replies?: ICollection | IOrderedCollection | string;
	content?: string | null;
	startTime?: Date; // TODO these are wrong - should be string
	endTime?: Date; // TODO these are wrong - should be string
	updated?: string;
	icon?: any;
	image?: any;
	mediaType?: string;
	url?: ApObject | string;
	href?: string;
	rel?: string | string[];
	tag?: IObject | IObject[];
	sensitive?: boolean;
}

export interface IObjectWithId extends IObject {
	id: string;
}

export function isObjectWithId(object: IObject): object is IObjectWithId {
	return typeof(object.id) === 'string';
}

export interface IAnonymousObject extends IObject {
	id: undefined;
}

export function isAnonymousObject(object: IObject): object is IAnonymousObject {
	return object.id === undefined;
}

export interface ILink extends IObject {
	'@context'?: string | string[] | Obj | Obj[];
	type: 'Link' | 'Mention';
	href: string;
}

export const isLink = (object: IObject): object is ILink =>
	(getApType(object) === 'Link' || getApType(object) === 'Link') &&
	typeof object.href === 'string';

/**
 * Get array of ActivityStreams Objects id
 */
export function getApIds(value: ApObject | undefined): string[] {
	if (value == null) return [];
	const array = Array.isArray(value) ? value : [value];
	return array.map(x => getApId(x));
}

/**
 * Get first ActivityStreams Object id
 */
export function getOneApId(value: ApObject): string {
	const firstOne = Array.isArray(value) ? value[0] : value;
	return getApId(firstOne);
}

/**
 * Get ActivityStreams Object id
 */
export function getApId(value: unknown | [unknown] | unknown[], sourceForLogs?: string): string {
	const id = getNullableApId(value);

	if (id == null) {
		const message = sourceForLogs
			? `invalid AP object ${value} (sent from ${sourceForLogs}): missing id`
			: `invalid AP object ${value}: missing id`;
		throw new IdentifiableError('ad2dc287-75c1-44c4-839d-3d2e64576675', message);
	}

	return id;
}

/**
 * Get ActivityStreams Object id, or null if not present
 */
export function getNullableApId(source: unknown | [unknown] | unknown[]): string | null {
	const value: unknown = fromTuple(source);

	if (value != null) {
		if (typeof value === 'string') {
			return value;
		}
		if (typeof (value) === 'object' && 'id' in value && typeof (value.id) === 'string') {
			return value.id;
		}
	}

	return null;
}

/**
 * Get ActivityStreams Object type
 *
 * タイプ判定ができなかった場合に、あえてエラーではなくnullを返すようにしている。
 * 詳細: https://github.com/misskey-dev/misskey/issues/14239
 */
export function getApType(value: IObject): string | null {
	if (typeof value.type === 'string') return value.type;
	if (Array.isArray(value.type) && typeof value.type[0] === 'string') return value.type[0];
	return null;
}

export function getOneApHrefNullable(value: ApObject | undefined): string | undefined {
	const firstOne = Array.isArray(value) ? value[0] : value;
	return getApHrefNullable(firstOne);
}

export function getApHrefNullable(value: string | IObject | undefined): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value?.href === 'string') return value.href;
	return undefined;
}

export interface IActivity extends IObject {
	//type: 'Activity';
	actor: IObject | string;
	// ActivityPub spec allows for arrays: https://www.w3.org/TR/activitystreams-vocabulary/#properties
	// Misskey can only handle one value, so we use a tuple for that case.
	object: IObject | string | [IObject | string];
	target?: IObject | string;
	/** LD-Signature */
	signature?: {
		type: string;
		created: Date;
		creator: string;
		domain?: string;
		nonce?: string;
		signatureValue: string;
	};
}

export interface CollectionBase extends IObject {
	totalItems?: number;
	first?: IObject | string;
	last?: IObject | string;
	current?: IObject | string;
	partOf?: IObject | string;
	next?: IObject | string;
	prev?: IObject | string;
	items?: ApObject;
	orderedItems?: ApObject;
}

export interface ICollection extends CollectionBase {
	type: 'Collection';
	totalItems: number;
	items?: ApObject;
	orderedItems?: undefined;
}

export interface IOrderedCollection extends CollectionBase {
	type: 'OrderedCollection';
	totalItems: number;
	items?: undefined;
	orderedItems?: ApObject;
}

export interface ICollectionPage extends CollectionBase {
	type: 'CollectionPage';
	items?: ApObject;
	orderedItems?: undefined;
}

export interface IOrderedCollectionPage extends CollectionBase {
	type: 'OrderedCollectionPage';
	items?: undefined;
	orderedItems?: ApObject;
}

export type AnyCollection = ICollection | IOrderedCollection | ICollectionPage | IOrderedCollectionPage;

export const validPost = ['Note', 'Question', 'Article', 'Audio', 'Document', 'Image', 'Page', 'Video', 'Event'];

export const isPost = (object: IObject): object is IPost => {
	const type = getApType(object);
	return type != null && validPost.includes(type);
};

export interface IPost extends IObject {
	type: 'Note' | 'Question' | 'Article' | 'Audio' | 'Document' | 'Image' | 'Page' | 'Video' | 'Event';
	source?: {
		content: string;
		mediaType: string;
	};
	_misskey_quote?: string;
	_misskey_content?: string;
	quoteUrl?: string;
	quoteUri?: string;
	quote?: string;
}

export interface IQuestion extends IObject {
	type: 'Note' | 'Question';
	actor: string;
	source?: {
		content: string;
		mediaType: string;
	};
	_misskey_quote?: string;
	quoteUrl?: string;
	quoteUri?: string;
	oneOf?: IQuestionChoice[];
	anyOf?: IQuestionChoice[];
	endTime?: Date;
	closed?: Date;
}

export const isQuestion = (object: IObject): object is IQuestion =>
	getApType(object) === 'Note' || getApType(object) === 'Question';

interface IQuestionChoice {
	name?: string;
	replies?: ICollection;
	_misskey_votes?: number;
}
export interface ITombstone extends IObject {
	type: 'Tombstone';
	formerType?: string;
	deleted?: Date;
}

export const isTombstone = (object: IObject): object is ITombstone =>
	getApType(object) === 'Tombstone';

export const validActor = ['Person', 'Service', 'Group', 'Organization', 'Application'];

export const isActor = (object: IObject): object is IActor => {
	const type = getApType(object);
	return type != null && validActor.includes(type);
};

export interface IActor extends IObject {
	type: 'Person' | 'Service' | 'Organization' | 'Group' | 'Application';
	name?: string;
	preferredUsername?: string;
	manuallyApprovesFollowers?: boolean;
	movedTo?: string;
	alsoKnownAs?: string[];
	discoverable?: boolean | null;
	inbox: string;
	sharedInbox?: string;	// 後方互換性のため
	publicKey?: {
		id: string;
		publicKeyPem: string;
	};
	followers?: string | ICollection | IOrderedCollection;
	following?: string | ICollection | IOrderedCollection;
	featured?: string | IOrderedCollection;
	outbox?: string | IOrderedCollection;
	endpoints?: {
		sharedInbox?: string;
	};
	'vcard:bday'?: string;
	'vcard:Address'?: string;
	hideOnlineStatus?: boolean;
	noindex?: boolean;
	enableRss?: boolean;
	listenbrainz?: string;
	backgroundUrl?: string;
	attributionDomains?: string[];
}

export const isCollection = (object: IObject): object is ICollection =>
	getApType(object) === 'Collection';

export const isOrderedCollection = (object: IObject): object is IOrderedCollection =>
	getApType(object) === 'OrderedCollection';

export const isCollectionPage = (object: IObject): object is ICollectionPage =>
	getApType(object) === 'CollectionPage';

export const isOrderedCollectionPage = (object: IObject): object is IOrderedCollectionPage =>
	getApType(object) === 'OrderedCollectionPage';

export const isCollectionOrOrderedCollection = (object: IObject): object is AnyCollection =>
	isCollection(object) || isOrderedCollection(object) || isCollectionPage(object) || isOrderedCollectionPage(object);

export interface IApPropertyValue extends IObject {
	type: 'PropertyValue';
	identifier: IApPropertyValue;
	name: string;
	value: string;
}

export const isPropertyValue = (object: IObject): object is IApPropertyValue =>
	getApType(object) === 'PropertyValue' &&
	typeof object.name === 'string' &&
	'value' in object &&
	typeof object.value === 'string';

export interface IApMention extends ILink {
	type: 'Mention';
	name: string;
}

export const isMention = (object: IObject): object is IApMention =>
	getApType(object) === 'Mention' &&
	typeof object.href === 'string';

export interface IApHashtag extends IObject {
	type: 'Hashtag';
	name: string;
}

export const isHashtag = (object: IObject): object is IApHashtag =>
	getApType(object) === 'Hashtag' &&
	typeof object.name === 'string';

export interface IApEmoji extends IObject {
	type: 'Emoji';
	name: string;
	updated: string;
	// Misskey拡張。後方互換性のためにoptional。
	// 将来の拡張性を考慮してobjectにしている
	_misskey_license?: {
		freeText: string | null;
	};
}

export const isEmoji = (object: IObject): object is IApEmoji =>
	getApType(object) === 'Emoji' && !Array.isArray(object.icon) && object.icon.url != null;

export interface IKey extends IObject {
	type: 'Key';
	owner: string;
	publicKeyPem: string | Buffer;
}

export const validDocumentTypes = ['Audio', 'Document', 'Image', 'Page', 'Video'];

export interface IApDocument extends IObject {
	type: 'Audio' | 'Document' | 'Image' | 'Page' | 'Video';
	width?: number;
	height?: number;
}

export const isDocument = (object: IObject): object is IApDocument => {
	const type = getApType(object);
	return type != null && validDocumentTypes.includes(type);
};

export interface IApImage extends IApDocument {
	type: 'Image';
}

export interface ICreate extends IActivity {
	type: 'Create';
}

export interface IDelete extends IActivity {
	type: 'Delete';
}

export interface IUpdate extends IActivity {
	type: 'Update';
}

export interface IRead extends IActivity {
	type: 'Read';
}

export interface IUndo extends IActivity {
	type: 'Undo';
}

export interface IFollow extends IActivity {
	type: 'Follow';
}

export interface IAccept extends IActivity {
	type: 'Accept';
}

export interface IReject extends IActivity {
	type: 'Reject';
}

export interface IAdd extends IActivity {
	type: 'Add';
}

export interface IRemove extends IActivity {
	type: 'Remove';
}

export interface ILike extends IActivity {
	type: 'Like' | 'EmojiReaction' | 'EmojiReact';
	_misskey_reaction?: string;
}

export interface IDislike extends IActivity {
	type: 'Dislike';
}

export interface IAnnounce extends IActivity {
	type: 'Announce';
}

export interface IBlock extends IActivity {
	type: 'Block';
}

export interface IFlag extends IActivity {
	type: 'Flag';
}

export interface IMove extends IActivity {
	type: 'Move';
	target: IObject | string;
}

export const validActivityTypes = ['Announce', 'Create', 'Update', 'Delete', 'Undo', 'Follow', 'Accept', 'Reject', 'Add', 'Remove', 'Like', 'Dislike', 'EmojiReaction', 'EmojiReact', 'Flag', 'Block', 'Move'];

export const isActivity = (object: IObject): object is IActivity => {
	const type = getApType(object);
	return type != null && validActivityTypes.includes(type);
};

export const isApObject = (object: string | IObject): object is IObject => typeof(object) === 'object';
export const isCreate = (object: IObject): object is ICreate => getApType(object) === 'Create';
export const isDelete = (object: IObject): object is IDelete => getApType(object) === 'Delete';
export const isUpdate = (object: IObject): object is IUpdate => getApType(object) === 'Update';
export const isRead = (object: IObject): object is IRead => getApType(object) === 'Read';
export const isUndo = (object: IObject): object is IUndo => getApType(object) === 'Undo';
export const isFollow = (object: IObject): object is IFollow => getApType(object) === 'Follow';
export const isAccept = (object: IObject): object is IAccept => getApType(object) === 'Accept';
export const isReject = (object: IObject): object is IReject => getApType(object) === 'Reject';
export const isAdd = (object: IObject): object is IAdd => getApType(object) === 'Add';
export const isRemove = (object: IObject): object is IRemove => getApType(object) === 'Remove';
export const isLike = (object: IObject): object is ILike => {
	const type = getApType(object);
	return type != null && ['Like', 'EmojiReaction', 'EmojiReact'].includes(type);
};
export const isDislike = (object: IObject): object is IDislike => getApType(object) === 'Dislike';
export const isAnnounce = (object: IObject): object is IAnnounce => getApType(object) === 'Announce';
export const isBlock = (object: IObject): object is IBlock => getApType(object) === 'Block';
export const isFlag = (object: IObject): object is IFlag => getApType(object) === 'Flag';
export const isMove = (object: IObject): object is IMove => getApType(object) === 'Move';
export const isNote = (object: IObject): object is IPost => getApType(object) === 'Note';
