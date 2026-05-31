/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { TimerHandle, TimeService } from '@/global/TimeService.js';
import type { Connection, ConnectionEvents } from '@/server/api/stream/Connection.js';
import type { UtilityService } from '@/core/UtilityService.js';
import type { InternalEventService, InternalEventTypes } from '@/global/InternalEventService.js';
import type { CacheService } from '@/core/CacheService.js';
import type { NotesRepository, NoteFavoritesRepository, NoteReactionsRepository } from '@/models/_.js';
import type { QueryService } from '@/core/QueryService.js';
import type { QuantumKVCacheEvents } from '@/misc/QuantumKVCache.js';
import type { UnionToInterface } from '@/types.js';
import { bindThis } from '@/decorators.js';

/**
 * Lifetime for per-connection cache data.
 */
export const UserCacheLifetime = 10 * 1000; // 10 seconds

/**
 * A connected WebSocket user.
 * The StreamingApiServerService is expected to track these and produce only one for each unique client user.
 * When a Connection is created for this user, it should call "attach" to activate tracking and refresh.
 * The WebSocketUser will automatically dispose all resources once the last connection is closed.
 */
export class WebSocketUser {
	public readonly userId: string;

	public get user(): MiUser {
		return this._user;
	}
	private _user: MiUser;

	public get userProfile(): MiUserProfile {
		return this._userProfile;
	}
	private _userProfile: MiUserProfile;

	public get followingChannels(): ReadonlySet<string> {
		return this._followingChannels;
	}
	private _followingChannels = new Set<string>();

	public get mutedInstances(): ReadonlySet<string> {
		return this._mutedInstances;
	}
	private _mutedInstances = new Set<string>();

	public get mutedThreads(): ReadonlySet<string> {
		return this._mutedThreads;
	}
	private _mutedThreads = new Set<string>();

	public get mutedNotes(): ReadonlySet<string> {
		return this._mutedNotes;
	}
	private _mutedNotes = new Set<string>();

	public get recentReactions(): ReadonlyMap<string, string> {
		return this._recentReactions;
	}
	private _recentReactions = new Map<string, string>();

	public get recentRenotes(): ReadonlySet<string> {
		return this._recentRenotes;
	}
	private _recentRenotes = new Set<string>();

	public get recentFavorites(): ReadonlySet<string> {
		return this._recentFavorites;
	}
	private _recentFavorites = new Set<string>();

	private readonly attachedConnections = new Set<Connection>();
	private refreshTimer: TimerHandle | null = null;
	private lastFetchTime = 0; // TODO use this
	private isActive = false;

	public constructor(
		private readonly notesRepository: NotesRepository,
		private readonly noteReactionsRepository: NoteReactionsRepository,
		private readonly noteFavoritesRepository: NoteFavoritesRepository,
		private readonly queryService: QueryService,
		private readonly cacheService: CacheService,
		private readonly timeService: TimeService,
		private readonly utilityService: UtilityService,
		private readonly internalEventService: InternalEventService,

		initialUser: MiUser,
	) {
		this.utilityService.assertActiveUser(initialUser);
		this.userId = initialUser.id;
		this._user = initialUser;
	}

	/**
	 * Bulk-disconnects all sockets for this user.
	 */
	@bindThis
	public async closeAll(code: number, message?: string | Buffer): Promise<void> {
		const connections = this.attachedConnections.values().toArray();
		this.attachedConnections.clear();

		// Close all connections.
		// Ignore errors because we're closing anyway.
		await Promise.allSettled(connections.map(async connection => {
			connection.off('open', this.onConnectionOpen);
			connection.off('close', this.onConnectionClose);
			await connection.close(code, message);
		}));

		// Cleanup.
		this.checkDeactivate();
	}

	/**
	 * Tracks a new connection for this user.
	 * Duplicate calls are safely ignored.
	 */
	@bindThis
	public async attach(connection: Connection): Promise<void> {
		if (this.attachedConnections.has(connection)) return;

		// If connection is already closed / closing, then save some time and just skip it
		if (connection.state === 'closed' || connection.state === 'closing') {
			return;
		}

		// Attach connection
		this.attachedConnections.add(connection);
		connection.on('close', this.onConnectionClose);

		// Activate or wait for open
		if (connection.state === 'opened') {
			await this.onConnectionOpen();
		} else {
			connection.on('open', this.onConnectionOpen);
		}
	}

	@bindThis
	public detach(connection: Connection): void {
		this.attachedConnections.delete(connection);
		connection.off('open', this.onConnectionOpen);
		connection.off('close', this.onConnectionClose);
		this.checkDeactivate();
	}

	@bindThis
	private async onConnectionOpen() {
		await this.ensureActive();
	}

	@bindThis
	private onConnectionClose(args: ConnectionEvents['close']) {
		this.detach(args.connection);
	}

	// TODO track and reuse promise
	@bindThis
	private async ensureActive(): Promise<void> {
		if (this.isActive) return;

		// Mark active before async call
		this.isActive = true;
		try {
			// Load initial data
			await this.fetch();
		} catch (err) {
			// Rollback on error
			this.isActive = false;
			throw err;
		}

		// Bind events to automatically sync
		this.internalEventService.on('userChangeSuspendedState', this.onUserChangeSuspendedState);
		this.internalEventService.on('userChangeDeletedState', this.onUserChangeDeletedState);
		this.cacheService.userByIdCache.on('changed', this.onUserByIdCacheChanged);
		this.cacheService.userByIdCache.on('reset', this.onUserByIdCacheChanged);
		this.cacheService.userProfileCache.on('changed', this.onUserProfileCacheChanged);
		this.cacheService.userProfileCache.on('reset', this.onUserProfileCacheChanged);
		this.cacheService.userFollowingChannelsCache.on('changed', this.onUserFollowingChannelsCacheChanged);
		this.cacheService.userFollowingChannelsCache.on('reset', this.onUserFollowingChannelsCacheChanged);
		this.cacheService.threadMutingsCache.on('changed', this.onThreadMutingsCacheChanged);
		this.cacheService.threadMutingsCache.on('reset', this.onThreadMutingsCacheChanged);
		this.cacheService.noteMutingsCache.on('changed', this.onNoteMutingsCacheChanged);
		this.cacheService.noteMutingsCache.on('reset', this.onNoteMutingsCacheChanged);

		// Start timer to keep updated
		this.refreshTimer = this.timeService.startTimer(this.refresh, UserCacheLifetime, { repeated: true });
	}

	@bindThis
	private async fetch(): Promise<void> {
		// Skip if already up-to-date.
		// This can happen if a client disconnects, then reconnects before we garbage-collect the cache.
		if (this.timeService.now - this.lastFetchTime <= UserCacheLifetime) {
			return;
		}

		await Promise.all([
			// This is normally called by timer, so call it directly to refresh the same way.
			this.refresh(),

			// These are normally called by internal event, so call them directly to refresh the same way.
			this.onUserByIdCacheChanged(),
			this.onUserProfileCacheChanged(),
			this.onUserFollowingChannelsCacheChanged(),
			this.onThreadMutingsCacheChanged(),
			this.onNoteMutingsCacheChanged(),
		]);
	}

	@bindThis
	private async refresh(): Promise<void> {
		// Sanity check
		if (!this.isActive) return;

		// TODO time-gate these queries in case the user doesn't post much.
		//   There's no reason to return 100 "recent" renotes if the user hasn't boosted anything in years...
		const [myRecentReactions, myRecentFavorites, myRecentRenotes] = await Promise.all([
			this.noteReactionsRepository.find({
				where: { userId: this.userId },
				select: { noteId: true, reaction: true },
				order: { id: 'desc' },
				take: 100,
			}),
			this.noteFavoritesRepository.find({
				where: { userId: this.userId },
				select: { noteId: true },
				order: { id: 'desc' },
				take: 100,
			}),
			this.queryService
				.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
				.andWhere({ userId: this.userId })
				.orderBy({ id: 'DESC' })
				.limit(100)
				.select('note.renoteId', 'renoteId')
				.getRawMany<{ renoteId: string }>(),
		]);

		// Replace all connections with latest snapshot
		this._recentReactions = new Map(myRecentReactions.map(r => [r.noteId, r.reaction]));
		this._recentFavorites = new Set(myRecentFavorites.map(f => f.noteId ));
		this._recentRenotes = new Set(myRecentRenotes.map(r => r.renoteId ));

		// Mark updated
		this.lastFetchTime = this.timeService.now;
	}

	@bindThis
	private checkDeactivate() {
		// Check if we need to deactivate
		if (!this.isActive) return;
		if (this.attachedConnections.keys().some(c => c.isActive)) return;

		// Disconnect data cache
		this.internalEventService.off('userChangeSuspendedState', this.onUserChangeSuspendedState);
		this.internalEventService.off('userChangeDeletedState', this.onUserChangeDeletedState);
		this.cacheService.userByIdCache.off('changed', this.onUserByIdCacheChanged);
		this.cacheService.userByIdCache.off('reset', this.onUserByIdCacheChanged);
		this.cacheService.userProfileCache.off('changed', this.onUserProfileCacheChanged);
		this.cacheService.userProfileCache.off('reset', this.onUserProfileCacheChanged);
		this.cacheService.userFollowingChannelsCache.off('changed', this.onUserFollowingChannelsCacheChanged);
		this.cacheService.userFollowingChannelsCache.off('reset', this.onUserFollowingChannelsCacheChanged);
		this.cacheService.threadMutingsCache.off('changed', this.onThreadMutingsCacheChanged);
		this.cacheService.threadMutingsCache.off('reset', this.onThreadMutingsCacheChanged);
		this.cacheService.noteMutingsCache.off('changed', this.onNoteMutingsCacheChanged);
		this.cacheService.noteMutingsCache.off('reset', this.onNoteMutingsCacheChanged);

		// Clear maps to avoid leaks
		this.attachedConnections.clear();

		// Stop timer
		this.timeService.stopTimer(this.refreshTimer);
		this.refreshTimer = null;

		// Mark inactive
		this.isActive = false;
	}

	@bindThis
	private async onUserChangeSuspendedState(body: InternalEventTypes['userChangeSuspendedState']): Promise<void> {
		// Sanity check
		if (!this.isActive) return;
		if (body.id !== this.userId) return;

		// If user is suspended, then close the connection immediately.
		if (body.isSuspended) {
			await this.closeAll(4001, 'User suspended');
		}
	}

	@bindThis
	private async onUserChangeDeletedState(body: InternalEventTypes['userChangeDeletedState']): Promise<void> {
		// Sanity check
		if (!this.isActive) return;
		if (body.id !== this.userId) return;

		// If user is deleted, then close the connection immediately.
		if (body.isDeleted) {
			await this.closeAll(4001, 'User suspended');
		}
	}

	@bindThis
	private async onUserByIdCacheChanged(body?: QuantumCallbackArg): Promise<void> {
		// Sanity check
		if (!this.isActive) return;
		if (body?.keys && !body.keys.includes(this.userId)) return;

		// Will be undefined if user has been deleted
		const user = await this.cacheService.userByIdCache.fetchMaybe(this.userId);

		// If user is deleted or disabled, then close all connections immediately.
		if (user == null || !this.utilityService.isActiveUser(user)) {
			await this.closeAll(4001, 'User suspended');
		} else {
			this._user = user;
		}
	}

	@bindThis
	private async onUserProfileCacheChanged(body?: QuantumCallbackArg): Promise<void> {
		// Sanity check
		if (!this.isActive) return;
		if (body?.keys && !body.keys.includes(this.userId)) return;

		// Will be undefined if user has been deleted
		const userProfile = await this.cacheService.userProfileCache.fetchMaybe(this.userId);

		// If user is deleted, then close all connections immediately.
		if (userProfile == null) {
			await this.closeAll(4001, 'User suspended');
		} else {
			this._userProfile = userProfile;
			this._mutedInstances = new Set(userProfile.mutedInstances);
		}
	}

	@bindThis
	private async onUserFollowingChannelsCacheChanged(body?: QuantumCallbackArg): Promise<void> {
		// Sanity check
		if (!this.isActive) return;
		if (body?.keys && !body.keys.includes(this.userId)) return;

		this._followingChannels = await this.cacheService.userFollowingChannelsCache.fetch(this.userId);
	}

	@bindThis
	private async onThreadMutingsCacheChanged(body?: QuantumCallbackArg): Promise<void> {
		// Sanity check
		if (!this.isActive) return;
		if (body?.keys && !body.keys.includes(this.userId)) return;

		this._mutedThreads = await this.cacheService.threadMutingsCache.fetch(this.userId);
	}

	@bindThis
	private async onNoteMutingsCacheChanged(body?: QuantumCallbackArg): Promise<void> {
		// Sanity check
		if (!this.isActive) return;
		if (body?.keys && !body.keys.includes(this.userId)) return;

		this._mutedNotes = await this.cacheService.noteMutingsCache.fetch(this.userId);
	}
}

// Trick to allow a single callback method for all quantum events, in a type-safe way.
type QuantumCallbackArg = Partial<UnionToInterface<QuantumKVCacheEvents<unknown>[keyof QuantumKVCacheEvents<unknown>]>>;
