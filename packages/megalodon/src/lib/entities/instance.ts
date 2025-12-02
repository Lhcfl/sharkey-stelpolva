import type { URLs } from './urls.js';
import type { Stats } from './stats.js';
import type { Account } from './account.js';

export interface Instance {
	uri: string
	title: string
	description: string
	email: string
	version: string
	thumbnail: string | null
	urls: URLs
	stats: Stats
	languages: Array<string>
	registrations: boolean
	approval_required: boolean
	invites_enabled?: boolean
	configuration: {
		statuses: {
			max_characters: number
			max_media_attachments?: number
			characters_reserved_per_url?: number
		}
		polls?: {
			max_options: number
			max_characters_per_option: number
			min_expiration: number
			max_expiration: number
		}
	}
	contact_account?: Account
	rules?: Array<InstanceRule>
}

export interface InstanceRule {
	id: string
	text: string
}
