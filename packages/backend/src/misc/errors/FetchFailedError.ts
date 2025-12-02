import { QuantumCacheError } from '@/misc/errors/QuantumCacheError.js';

/**
 * Thrown when a fetch failed for any reason.
 */
export class FetchFailedError extends QuantumCacheError {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	/**
	 * Name of the key(s) that could not be fetched.
	 * Will be an array if bulkFetcher() failed, and a string if regular fetch() failed.
	 */
	public readonly keyNames: string | readonly string[];

	constructor(
		cacheName: string,
		keyNames: string | readonly string[],
		message?: string,
		options?: ErrorOptions,
	) {
		const actualMessage = typeof (keyNames) === 'string'
			? message
				? `Fetch failed for key "${keyNames}": ${message}`
				: `Fetch failed for key "${keyNames}".`
			: message
				? `Fetch failed for ${keyNames.length} keys: ${message}`
				: `Fetch failed for ${keyNames.length} keys.`;
		super(cacheName, actualMessage, options);

		this.keyNames = keyNames;
	}
}
