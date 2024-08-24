/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Limiter from 'ratelimiter';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import type { IEndpointMeta } from './endpoints.js';

@Injectable()
export class RateLimiterService {
	private logger: Logger;
	private disabled = false;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('limiter');

		if (process.env.NODE_ENV !== 'production') {
			this.disabled = true;
		}
	}

	@bindThis
	public limit(limitation: IEndpointMeta['limit'] & { key: NonNullable<string> }, actor: string, factor = 1) {
		{
			if (this.disabled) {
				return Promise.resolve();
			}

			// those lines with the "wrong" brace style / indentation are
			// done that way so that the *other* lines stay identical to
			// Misskey, simplifying merges

			// Short-term limit
			// eslint-disable-next-line brace-style
			const minP = () => { return new Promise<void>((ok, reject) => {
				const minIntervalLimiter = new Limiter({
					id: `${actor}:${limitation.key}:min`,
					duration: limitation.minInterval! * factor,
					max: 1,
					db: this.redisClient,
				});

				minIntervalLimiter.get((err, info) => {
					if (err) {
						return reject({ code: 'ERR', info });
					}

					this.logger.debug(`${actor} ${limitation.key} min remaining: ${info.remaining}`);

					if (info.remaining === 0) {
						return reject({ code: 'BRIEF_REQUEST_INTERVAL', info });
					} else {
						if (hasLongTermLimit) {
							return maxP().then(ok, reject);
						} else {
							return ok();
						}
					}
				});
			// eslint-disable-next-line brace-style
			}); };

			// Long term limit
			// eslint-disable-next-line brace-style
			const maxP = () => { return new Promise<void>((ok, reject) => {
				const limiter = new Limiter({
					id: `${actor}:${limitation.key}`,
					duration: limitation.duration! * factor,
					max: limitation.max! / factor,
					db: this.redisClient,
				});

				limiter.get((err, info) => {
					if (err) {
						return reject({ code: 'ERR', info });
					}

					this.logger.debug(`${actor} ${limitation.key} max remaining: ${info.remaining}`);

					if (info.remaining === 0) {
						return reject({ code: 'RATE_LIMIT_EXCEEDED', info });
					} else {
						return ok();
					}
				});
			// eslint-disable-next-line brace-style
			}); };

			const hasShortTermLimit = typeof limitation.minInterval === 'number';

			const hasLongTermLimit =
				typeof limitation.duration === 'number' &&
				typeof limitation.max === 'number';

			if (hasShortTermLimit) {
				return minP();
			} else if (hasLongTermLimit) {
				return maxP();
			} else {
				return Promise.resolve();
			}
		}
	}
}
