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
import cors from '@fastify/cors';
import secureJson from 'secure-json-parse';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions, FastifyBodyParser } from 'fastify';
import Stripe from 'stripe';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

@Injectable()
export class StripeHookServerService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private loggerService: LoggerService,
	) {
		//this.createServer = this.createServer.bind(this);
		this.logger = this.loggerService.getLogger('stripe', 'gray');
	}

	@bindThis
	private async stripehook(
		request: FastifyRequest,
		reply: FastifyReply,
	) {
		if (!this.config.stripeAgeCheck.enabled) return reply.code(400);

		const stripe = new Stripe(this.config.stripeAgeCheck.key);

		if (request.rawBody == null) {
			// Bad request
			reply.code(400);
			return;
		}

		const body = request.rawBody;

		const headers = request.headers;

		function error(status: number, error: { id: string }) {
			reply.code(status);
			return { error };
		}

		let event;

		// Verify the event came from Stripe
		try {
			const sig = headers['stripe-signature']!;
			event = stripe.webhooks.constructEvent(body, sig, this.config.stripeAgeCheck.hookKey);
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

				this.logger.succ(`${user.username} has succesfully approved their ID via Session ${verificationSession.client_reference_id}`);

				await this.usersRepository.update(user.id, { idCheckRequired: false, idVerified: true });

				break;
			}
		}

		reply.code(200)
		return { received: true };
		
		// never get here
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		const almostDefaultJsonParser: FastifyBodyParser<Buffer> = function (request, rawBody, done) {
			if (rawBody.length === 0) {
				const err = new Error('Body cannot be empty!') as any;
				err.statusCode = 400;
				return done(err);
			}

			try {
				const json = secureJson.parse(rawBody.toString('utf8'), null, {
					protoAction: 'ignore',
					constructorAction: 'ignore',
				});
				done(null, json);
			} catch (err: any) {
				err.statusCode = 400;
				return done(err);
			}
		};

		fastify.register(cors, {
			origin: '*',
		});

		fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, almostDefaultJsonParser);

		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
			done();
		});

		fastify.post<{
			Body: any,
			Headers: any,
		}>('/hook', { config: { rawBody: true }, bodyLimit: 1024 * 64 }, async (request, reply) => await this.stripehook(request, reply));

		done();
	}
}