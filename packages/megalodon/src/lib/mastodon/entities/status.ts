import type { Attachment } from './attachment.js';
import type { Mention } from './mention.js';
import type { Card } from './card.js';
import type { Poll } from './poll.js';
import type { Application } from './application.js';
import type { Reaction } from './reaction.js';
import type { Account } from './account.js';
import type { Emoji } from './emoji.js';

export interface Status {
	id: string
	uri: string
	url: string
	account: Account
	in_reply_to_id: string | null
	in_reply_to_account_id: string | null
	reblog: Status | null
	content: string
	created_at: string
	edited_at?: string | null
	emojis: Emoji[]
	replies_count: number
	reblogs_count: number
	favourites_count: number
	reblogged: boolean | null
	favourited: boolean | null
	muted: boolean | null
	sensitive: boolean
	spoiler_text: string
	visibility: 'public' | 'unlisted' | 'private' | 'direct'
	media_attachments: Array<Attachment>
	mentions: Array<Mention>
	tags: Array<StatusTag>
	card: Card | null
	poll: Poll | null
	application: Application | null
	language: string | null
	pinned: boolean | null
	bookmarked?: boolean
	// These parameters are unique parameters in fedibird.com for quote.
	quote_id?: string
	quote?: Status | null
	// These parameters are unique to glitch-soc for emoji reactions.
	reactions?: Reaction[]
}

export interface StatusTag {
	name: string
	url: string
}
