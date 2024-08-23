/*
 * SPDX-FileCopyrightText: marie and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '../../error.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import Stripe from 'stripe';
import type { Config } from '@/config.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: "read:account",

	res: {
		type: 'object',
		optional: false, nullable: false,
	},

	errors: {
		userIsDeleted: {
			message: 'User is deleted.',
			code: 'USER_IS_DELETED',
			id: 'e5b3b9f0-2b8f-4b9f-9c1f-8c5c1b2e1b1a',
			kind: 'permission',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.config)
		private config: Config,
	) {
		super(meta, paramDef, async (ps, me) => {
			const userProfile = await this.usersRepository.findOne({
				where: {
					id: me.id,
				}
			});

			const stripe = new Stripe(config.stripekey);

			if (userProfile == null) {
				throw new ApiError(meta.errors.userIsDeleted);
			}

			const verificationSession = await stripe.identity.verificationSessions.create({
				type: 'document',
				metadata: {
					user_id: me.id,
				},
			});

			await this.usersRepository.update(me.id, {
				idSession: verificationSession.client_reference_id,
			});

			return { 'url': verificationSession.url };
		});
	}
}