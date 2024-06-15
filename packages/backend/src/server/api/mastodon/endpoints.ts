/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ApiAuthMastodon } from './endpoints/auth.js';
import { ApiAccountMastodon } from './endpoints/account.js';
import { ApiSearchMastodon } from './endpoints/search.js';
import { ApiNotifyMastodon } from './endpoints/notifications.js';
import { ApiFilterMastodon } from './endpoints/filter.js';
import { ApiTimelineMastodon } from './endpoints/timeline.js';
import { ApiStatusMastodon } from './endpoints/status.js';

export {
	ApiAccountMastodon,
	ApiAuthMastodon,
	ApiSearchMastodon,
	ApiNotifyMastodon,
	ApiFilterMastodon,
	ApiTimelineMastodon,
	ApiStatusMastodon,
};
