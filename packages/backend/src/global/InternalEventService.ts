/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { EventUnionFromDictionary } from '@/core/GlobalEventService.js';
import type { JsonSerialized } from '@/misc/json-value.js';
import type { Config } from '@/config.js';
import type { Packed } from '@/misc/json-schema.js';
import type {
	MiAntenna,
	MiAvatarDecoration,
	MiChannel,
	MiMeta,
	MiRole,
	MiRoleAssignment,
	MiSystemWebhook,
	MiUser,
	MiUserProfile,
	MiUserList,
	MiWebhook,
} from '@/models/_.js';
import { SkEventSource, type ListenerProps, type EventListener } from '@/misc/SkEventEmitter.js';
import { IdService } from '@/core/IdService.js';
import { withCleanup } from '@/misc/promiseUtils.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { Redis } from 'ioredis';
import type * as Misskey from 'misskey-js';

interface TypeMap {
	userChangeSuspendedState: { id: MiUser['id']; isSuspended: MiUser['isSuspended']; };
	userChangeDeletedState: { id: MiUser['id']; isDeleted: MiUser['isDeleted']; token: string | null, uri: string | null, usernameLower: string, host: string | null };
	userChangeHibernatedState: { id: MiUser['id'] | MiUser['id'][]; isHibernated: MiUser['isHibernated']; };
	userMemoChanged: { userId: MiUser['id'], targetUserId: MiUser['id'], memo: string | null };
	userTokenRegenerated: { id: MiUser['id']; oldToken: string | null; newToken: string; };
	/** @deprecated Use userUpdated or usersUpdated instead */
	remoteUserUpdated: { id: MiUser['id']; };
	/** @deprecated Use userUpdated or usersUpdated instead */
	localUserUpdated: { id: MiUser['id']; };
	usersUpdated: { ids: MiUser['id'][]; };
	userUpdated: { id: MiUser['id']; };
	follow: { followerId: MiUser['id']; followeeId: MiUser['id'] | MiUser['id'][]; withReplies?: boolean, notify?: 'normal' | 'none' };
	followChanged: { followerId: MiUser['id']; followeeId: MiUser['id'] | MiUser['id'][] | null; withReplies?: boolean, notify?: 'normal' | 'none' };
	unfollow: { followerId: MiUser['id']; followeeId: MiUser['id'] | MiUser['id'][] | null; withReplies?: undefined, notify?: undefined };
	followRequested: { followerId: MiUser['id']; followeeId: MiUser['id']; }
	followRequestCancelled: { followerId: MiUser['id']; followeeId: MiUser['id']; }
	blockingCreated: { blockerId: MiUser['id']; blockeeId: MiUser['id']; };
	blockingDeleted: { blockerId: MiUser['id']; blockeeId: MiUser['id']; };
	policiesUpdated: MiRole['policies'];
	roleCreated: MiRole;
	roleDeleted: MiRole;
	roleUpdated: MiRole;
	userRoleAssigned: MiRoleAssignment;
	userRoleUnassigned: MiRoleAssignment;
	webhookCreated: { id: MiWebhook['id'] };
	webhookDeleted: { id: MiWebhook['id'] };
	webhookUpdated: { id: MiWebhook['id'] };
	systemWebhookCreated: { id: MiSystemWebhook['id'] };
	systemWebhookDeleted: { id: MiSystemWebhook['id'] };
	systemWebhookUpdated: { id: MiSystemWebhook['id'] };
	antennaCreated: MiAntenna;
	antennaDeleted: MiAntenna;
	antennaUpdated: MiAntenna;
	avatarDecorationCreated: MiAvatarDecoration;
	avatarDecorationDeleted: MiAvatarDecoration;
	avatarDecorationUpdated: MiAvatarDecoration;
	metaUpdated: { before: MiMeta; after: MiMeta; };
	followChannel: { userId: MiUser['id']; channelId: MiChannel['id']; };
	unfollowChannel: { userId: MiUser['id']; channelId: MiChannel['id']; };
	updateUserProfile: {
		/**
		 * ID of the user profile being updated.
		 * This is also the user ID.
		 */
		userId: MiUserProfile['userId'],

		/**
		 * List of keys that may have been changed.
		 * Null means that all keys are potentially changed.
		 */
		keys: (keyof MiUserProfile)[] | null,
	};
	mute: { muterId: MiUser['id']; muteeId: MiUser['id'] | MiUser['id'][]; };
	unmute: { muterId: MiUser['id']; muteeId: MiUser['id'] | MiUser['id'][]; };
	muteRenotes: { muterId: MiUser['id']; muteeId: MiUser['id'] | MiUser['id'][]; };
	unmuteRenotes: { muterId: MiUser['id']; muteeId: MiUser['id'] | MiUser['id'][]; };
	userListMemberAdded: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	userListMemberUpdated: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	userListMemberRemoved: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	userListMemberBulkAdded: { userListIds: MiUserList['id'][]; memberId: MiUser['id']; };
	userListMemberBulkUpdated: { userListIds: MiUserList['id'][]; memberId: MiUser['id']; };
	userListMemberBulkRemoved: { userListIds: MiUserList['id'][]; memberId: MiUser['id']; };
	quantumCacheUpdated: { name: string, keys: string[] };
	quantumCacheReset: { name: string };
	/**
	 * Emitted by the ServerStatsService when a new stats snapshot is available.
	 * Migrated from xev.
	 */
	pushServerStats: Misskey.entities.ServerStats;

	/**
	 * Emitted by the QueueStatsService when a new stats snapshot is available.
	 * Migrated from xev.
	 */
	pushQueueCounts: Packed<'QueueLogs'>;
}

/**
 * Internal Event types definition.
 * Key = event name (string)
 * Value = payload type (object)
 */
export type InternalEventTypes = {
	[K in keyof TypeMap]: TypeMap[K] | JsonSerialized<TypeMap[K]>;
};

/**
 * Structured message sent between processes over Redis IPC.
 */
export type InternalEventMessage = {
	node: string;
	channel: 'internal';
	message: EventUnionFromDictionary<InternalEventTypes>;
};

/**
 * Optional properties to customize event listener behavior.
 */
export interface InternalEventProps extends ListenerProps {
	ignoreLocal?: boolean;
	ignoreRemote?: boolean;
}

/**
 * Additional context passed between emit() calls; used to implement InternalEventProps filtering.
 */
export interface InternalEventContext {
	isLocal: boolean;
}

@Injectable()
export class InternalEventService extends SkEventSource<InternalEventTypes, InternalEventProps, InternalEventContext> implements OnModuleInit, OnApplicationShutdown {
	constructor(
		@Inject(DI.redisForPub)
		private readonly redisForPub: Redis,

		@Inject(DI.redisForSub)
		private readonly redisForSub: Redis,

		@Inject(DI.config)
		private readonly config: Pick<Config, 'host'>,

		@Inject(DI.nodeId)
		private readonly nodeId: string,
	) {
		super();
	}

	@bindThis
	public override async emit<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K], context?: InternalEventContext): Promise<void> {
		await withCleanup(
			// Call local listeners first
			async () => await this.emitLocally(type, value, context),

			// Sync remote processes last, even if a local listener threw an exception
			async () => await this.emitExternally(type, value),
		);
	}

	protected async emitLocally<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K], context?: InternalEventContext): Promise<void> {
		await super.emit(type, value, context);
	}

	protected async emitExternally<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K]): Promise<void> {
		const message: InternalEventMessage = {
			node: this.nodeId,
			channel: 'internal',
			message: { type: type, body: value } as EventUnionFromDictionary<InternalEventTypes>,
		};
		await this.redisForPub.publish(this.config.host, JSON.stringify(message));
	}

	protected filterListener<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K], registration: [EventListener<InternalEventTypes, K, InternalEventContext>, Partial<InternalEventProps>], context: Partial<InternalEventContext> | undefined): boolean {
		// isLocal is always populated for remote events.
		const isLocal = context?.isLocal ?? true;

		// Filter for local/remote events
		if (isLocal) {
			if (registration[1].ignoreLocal) return false;
		} else {
			if (registration[1].ignoreRemote) return false;
		}

		return true;
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (isInternalEventMessage(obj) && obj.node !== this.nodeId) {
			const { type, body } = obj.message;
			const context = { isLocal: false };
			await this.emitLocally(type, body, context);
		}
	}

	@bindThis
	public connect(): void {
		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	public disconnect(): void {
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public dispose(): void {
		this.disconnect();
		this.clearListeners();
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}

	@bindThis
	public onModuleInit(): void {
		this.connect();
	}
}

function isInternalEventMessage(obj: unknown): obj is InternalEventMessage {
	if (typeof(obj) === 'object' && obj != null) {
		if ('channel' in obj && typeof(obj.channel) === 'string') {
			return obj.channel === 'internal';
		}
	}
	return false;
}
