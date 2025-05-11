/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference path="account.ts" />

namespace MastodonEntity {
	export type Reaction = {
		name: string
		count: number
		me?: boolean
		url?: string
		static_url?: string
	}
}
