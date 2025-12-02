import type { Account } from './account.js';
import type { Emoji } from './emoji.js';
import type { Attachment } from './attachment.js';
import type { Poll } from './poll.js';

export interface StatusEdit {
	account: Account;
	content: string;
	plain_content: string | null;
	created_at: string;
	emojis: Emoji[];
	sensitive: boolean;
	spoiler_text: string;
	media_attachments: Array<Attachment>;
	poll: Poll | null;
}
