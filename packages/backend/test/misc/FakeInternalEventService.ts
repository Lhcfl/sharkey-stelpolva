/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Listener, ListenerProps } from '@/core/InternalEventService.js';
import type Redis from 'ioredis';
import type { GlobalEventService, InternalEventTypes } from '@/core/GlobalEventService.js';
import { InternalEventService } from '@/core/InternalEventService.js';
import { bindThis } from '@/decorators.js';

type FakeCall<K extends keyof InternalEventService> = [K, Parameters<InternalEventService[K]>];
type FakeListener<K extends keyof InternalEventTypes> = [K, Listener<K>, ListenerProps];

/**
 * Minimal implementation of InternalEventService meant for use in unit tests.
 * There is no redis connection, and metadata is tracked in the public _calls and _listeners arrays.
 * The on/off/emit methods are fully functional and can be called in tests to invoke any registered listeners.
 */
export class FakeInternalEventService extends InternalEventService {
	/**
	 * List of calls to public methods, in chronological order.
	 */
	public _calls: FakeCall<keyof InternalEventService>[] = [];

	/**
	 * List of currently registered listeners.
	 */
	public _listeners: FakeListener<keyof InternalEventTypes>[] = [];

	/**
	 * Resets the mock.
	 * Clears all listeners and tracked calls.
	 */
	public _reset() {
		this._calls = [];
		this._listeners = [];
	}

	/**
	 * Simulates a remote event sent from another process in the cluster via redis.
	 */
	@bindThis
	public async _emitRedis<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K]): Promise<void> {
		await this.emit(type, value, false);
	}

	constructor() {
		super(
			{ on: () => {} } as unknown as Redis.Redis,
			{} as unknown as GlobalEventService,
		);
	}

	@bindThis
	public on<K extends keyof InternalEventTypes>(type: K, listener: Listener<K>, props?: ListenerProps): void {
		if (!this._listeners.some(l => l[0] === type && l[1] === listener)) {
			this._listeners.push([type, listener as Listener<keyof InternalEventTypes>, props ?? {}]);
		}
		this._calls.push(['on', [type, listener as Listener<keyof InternalEventTypes>, props]]);
	}

	@bindThis
	public off<K extends keyof InternalEventTypes>(type: K, listener: Listener<K>): void {
		this._listeners = this._listeners.filter(l => l[0] !== type || l[1] !== listener);
		this._calls.push(['off', [type, listener as Listener<keyof InternalEventTypes>]]);
	}

	@bindThis
	public async emit<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K], isLocal = true): Promise<void> {
		for (const listener of this._listeners) {
			if (listener[0] === type) {
				if ((isLocal && !listener[2].ignoreLocal) || (!isLocal && !listener[2].ignoreRemote)) {
					await listener[1](value, type, isLocal);
				}
			}
		}
		this._calls.push(['emit', [type, value]]);
	}

	@bindThis
	public dispose(): void {
		this._listeners = [];
		this._calls.push(['dispose', []]);
	}

	@bindThis
	public onApplicationShutdown(): void {
		this._calls.push(['onApplicationShutdown', []]);
	}
}

