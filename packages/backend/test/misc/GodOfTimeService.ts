/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { TimeService, type Timer } from '@/global/TimeService.js';
import { addPatch, type DatePatch } from '@/misc/patch-date.js';

/**
 * Fake implementation of TimeService that allows manual control of time.
 * When this service is used, the flow of time is fully stopped.
 *
 * Test cases can manually adjust the "now" parameter to move time forwards and backwards.
 * When moving forward, timers (interval and timeout) will automatically fire as appropriate.
 */
@Injectable()
export class GodOfTimeService extends TimeService<GodsOwnTimer> {
	private _now = 0;

	constructor() {
		super();
	}

	/**
	 * Get or set the current time, in milliseconds since the unix epoch.
	 */
	public get now() {
		return this._now;
	}
	public set now(value: number) {
		// Moving backwards is allowed, for now.
		if (value > this._now) {
			// Since timers may repeat, we need to loop this.
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			while (true) {
				// Fire all expiring timers in chronological order.
				const expiringTimers = this.timers
					.values()
					.filter(t => t.expiresAt <= value)
					.toArray()
					.sort((a, b) => a.expiresAt - b.expiresAt);

				// Stop when everything is caught up
				if (expiringTimers.length === 0) {
					break;
				}

				// Since we sorted the list, this will progressively increase "now" as we handle later and later events.
				for (const timer of expiringTimers) {
					// When the timer fires, "now" should equal the time that was originally waited for.
					this._now = timer.expiresAt;
					this.runTimer(timer);
				}
			}
		}

		// Bump up to the final target value
		this._now = value;
	}

	private runTimer(timer: GodsOwnTimer): void {
		// Cleanup first in case timer throws an exception.
		if (timer.repeating) {
			timer.expiresAt = this._now + timer.delay;
		} else {
			this.timers.delete(timer.timerId);
		}

		// Fire the actual callback.
		// If it throws an error, then processing will stop halfway.
		// This is good, since it means the adjustment can be retried safely.
		timer.callback();
	}

	/**
	 * Get or set the current time, as a JavaScript Date object.
	 */
	get date(): Date {
		return super.date;
	}
	set date(value: Date) {
		this.now = value.getTime();
	}

	/**
	 * Moves time by a relative "tick" amount.
	 * Ticks can be a raw number of milliseconds, or an inline object containing time and/or date increments.
	 */
	public tick(tick: number | DatePatch) {
		if (typeof(tick) === 'number') {
			this.now += tick;
		} else {
			this.date = addPatch(this.date, tick);
		}
	}

	/**
	 * Clears all timers and resets to time=0.
	 */
	public reset() {
		this.resetTo(0);
	}
	/**
	 * Clears all timers and resets to the real-world time.
	 */
	public resetToNow() {
		this.resetTo(Date.now());
	}

	/**
	 * Clears all timers and resets to a given time.
	 */
	public resetTo(to: number) {
		this.timers.clear();
		this.now = to;
	}

	protected startNativeTimer(timerId: symbol, repeating: boolean, callback: () => void, delay: number): GodsOwnTimer {
		const expiresAt = this.now + delay;
		return { timerId, repeating, delay, expiresAt, callback };
	}

	protected stopNativeTimer(): void {
		// no-op - fake timers have no side effects to clean up
	}
}

export interface GodsOwnTimer extends Timer {
	expiresAt: number;
}
