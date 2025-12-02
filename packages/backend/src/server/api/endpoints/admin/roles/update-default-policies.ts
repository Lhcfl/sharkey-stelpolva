/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { MetaService } from '@/core/MetaService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin', 'role'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:roles',

	errors: {
		badValues: {
			message: 'Invalid policy values',
			code: 'BAD_POLICY_VALUES',
			id: '39d78ad7-0f00-4bff-b2e2-2e7db889e05d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		policies: {
			type: 'object',
		},
	},
	required: [
		'policies',
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
		private globalEventService: GlobalEventService,
		private moderationLogService: ModerationLogService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				this.roleService.assertValidDefaultPolicies(ps.policies);
			} catch (e) {
				if (e instanceof IdentifiableError) {
					if (e.id === '39d78ad7-0f00-4bff-b2e2-2e7db889e05d') {
						throw new ApiError(
							meta.errors.badValues,
							e.cause,
						);
					}
				}
				throw e;
			}

			const before = await this.metaService.fetch(true);

			await this.metaService.update({
				policies: ps.policies,
			});

			const after = await this.metaService.fetch(true);

			this.globalEventService.publishInternalEvent('policiesUpdated', after.policies);
			this.moderationLogService.log(me, 'updateServerSettings', {
				before: before.policies,
				after: after.policies,
			});
		});
	}
}
