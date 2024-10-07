/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Checks if the given user represents a system account, such as instance.actor.
 */
export function isSystemAccount(user: { readonly username: string }): boolean {
	return user.username.includes('.');
}
