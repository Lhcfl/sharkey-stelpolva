/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { withSignal, withCleanup } from '@/misc/promiseUtils.js';

const timerTokenSymbol = Symbol('timerToken');

/**
 * Provides abstractions to access the current time.
 * Exists for unit testing purposes, so that tests can "simulate" any given time for consistency.
 */
@Injectable()
export abstract class TimeService<TTimer extends Timer = Timer> implements OnApplicationShutdown {
	protected readonly timers = new Map<symbol, TTimer>();

	protected constructor() {}

	/**
	 * Returns the current time, in milliseconds since the Unix epoch.
	 */
	public abstract get now(): number;

	/**
	 * Returns a new Date instance representing the current time.
	 */
	public get date(): Date {
		return new Date(this.now);
	}

	public startTimer(callback: () => void, delay: number, opts?: TimerOpts): TimerHandle;
	public startTimer<T>(callback: (value: T) => void, delay: number, opts: TimerOpts | undefined, value: T): TimerHandle;
	@bindThis
	public startTimer<T = undefined>(callback: (value: T) => void, delay: number, opts?: TimerOpts, value?: T): TimerHandle {
		const timerId = Symbol();
		const repeating = opts?.repeated ?? false;

		const timer = this.startNativeTimer(timerId, repeating, () => {
			callback(value as T); // overloads ensure it can't be null
		}, delay);
		this.timers.set(timerId, timer);

		return timerId;
	}

	public startPromiseTimer(delay: number): PromiseTimerHandle;
	public startPromiseTimer<T>(delay: number, value: T, opts?: PromiseTimerOpts): PromiseTimerHandle<T>;
	@bindThis
	public startPromiseTimer<T = undefined>(delay: number, value?: T, opts?: PromiseTimerOpts): PromiseTimerHandle<T> {
		const timerId = Symbol();
		const abortController = new AbortController();
		const abortSignal = opts?.signal ? AbortSignal.any([abortController.signal, opts.signal]) : abortController.signal;

		const handlePromise =
			withCleanup(
				// Bind abort signal
				withSignal(
					() => new Promise<T>(resolve => {
						// Start the underlying timer
						this.startTimer<T>(resolve, delay, undefined, value as T); // overloads ensure it can't be null
					}),
					abortSignal,
				),

				// Register cleanup func
				() => {
					// Make sure we dispose the real handle if promise rejects!
					this.stopTimer(timerId);
				});

		// Populate and return the handle.
		return Object.assign(handlePromise, {
			[timerTokenSymbol]: timerId,

			abort: (reason: Error) => {
				abortController.abort(reason);
			},
		});
	}

	protected abstract startNativeTimer(timerId: symbol, repeating: boolean, callback: () => void, delay: number): TTimer;

	/**
	 * Clears a registered timeout or interval.
	 * Returns true if the registration exists and was still active, false otherwise.
	 * Safe to call with invalid or expired IDs.
	 */
	@bindThis
	public stopTimer(handle: TimerHandle | PromiseTimerHandle): boolean {
		const id = typeof(handle) === 'object' ? handle[timerTokenSymbol] : handle;
		const reg = this.timers.get(id);
		if (!reg) return false;

		this.stopNativeTimer(reg);
		this.timers.delete(id);
		return true;
	}

	protected abstract stopNativeTimer(reg: TTimer): void;

	/**
	 * Cleanup all handles and references.
	 * Safe to call multiple times.
	 *
	 * **Must be called before shutting down the app!**
	 */
	@bindThis
	public dispose(): void {
		for (const reg of this.timers.values()) {
			this.stopNativeTimer(reg);
		}
		this.timers.clear();
	}

	@bindThis
	onApplicationShutdown(): void {
		this.dispose();
	}
}

export interface Timer {
	timerId: symbol;
	repeating: boolean;
	delay: number;
	callback: () => void;
}

export interface TimerOpts {
	repeated?: boolean;
}

export type TimerHandle = symbol;

export interface PromiseTimerOpts {
	signal?: AbortSignal;
}

export interface PromiseTimerHandle<T = void> extends PromiseLike<T> {
	readonly [timerTokenSymbol]: symbol;
	abort(error?: Error): void;
}

/**
 * Default implementation of TimeService, uses Date.now() as time source and setTimeout/setInterval for timers.
 */
@Injectable()
export class NativeTimeService extends TimeService<NativeTimer> implements OnApplicationShutdown {
	public get now(): number {
		// This is the one place that actually *should* have it
		// eslint-disable-next-line no-restricted-properties
		return Date.now();
	}

	public constructor() {
		super();
	}

	protected startNativeTimer(timerId: symbol, repeating: boolean, callback: () => void, delay: number): NativeTimer {
		// Wrap the caller's callback to make sure we clean up the registration.
		const wrappedCallback = () => {
			this.timers.delete(timerId);
			callback();
		};

		const timeout = repeating
			? global.setInterval(wrappedCallback, delay)
			: global.setTimeout(wrappedCallback, delay);

		return { callback, timerId, repeating, delay, timeout };
	}

	protected stopNativeTimer(reg: NativeTimer): void {
		if (reg.repeating) {
			global.clearInterval(reg.timeout);
		} else {
			global.clearTimeout(reg.timeout);
		}
	}
}

export interface NativeTimer extends Timer {
	timeout: NodeJS.Timeout;
}
