import { FetchFailedError } from '@/misc/errors/FetchFailedError.js';
import { isRetryableSymbol } from '@/misc/is-retryable-error.js';

/**
 * Thrown when a fetch failed because no value was found for the requested key(s).
 */
export class KeyNotFoundError extends FetchFailedError {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	/**
	 * Missing keys are considered non-retryable, as they won't suddenly appear unless something external creates them.
	 */
	readonly [isRetryableSymbol] = false;

	constructor(
		cacheName: string,
		keyNames: string | readonly string[],
		message?: string,
		options?: ErrorOptions,
	) {
		const actualMessage = message
			? `Fetcher did not return a value: ${message}`
			: 'Fetcher did not return a value.';
		super(cacheName, keyNames, actualMessage, options);
	}
}
