import type { User } from './user.js';
import type { Emoji } from './emoji.js';
import type { Poll } from './poll.js';
import type { File } from './file.js';

export interface Note {
	id: string
	createdAt: string
	updatedAt?: string | null
	userId: string
	user: User
	text: string | null
	cw: string | null
	visibility: 'public' | 'home' | 'followers' | 'specified'
	renoteCount: number
	repliesCount: number
	reactions: { [key: string]: number }
	// This field includes only remote emojis
	reactionEmojis: { [key: string]: string }
	emojis: Array<Emoji> | { [key: string]: string }
	fileIds: Array<string>
	files: Array<File>
	replyId: string | null
	renoteId: string | null
	uri?: string
	url?: string
	reply?: Note
	renote?: Note
	viaMobile?: boolean
	tags?: Array<string>
	poll?: Poll
	mentions?: Array<string>
	myReaction?: string
}
