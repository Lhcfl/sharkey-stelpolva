/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import type { Config } from '@/config.js';
import { MetaService } from '@/core/MetaService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import { bindThis } from '@/decorators.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { InstanceStatsService } from '@/core/InstanceStatsService.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

const nodeinfo2_1path = '/nodeinfo/2.1';
const nodeinfo2_0path = '/nodeinfo/2.0';
const nodeinfo_homepage = 'https://misskey-hub.net';

@Injectable()
export class NodeinfoServerService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		private systemAccountService: SystemAccountService,
		private metaService: MetaService,
		private notesChart: NotesChart,
		private usersChart: UsersChart,
		private readonly instanceStatsService: InstanceStatsService,
	) {
		//this.createServer = this.createServer.bind(this);
	}

	@bindThis
	public getLinks() {
		return [{
			rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
			href: this.config.url + nodeinfo2_1path,
		}, {
			rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
			href: this.config.url + nodeinfo2_0path,
		}];
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		const nodeinfo2 = async (version: '2.0' | '2.1') => {
			const meta = this.meta;
			const stats = await this.instanceStatsService.fetch();
			const proxyAccount = await this.systemAccountService.fetch('proxy');

			const basePolicies = { ...DEFAULT_POLICIES, ...meta.policies };

			const software = {
				name: 'sharkey',
				version: this.config.version,
			};

			if (version !== '2.0') {
				Object.assign(software, {
					homepage: meta.repositoryUrl ?? nodeinfo_homepage,
					repository: meta.repositoryUrl,
				});
			}

			return {
				version,
				software,
				protocols: ['activitypub'],
				services: {
					inbound: [] as string[],
					outbound: ['atom1.0', 'rss2.0'],
				},
				openRegistrations: !meta.disableRegistration,
				usage: {
					users: {
						total: stats.usersTotal,
						activeHalfyear: stats.usersActiveSixMonths,
						activeMonth: stats.usersActiveMonth,
					},
					localPosts: stats.notesTotal,
					localComments: 0,
				},
				metadata: {
					nodeName: meta.name,
					nodeDescription: meta.description,
					nodeAdmins: [{
						name: meta.maintainerName,
						email: meta.maintainerEmail,
					}],
					// deprecated
					maintainer: {
						name: meta.maintainerName,
						email: meta.maintainerEmail,
					},
					langs: meta.langs,
					tosUrl: meta.termsOfServiceUrl,
					privacyPolicyUrl: meta.privacyPolicyUrl,
					inquiryUrl: meta.inquiryUrl,
					impressumUrl: meta.impressumUrl,
					donationUrl: meta.donationUrl,
					repositoryUrl: meta.repositoryUrl,
					feedbackUrl: meta.feedbackUrl,
					disableRegistration: meta.disableRegistration,
					disableLocalTimeline: !basePolicies.ltlAvailable,
					disableGlobalTimeline: !basePolicies.gtlAvailable,
					disableBubbleTimeline: !basePolicies.btlAvailable,
					emailRequiredForSignup: meta.emailRequiredForSignup,
					enableHcaptcha: meta.enableHcaptcha,
					enableRecaptcha: meta.enableRecaptcha,
					enableMcaptcha: meta.enableMcaptcha,
					enableTurnstile: meta.enableTurnstile,
					enableFC: meta.enableFC,
					maxNoteTextLength: this.config.maxNoteLength,
					maxRemoteNoteTextLength: this.config.maxRemoteNoteLength,
					maxCwLength: this.config.maxCwLength,
					maxRemoteCwLength: this.config.maxRemoteCwLength,
					maxAltTextLength: this.config.maxAltTextLength,
					maxRemoteAltTextLength: this.config.maxRemoteAltTextLength,
					maxBioLength: this.config.maxBioLength,
					maxRemoteBioLength: this.config.maxRemoteBioLength,
					enableEmail: meta.enableEmail,
					enableServiceWorker: meta.enableServiceWorker,
					proxyAccountName: proxyAccount.username,
					themeColor: meta.themeColor ?? '#86b300',
				},
			};
		};

		fastify.get(nodeinfo2_1path, async (request, reply) => {
			reply
				.type(
					'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"',
				)
				.header('Cache-Control', 'public, max-age=600')
				.header('Access-Control-Allow-Headers', 'Accept')
				.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
				.header('Access-Control-Allow-Origin', '*')
				.header('Access-Control-Expose-Headers', 'Vary');
			return await nodeinfo2('2.1');
		});

		fastify.get(nodeinfo2_0path, async (request, reply) => {
			reply
				.type(
					'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.0#"',
				)
				.header('Cache-Control', 'public, max-age=600')
				.header('Access-Control-Allow-Headers', 'Accept')
				.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
				.header('Access-Control-Allow-Origin', '*')
				.header('Access-Control-Expose-Headers', 'Vary');
			return await nodeinfo2('2.0');
		});

		done();
	}
}
