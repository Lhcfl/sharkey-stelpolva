/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bindThis } from '@/decorators.js';
import { callAllAsync } from '@/misc/call-all.js';
import type { EmptyObject } from '@/types.js';

export interface SkEventEmitter<
	TEvents extends AnyEvents,
	TProps extends ListenerProps = ListenerProps,
	TContext extends object = EmptyObject,
> {
	/**
	 * Registers a listener callback for a given event.
	 * Duplicate calls (same event+listener values) will be ignored.
	 *
	 * @param type Event type string.
	 * @param listener Listener callback. If using a method, then make sure it has @bindThis!
	 * @param props Optional properties to configure the binding.
	 */
	on<K extends keyof TEvents>(type: K, listener: EventListener<TEvents, K, TContext>, props?: TProps): void;

	/**
	 * Deregisters (removes) a listener callback for a given event.
	 * Duplicate calls (same event+listener values, or given listener has not been registered) will be ignored.
	 *
	 * @param type Event type string.
	 * @param listener Listener callback. If using an arrow function, then make sure it points to the same exact instance as before!
	 */
	off<K extends keyof TEvents>(type: K, listener: EventListener<TEvents, K, TContext>): void;

	/**
	 * Shortcut to register a one-off listener for a given event.
	 * See the "on" method for more details.
	 *
	 * @param type Event type string.
	 * @param listener Listener callback. If using a method, then make sure it has @bindThis!
	 * @param props Optional properties to configure the binding, excluding "oneShot".
	 */
	once<K extends keyof TEvents>(type: K, listener: EventListener<TEvents, K, TContext>, props?: TProps & { oneShot: true | undefined | never }): void;
}

export class SkEventSource<
	TEvents extends AnyEvents,
	TProps extends ListenerProps = ListenerProps,
	TContext extends object = EmptyObject,
> implements SkEventEmitter<TEvents, TProps, TContext> {
	// Event -> (Listener -> Props)
	private readonly listeners = new Map<keyof TEvents, Map<AnyListener, Partial<TProps>>>();

	@bindThis
	public on<K extends keyof TEvents>(type: K, listener: EventListener<TEvents, K, TContext>, props?: TProps): void {
		let set = this.listeners.get(type);
		if (!set) {
			set = new Map();
			this.listeners.set(type, set);
		}

		// Functionally, this is just a set with metadata on the values.
		set.set(listener as AnyListener, props ?? {});
	}

	@bindThis
	public off<K extends keyof TEvents>(type: K, listener: EventListener<TEvents, K, TContext>): void {
		this.listeners.get(type)?.delete(listener as AnyListener);
	}

	@bindThis
	once<K extends keyof TEvents>(type: K, listener: EventListener<TEvents, K, TContext>, props?: TProps & { oneShot: true | undefined | never }): void {
		// Type assertion is necessary to make TS happy.
		const adaptedProps = {
			...(props ?? {}),
			oneShot: true,
		} as TProps;

		this.on(type, listener, adaptedProps);
	}

	@bindThis
	public async emit<K extends keyof TEvents>(type: K, value: TEvents[K], context?: Partial<TContext>): Promise<void> {
		const listenersForType = this.listeners.get(type);
		if (!listenersForType || listenersForType.size < 1) {
			return;
		}

		// Populate context
		context ??= {};

		// Filter listeners based on context
		const listeners = (listenersForType as Map<EventListener<TEvents, K, TContext>, Partial<TProps>>)
			.entries()
			.filter(reg => this.filterListener(type, value, reg, context))
			.toArray();

		// Remove oneShot listeners
		for (const [listener, props] of listeners) {
			if (props.oneShot) {
				listenersForType.delete(listener as AnyListener);
			}
		}

		// Execute listeners only *after* everything is up to date
		await this.emitInternal(type, value, context, listeners as [EventListener<TEvents, K, TContext>, Partial<TProps>][]);
	}

	/**
	 * Removes all listeners attached to this emitter.
	 */
	public removeAllListeners(): void;
	/**
	 * Removes all listeners of a given type.
	 * @param type Type of listener to remove.
	 */
	public removeAllListeners<K extends keyof TEvents>(type: K): void;
	@bindThis
	public removeAllListeners<K extends keyof TEvents = keyof TEvents>(type?: K) {
		if (type != null) {
			this.listeners.delete(type);
		} else {
			this.listeners.clear();
		}
	}

	/**
	 * Subclasses can override this to filter listeners for a particular event emission.
	 * Return true to execute them, or false to skip.
	 *
	 * Default implementation returns true (execute) for all listeners.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected filterListener<K extends keyof TEvents>(type: K, value: TEvents[K], registration: [EventListener<TEvents, K, TContext>, Partial<TProps>], context: Partial<TContext>): boolean {
		return true;
	}

	/**
	 * Executes all listeners in the provided set.
	 * The default behavior synchronously executes each listener, then asynchronously waits for all returned promises to resolve.
	 * In effect, synchronous code runs in strict order without concurrency, but async code is executed all at the same time.
	 *
	 * Whether the listener is sync or async, errors are captured and suppressed until after all listeners have completed.
	 * At that point, an AggregateError will be thrown containing all error(s) thrown by any listener.
	 * (no error is thrown if all listeners succeeded.)
	 *
	 * Subclasses can override this to modify the event-dispatch behavior, with consideration for a few constraints:
	 * * Callers generally expect all events to emit, even if an unrelated one throws an error.
	 *   If this behavior is changed, then it should be clearly documented.
	 * * When this method is called, one-shot listeners have *already* been removed from the listener set.
	 *   There is no need to manually remove them a second time.
	 */
	protected async emitInternal<K extends keyof TEvents>(type: K, value: TEvents[K], context: Partial<TContext>, registrations: [EventListener<TEvents, K, TContext>, Partial<TProps>][]) {
		const listeners = registrations.map(r => r[0]);
		await callAllAsync(listeners, value, type, context);
	}

	@bindThis
	protected clearListeners() {
		this.listeners.clear();
	}
}

export interface ListenerProps {
	/**
	 * If true, this listener will only fire once. After that, it will be automatically removed.
	 * If false (default), this listener will fire every time the event is emitted, until manually removed.
	 */
	oneShot?: boolean;
}

export type EventListener<
	TEvents extends AnyEvents,
	K extends keyof TEvents,
	TContext extends object,
> = (value: TEvents[K], key: K, context: Partial<TContext>) => void | Promise<void>;

// This makes TypeScript shut up about calls to Parameter<TEvents[K]>
export type AnyEvents = Readonly<Record<string, object>>;

// This makes TypeScript shut up about casting Listener<K> to Listener<keyof TEvents>
export type AnyListener = (value: unknown, key: string, context: EmptyObject) => void | Promise<void>;
