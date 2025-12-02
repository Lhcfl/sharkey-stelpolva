/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiRemoteUser } from '@/models/User.js';
import type { MiInstance } from '@/models/Instance.js';
import type { Resolver } from '@/core/activitypub/ApResolverService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { bindThis } from '@/decorators.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';

export class ImmediateApPersonService extends ApPersonService {
	public resolver?: Resolver;

	@bindThis
	async updatePersonLazy(uriOrUser: string | MiRemoteUser): Promise<void> {
		const userId = typeof(uriOrUser) === 'object' ? uriOrUser.id : uriOrUser;
		await this.updatePerson(userId, this.resolver);
	}

	@bindThis
	async updateFeaturedLazy(userOrId: string | MiRemoteUser): Promise<void> {
		await this.updateFeatured(userOrId, this.resolver).catch(err => {
			if (err instanceof IdentifiableError) {
				if (err.id === errorCodes.userIsSuspended) return;
				if (err.id === errorCodes.userIsDeleted) return;
				if (err.id === errorCodes.noFeaturedCollection) return;
			}
			throw err;
		});
	}
}

export class ImmediateFetchInstanceMetadataService extends FetchInstanceMetadataService {
	@bindThis
	async fetchInstanceMetadataLazy(instance: MiInstance): Promise<void> {
		return await this.fetchInstanceMetadata(instance);
	}
}
