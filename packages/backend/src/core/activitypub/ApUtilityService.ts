/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { UtilityService } from '@/core/UtilityService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { toArray } from '@/misc/prelude/array.js';
import { getApId, getNullableApId, getOneApHrefNullable } from '@/core/activitypub/type.js';
import type { IObject, IObjectWithId } from '@/core/activitypub/type.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

@Injectable()
export class ApUtilityService {
	private readonly logger: Logger;

	constructor(
		private readonly utilityService: UtilityService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('ap-utility');
	}

	/**
	 * Verifies that the object's ID has the same authority as the provided URL.
	 * Returns on success, throws on any validation error.
	 */
	@bindThis
	public assertIdMatchesUrlAuthority(object: IObject, url: string): void {
		// This throws if the ID is missing or invalid, but that's ok.
		// Anonymous objects are impossible to verify, so we don't allow fetching them.
		const id = getApId(object, url);

		// Make sure the object ID matches the final URL (which is where it actually exists).
		// The caller (ApResolverService) will verify the ID against the original / entry URL, which ensures that all three match.
		if (!this.haveSameAuthority(url, id)) {
			throw new IdentifiableError('fd93c2fa-69a8-440f-880b-bf178e0ec877', `invalid AP object ${url}: id ${id} has different host authority`);
		}
	}

	/**
	 * Checks if two URLs have the same host authority
	 */
	@bindThis
	public haveSameAuthority(url1: string, url2: string): boolean {
		if (url1 === url2) return true;

		const parsed1 = this.utilityService.assertUrl(url1);
		const parsed2 = this.utilityService.assertUrl(url2);

		const authority1 = this.utilityService.punyHostPSLDomain(parsed1);
		const authority2 = this.utilityService.punyHostPSLDomain(parsed2);
		return authority1 === authority2;
	}

	/**
	 * Finds the "best" URL for a given AP object.
	 * The list of URLs is first filtered via findSameAuthorityUrl, then further filtered based on mediaType, and finally sorted to select the best one.
	 * @throws {IdentifiableError} if object does not have an ID
	 * @returns the best URL, or null if none were found
	 */
	@bindThis
	public findBestObjectUrl(object: IObject): string | null {
		const targetUrl = getApId(object);
		const targetAuthority = this.utilityService.punyHostPSLDomain(targetUrl);

		const rawUrls = toArray(object.url);
		const acceptableUrls = rawUrls
			.map(raw => ({
				url: getOneApHrefNullable(raw),
				type: typeof(raw) === 'object'
					? raw.mediaType?.toLowerCase()
					: undefined,
			}))
			.filter(({ url, type }) => {
				try {
					if (!url) return false;
					if (!isAcceptableUrlType(type)) return false;
					const parsed = this.utilityService.assertUrl(url);

					const urlAuthority = this.utilityService.punyHostPSLDomain(parsed);
					return urlAuthority === targetAuthority;
				} catch {
					return false;
				}
			})
			.sort((a, b) => {
				return rankUrlType(a.type) - rankUrlType(b.type);
			});

		return acceptableUrls[0]?.url ?? null;
	}

	/**
	 * Sanitizes an inline / nested Object property within an AP object.
	 *
	 * Returns true if the property contains a valid string URL, object w/ valid ID, or an array containing one of those.
	 * Returns false and erases the property if it doesn't contain a valid value.
	 *
	 * Arrays are automatically flattened.
	 * Falsy values (including null) are collapsed to undefined.
	 * @param obj Object containing the property to validate
	 * @param key Key of the property in obj
	 * @param parentUri URI of the object that contains this inline object.
	 * @param parentHost PSL host of parentUri
	 * @param keyPath If obj is *itself* a nested object, set this to the property path from root to obj (including the trailing '.'). This does not affect the logic, but improves the clarity of logs.
	 */
	@bindThis
	public sanitizeInlineObject<Key extends string>(obj: Partial<Record<Key, string | { id?: string } | (string | { id?: string })[]>>, key: Key, parentUri: string | URL, parentHost: string, keyPath = ''): obj is Partial<Record<Key, string | { id: string }>> {
		let value: unknown = obj[key];

		// Unpack arrays
		if (Array.isArray(value)) {
			value = value[0];
		}

		// Clear the value - we'll add it back once we have a confirmed ID
		obj[key] = undefined;

		// Collapse falsy values to undefined
		if (!value) {
			return false;
		}

		// Exclude nested arrays
		if (Array.isArray(value)) {
			this.logger.warn(`Excluding ${keyPath}${key} from object ${parentUri}: nested arrays are prohibited`);
			return false;
		}

		// Exclude incorrect types
		if (typeof(value) !== 'string' && typeof(value) !== 'object') {
			this.logger.warn(`Excluding ${keyPath}${key} from object ${parentUri}: incorrect type ${typeof(value)}`);
			return false;
		}

		const valueId = getNullableApId(value);
		if (!valueId) {
			// Exclude missing ID
			this.logger.warn(`Excluding ${keyPath}${key} from object ${parentUri}: missing or invalid ID`);
			return false;
		}

		try {
			const parsed = this.utilityService.assertUrl(valueId);
			const parsedHost = this.utilityService.punyHostPSLDomain(parsed);
			if (parsedHost !== parentHost) {
				// Exclude wrong host
				this.logger.warn(`Excluding ${keyPath}${key} from object ${parentUri}: wrong host in ${valueId} (got ${parsedHost}, expected ${parentHost})`);
				return false;
			}
		} catch (err) {
			// Exclude invalid URLs
			this.logger.warn(`Excluding ${keyPath}${key} from object ${parentUri}: invalid URL ${valueId}: ${renderInlineError(err)}`);
			return false;
		}

		// Success - store the sanitized value and return
		obj[key] = value as string | IObjectWithId;
		return true;
	}
}

function isAcceptableUrlType(type: string | undefined): boolean {
	if (!type) return true;
	if (type.startsWith('text/')) return true;
	if (type.startsWith('application/ld+json')) return true;
	if (type.startsWith('application/activity+json')) return true;
	return false;
}

function rankUrlType(type: string | undefined): number {
	if (!type) return 2;
	if (type === 'text/html') return 0;
	if (type.startsWith('text/')) return 1;
	if (type.startsWith('application/ld+json')) return 3;
	if (type.startsWith('application/activity+json')) return 4;
	return 5;
}
