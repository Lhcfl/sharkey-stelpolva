import type { Account } from './account.js';
import type { Status } from './status.js';

export interface Conversation {
	id: string
	accounts: Array<Account>
	last_status: Status | null
	unread: boolean
}
