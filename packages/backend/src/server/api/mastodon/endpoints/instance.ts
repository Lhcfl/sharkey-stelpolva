/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/_.js';
import { MastodonConverters } from '@/server/api/mastodon/MastodonConverters.js';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { RoleService } from '@/core/RoleService.js';
import type { FastifyInstance } from 'fastify';
import type { MastodonEntity } from 'megalodon';

@Injectable()
export class ApiInstanceMastodon {
	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.config)
		private readonly config: Config,

		private readonly mastoConverters: MastodonConverters,
		private readonly clientService: MastodonClientService,
		private readonly roleService: RoleService,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get('/v1/instance', async (_request, reply) => {
			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.getInstance();
			const contact = this.meta.rootUser != null
				? await this.mastoConverters.convertAccount(this.meta.rootUser)
				: null;
			const roles = await this.roleService.getUserPolicies(me?.id ?? null);

			const instance = data.data;
			const response: MastodonEntity.Instance = {
				uri: this.config.host,
				title: this.meta.name || 'Sharkey',
				description: this.meta.description || this.meta.about || 'This is a vanilla Sharkey Instance.',
				email: instance.email || '',
				version: `3.0.0 (compatible; Sharkey ${this.config.version}; like Akkoma)`,
				urls: instance.urls,
				stats: {
					user_count: instance.stats.user_count,
					status_count: instance.stats.status_count,
					domain_count: instance.stats.domain_count,
				},
				thumbnail: this.meta.backgroundImageUrl || '/static-assets/transparent.png',
				languages: this.meta.langs,
				registrations: !this.meta.disableRegistration || instance.registrations,
				approval_required: this.meta.approvalRequiredForSignup,
				invites_enabled: instance.registrations,
				configuration: {
					accounts: {
						max_featured_tags: 20,
						max_pinned_statuses: roles.pinLimit,
					},
					statuses: {
						max_characters: this.config.maxNoteLength,
						max_media_attachments: 16,
						characters_reserved_per_url: instance.uri.length,
					},
					media_attachments: {
						supported_mime_types: FILE_TYPE_BROWSERSAFE,
						image_size_limit: 10485760,
						image_matrix_limit: 16777216,
						video_size_limit: 41943040,
						video_frame_limit: 60,
						video_matrix_limit: 2304000,
					},
					polls: {
						max_options: 10,
						max_characters_per_option: 150,
						min_expiration: 50,
						max_expiration: 2629746,
					},
					reactions: {
						max_reactions: 1,
					},
				},
				contact_account: contact,
				rules: instance.rules ?? [],
			};

			return reply.send(response);
		});
	}
}
