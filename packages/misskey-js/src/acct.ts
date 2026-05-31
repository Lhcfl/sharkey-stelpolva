/*
 * SPDX-FileCopyrightText: Rosylight and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Important: keep this in sync with backend/src/misc/acct.ts!

export type Acct = {
	username: string;
	host: string | null;
};

export function parse(acct: string, lower = true): Acct {
	if (acct.startsWith('@')) acct = acct.substring(1);
	if (lower) {
		acct = acct.toLowerCase();
	}

	const split = acct.split('@', 2);
	return { username: split[0], host: split[1] ?? null };
}

export function toString(acct: Acct, lower = true): string {
	const username = lower
		? acct.username.toLowerCase()
		: acct.username;
	const host = lower
		? acct.host?.toLowerCase() ?? null
		: acct.host;
	return host == null ? username : `${username}@${host}`;
}
