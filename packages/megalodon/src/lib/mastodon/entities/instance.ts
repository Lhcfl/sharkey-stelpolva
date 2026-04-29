import type { Account } from './account.js';
import type { URLs } from './urls.js';
import type { Stats } from './stats.js';

export type Instance = {
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
	invites_enabled: boolean
	max_toot_chars?: number
	configuration: {
		statuses: {
			max_characters: number
			max_media_attachments: number
			characters_reserved_per_url: number
		}
		media_attachments: {
			supported_mime_types: Array<string>
			image_size_limit: number
			image_matrix_limit: number
			video_size_limit: number
			video_frame_limit: number
			video_matrix_limit: number
		}
		polls: {
			max_options: number
			max_characters_per_option: number
			min_expiration: number
			max_expiration: number
		}
		accounts: {
			max_featured_tags: number;
			max_pinned_statuses: number;
		}
		reactions: {
			max_reactions: number,
		}
	}
	contact_account: Account | null
	rules: Array<InstanceRule>
}

export interface InstanceRule {
	id: string
	text: string
}

export type InstanceV2 = {
	domain: string
	title: string
	version: string
	source_url: string | null
	description: string
	usage: {
		users: {
			active_month: number
		}
	}
	thumbnail: {
		url: string
		blurhash?: string
		versions?: Record<string, string>
	}
	icon: Array<{
		src: string
		size: string
	}>
	languages: Array<string>
	configuration: {
		urls: {
			streaming: string
			status: string | null
			about: string
			privacy_policy: string | null
			terms_of_service: string | null
		}
		vapid: {
			public_key: string | null
		}
		accounts: {
			max_featured_tags: number;
			max_pinned_statuses: number;
		}
		statuses: {
			max_characters: number
			max_media_attachments: number
			characters_reserved_per_url: number
		}
		media_attachments: {
			supported_mime_types: Array<string>
			description_limit: number
			image_size_limit: number
			image_matrix_limit: number
			video_size_limit: number
			video_frame_limit: number
			video_matrix_limit: number
		}
		polls: {
			max_options: number
			max_characters_per_option: number
			min_expiration: number
			max_expiration: number
		}
		reactions: {
			max_reactions: number,
		}
		translation: {
			enabled: boolean,
		}
		timelines_access: Record<'live_feeds' | 'hashtag_feeds' | 'trending_link_feeds', Record<'local' | 'remote', 'public' | 'authenticated' | 'disabled'>>
		limited_federation: boolean
	}
	registrations: {
		enabled: boolean
		approval_required: boolean
		reason_required: boolean | null
		message: string | null
		min_age: number | null
		url: string | null
	}
	api_versions: Record<string, number>
	contact: {
		email: string
		account: Account | null
	}
	rules: Array<InstanceRule>
}
