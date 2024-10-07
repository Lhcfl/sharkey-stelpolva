/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

interface UserLike {
	readonly username: string;
	readonly host: string | null;
}

/**
 * Checks if the given user represents a system account, such as instance.actor.
 */
export function isSystemAccount(user: UserLike): boolean {
	return user.host == null && user.username.includes('.');
}
