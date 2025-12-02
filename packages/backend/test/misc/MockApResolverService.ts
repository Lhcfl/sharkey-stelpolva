/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MockResolver } from './mock-resolver.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import type {
	UsersRepository,
	NotesRepository,
	PollsRepository,
	NoteReactionsRepository,
	FollowRequestsRepository,
} from '@/models/_.js';
import { ApResolverService } from '@/core/activitypub/ApResolverService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ApLogService } from '@/core/ApLogService.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { CacheService } from '@/core/CacheService.js';
import { bindThis } from '@/decorators.js';

/**
 * Mock implementation of ApResolverService to automatically provide a MockResolver to the entire test environment.
 */
@Injectable()
export class MockApResolverService extends ApResolverService {
	/**
	 * Resolver that will be provided.
	 */
	public readonly resolver: MockResolver;

	constructor(
		@Inject(DI.config)
		config: Config,

		@Inject(DI.meta)
		meta: MiMeta,

		@Inject(DI.usersRepository)
		usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		pollsRepository: PollsRepository,

		@Inject(DI.noteReactionsRepository)
		noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.followRequestsRepository)
		followRequestsRepository: FollowRequestsRepository,

		utilityService: UtilityService,
		systemAccountService: SystemAccountService,
		apRequestService: ApRequestService,
		httpRequestService: HttpRequestService,
		apRendererService: ApRendererService,
		apDbResolverService: ApDbResolverService,
		loggerService: LoggerService,
		apLogService: ApLogService,
		apUtilityService: ApUtilityService,
		cacheService: CacheService,
	) {
		super(
			config,
			meta,
			usersRepository,
			notesRepository,
			pollsRepository,
			noteReactionsRepository,
			followRequestsRepository,
			utilityService,
			systemAccountService,
			apRequestService,
			httpRequestService,
			apRendererService,
			apDbResolverService,
			loggerService,
			apLogService,
			apUtilityService,
			cacheService,
		);

		this.resolver = new MockResolver(
			this.config,
			this.meta,
			this.usersRepository,
			this.notesRepository,
			this.pollsRepository,
			this.noteReactionsRepository,
			this.followRequestsRepository,
			this.utilityService,
			this.systemAccountService,
			this.apRequestService,
			this.httpRequestService,
			this.apRendererService,
			this.apDbResolverService,
			this.loggerService,
			this.apLogService,
			this.apUtilityService,
			this.cacheService,
		);
	}

	/**
	 * Resets the mock to initial state.
	 */
	@bindThis
	reset() {
		this.resolver.clear();
	}

	@bindThis
	createResolver(): MockResolver {
		return this.resolver;
	}
}
