/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import promiseLimit from 'promise-limit';
import type { MiUser } from '@/models/_.js';
import { toArray, unique } from '@/misc/prelude/array.js';
import { bindThis } from '@/decorators.js';
import { isMention } from '../type.js';
import { Resolver } from '../ApResolverService.js';
import { ApPersonService } from './ApPersonService.js';
import type { IObject, IApMention } from '../type.js';
import { promiseMap } from '@/misc/promise-map.js';

@Injectable()
export class ApMentionService {
	constructor(
		private apPersonService: ApPersonService,
	) {
	}

	@bindThis
	public async extractApMentions(tags: IObject | IObject[] | null | undefined, resolver: Resolver): Promise<MiUser[]> {
		const hrefs = unique(this.extractApMentionObjects(tags).map(x => x.href));

		const mentionedUsers = await promiseMap(hrefs, async x => {
			return await this.apPersonService.resolvePerson(x, resolver).catch(() => null) as MiUser | null;
		}, {
			limit: 2,
		});

		return mentionedUsers.filter(resolved => resolved != null);
	}

	@bindThis
	public extractApMentionObjects(tags: IObject | IObject[] | null | undefined): IApMention[] {
		if (tags == null) return [];
		return toArray(tags).filter(isMention);
	}
}
