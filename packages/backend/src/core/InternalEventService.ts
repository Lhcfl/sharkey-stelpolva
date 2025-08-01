/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { GlobalEvents, InternalEventTypes } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';

export type Listener<K extends keyof InternalEventTypes> = (value: InternalEventTypes[K], key: K, isLocal: boolean) => void | Promise<void>;

export interface ListenerProps {
	ignoreLocal?: boolean,
	ignoreRemote?: boolean,
}

@Injectable()
export class InternalEventService implements OnApplicationShutdown {
	private readonly listeners = new Map<keyof InternalEventTypes, Map<Listener<keyof InternalEventTypes>, ListenerProps>>();

	constructor(
		@Inject(DI.redisForSub)
		private readonly redisForSub: Redis.Redis,

		private readonly globalEventService: GlobalEventService,
	) {
		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	public on<K extends keyof InternalEventTypes>(type: K, listener: Listener<K>, props?: ListenerProps): void {
		let set = this.listeners.get(type);
		if (!set) {
			set = new Map();
			this.listeners.set(type, set);
		}

		// Functionally, this is just a set with metadata on the values.
		set.set(listener as Listener<keyof InternalEventTypes>, props ?? {});
	}

	@bindThis
	public off<K extends keyof InternalEventTypes>(type: K, listener: Listener<K>): void {
		this.listeners.get(type)?.delete(listener as Listener<keyof InternalEventTypes>);
	}

	@bindThis
	public async emit<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K]): Promise<void> {
		await this.emitInternal(type, value, true);
		await this.globalEventService.publishInternalEventAsync(type, { ...value, _pid: process.pid });
	}

	@bindThis
	private async emitInternal<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K], isLocal: boolean): Promise<void> {
		const listeners = this.listeners.get(type);
		if (!listeners) {
			return;
		}

		const promises: Promise<void>[] = [];
		for (const [listener, props] of listeners) {
			if ((isLocal && !props.ignoreLocal) || (!isLocal && !props.ignoreRemote)) {
				const promise = Promise.resolve(listener(value, type, isLocal));
				promises.push(promise);
			}
		}
		await Promise.all(promises);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			if (!isLocalInternalEvent(body) || body._pid !== process.pid) {
				await this.emitInternal(type, body as InternalEventTypes[keyof InternalEventTypes], false);
			}
		}
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
		this.listeners.clear();
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}

interface LocalInternalEvent {
	_pid: number;
}

function isLocalInternalEvent(body: object): body is LocalInternalEvent {
	return '_pid' in body && typeof(body._pid) === 'number';
}
