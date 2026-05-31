/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { TimeService } from '@/global/TimeService.js';
import { genAid, isSafeAidT, parseAid, parseAidFull } from '@/misc/id/aid.js';
import { genAidx, isSafeAidxT, parseAidx, parseAidxFull } from '@/misc/id/aidx.js';
import { genMeid, isSafeMeidT, parseMeid, parseMeidFull } from '@/misc/id/meid.js';
import { genMeidg, isSafeMeidgT, parseMeidg, parseMeidgFull } from '@/misc/id/meidg.js';
import { genObjectId, isSafeObjectIdT, parseObjectId, parseObjectIdFull } from '@/misc/id/object-id.js';
import { bindThis } from '@/decorators.js';
import { parseUlid, parseUlidFull } from '@/misc/id/ulid.js';

const MAX_SIMPLE_ID = Math.pow(2, 50);

@Injectable()
export class IdService {
	private readonly method: string;

	constructor(
		private readonly timeService: TimeService,

		@Inject(DI.config)
		config: Config,
	) {
		this.method = config.id.toLowerCase();
	}

	@bindThis
	public isSafeT(t: number): boolean {
		switch (this.method) {
			case 'aid': return isSafeAidT(t);
			case 'aidx': return isSafeAidxT(t);
			case 'meid': return isSafeMeidT(t);
			case 'meidg': return isSafeMeidgT(t);
			case 'ulid': return t > 0;
			case 'objectid': return isSafeObjectIdT(t);
			default: throw new Error('unrecognized id generation method');
		}
	}

	/**
	 * 時間を元にIDを生成します(省略時は現在日時)
	 * @param time 日時
	 */
	@bindThis
	public gen(time?: number): string {
		const t = (!time || (time > this.timeService.now)) ? this.timeService.now : time;

		switch (this.method) {
			case 'aid': return genAid(t);
			case 'aidx': return genAidx(t);
			case 'meid': return genMeid(t);
			case 'meidg': return genMeidg(t);
			case 'ulid': return ulid(t);
			case 'objectid': return genObjectId(t);
			default: throw new Error('unrecognized id generation method');
		}
	}

	/**
	 * Returns a non-cryptographically-secure 50-bit random ID encoded as a base-26 string.
	 * The output of this function is always 10 characters exactly, as 50 bits fits perfectly into 10 characters at 5 bits-per-character.
	 *
	 * Keep in sync with frontend randomId().
	 *
	 * @param random 	Unit float (0.0 to 1.0) used as source of random.
	 * 								Exposed for unit testing only; should be undefined for production mode!
	 * @returns 10-digit string containing 50 bits of non-secure entropy.
	 */
	@bindThis
	public genSimple(random?: number): string {
		if (random != null && random < 0) throw new Error(`random basis out of range: ${random}`);
		if (random != null && random > 1) throw new Error(`random basis out of range: ${random}`);
		const randomFloat = random ?? Math.random();
		const randomInt = Math.round(randomFloat * MAX_SIMPLE_ID);
		return randomInt.toString(26).padStart(10, '0');
	}

	@bindThis
	public parse(id: string): { date: Date; } {
		switch (this.method) {
			case 'aid': return parseAid(id);
			case 'aidx': return parseAidx(id);
			case 'objectid': return parseObjectId(id);
			case 'meid': return parseMeid(id);
			case 'meidg': return parseMeidg(id);
			case 'ulid': return parseUlid(id);
			default: throw new Error('unrecognized id generation method');
		}
	}

	// Note: additional is at most 64 bits
	@bindThis
	public parseFull(id: string): { date: number; additional: bigint; } {
		switch (this.method) {
			case 'aid': return parseAidFull(id);
			case 'aidx': return parseAidxFull(id);
			case 'objectid': return parseObjectIdFull(id);
			case 'meid': return parseMeidFull(id);
			case 'meidg': return parseMeidgFull(id);
			case 'ulid': return parseUlidFull(id);
			default: throw new Error('unrecognized id generation method');
		}
	}
}
