/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { LimitInfo } from '@/misc/rate-limit-utils.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';

/**
 * Fake implementation of SkRateLimiterService that does not enforce any limits.
 */
@Injectable()
export class FakeSkRateLimiterService extends SkRateLimiterService {
	async limit(): Promise<LimitInfo> {
		return {
			blocked: false,
			remaining: Number.MAX_SAFE_INTEGER,
			resetMs: 0,
			resetSec: 0,
			fullResetMs: 0,
			fullResetSec: 0,
		};
	}
}
