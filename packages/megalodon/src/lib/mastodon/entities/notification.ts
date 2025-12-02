import type { Account } from './account.js';
import type { Status } from './status.js';

export interface Notification {
	account: Account
	created_at: string
	id: string
	status?: Status
	type: NotificationType
}

export type NotificationType = string
