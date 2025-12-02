/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiAccessToken } from '@/models/AccessToken.js';

const callerIdSymbol = Symbol('callerId');

/**
 * Client metadata associated with an object (typically an instance of MiUser).
 */
export interface CallerId {
	/**
	 * Client's access token, or null if no token was used.
	 */
	accessToken?: MiAccessToken | null;
}

interface ObjectWithCallerId {
	[callerIdSymbol]?: CallerId;
}

/**
 * Attaches client metadata to an object.
 * Calling this repeatedly will overwrite the previous value.
 * Pass undefined to erase the attached data.
 * @param target Object to attach to (typically an instance of MiUser).
 * @param callerId Data to attach.
 */
export function attachCallerId(target: object, callerId: CallerId | undefined): void {
	(target as ObjectWithCallerId)[callerIdSymbol] = callerId;
}

/**
 * Fetches client metadata from an object.
 * Returns undefined if no metadata is attached.
 * @param target Object to fetch from.
 */
export function getCallerId(target: object): CallerId | undefined {
	return (target as ObjectWithCallerId)[callerIdSymbol];
}
