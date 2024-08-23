/*
 * SPDX-FileCopyrightText: marie and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type {
	UsersRepository,
} from '@/models/_.js';
import type { Config } from '@/config.js';
import type { MiLocalUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import Stripe from 'stripe';

@Injectable()
export class StripeHookApiService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
	) {
	}

	@bindThis
	public async stripehook(
		request: FastifyRequest,
		reply: FastifyReply,
	) {
		const stripe = new Stripe(this.config.stripekey);

		if (!request.rawBody) return reply.code(400).send('error');

		const body: any = request.rawBody

		const headers: any = request.headers;

		function error(status: number, error: { id: string }) {
			reply.code(status);
			return { error };
		}

		let event;
		console.log(body);
		// Verify the event came from Stripe
		try {
			const sig = headers['stripe-signature'];
			event = stripe.webhooks.constructEvent(body, sig, 'webhooksecretherewillbereplacedlaterwithconfig');
		} catch (err: any) {
			// On error, log and return the error message
			console.log(`❌ Error message: ${err.message}`);
			reply.code(400)
			return `Webhook Error: ${err.message}`;
		}

		// Successfully constructed event
		switch (event.type) {
			case 'identity.verification_session.verified': {
				// All the verification checks passed
				const verificationSession = event.data.object;

				const user = await this.usersRepository.findOneBy({
					id: verificationSession.metadata.user_id,
					host: IsNull(),
				}) as MiLocalUser;
		
				if (user == null) {
					return error(404, {
						id: '6cc579cc-885d-43d8-95c2-b8c7fc963280',
					});
				}
		
				if (user.isSuspended) {
					return error(403, {
						id: 'e03a5f46-d309-4865-9b69-56282d94e1eb',
					});
				}

				await this.usersRepository.update(user.id, { idCheckRequired: false, idVerified: true });

				break;
			}
		}

		reply.code(200)
		return { received: true };
		
		// never get here
	}
}