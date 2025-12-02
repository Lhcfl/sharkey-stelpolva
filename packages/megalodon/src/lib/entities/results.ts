import type { Account } from './account.js';
import type { Status } from './status.js';
import type { Tag } from './tag.js';

export interface Results {
	accounts: Array<Account>
	statuses: Array<Status>
	hashtags: Array<Tag>
}
