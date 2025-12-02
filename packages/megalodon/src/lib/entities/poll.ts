import type { PollOption } from './poll_option.js';

export interface Poll {
	id: string
	expires_at: string | null
	expired: boolean
	multiple: boolean
	votes_count: number
	options: Array<PollOption>
	voted: boolean
	emojis?: []
	own_votes?: Array<number>
}
