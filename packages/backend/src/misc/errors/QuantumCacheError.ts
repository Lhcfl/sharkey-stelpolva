/**
 * Base class for all Quantum Cache errors.
 */
export class QuantumCacheError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	/**
	 * Name of the cache that produced this error.
	 */
	public readonly cacheName: string;

	constructor(
		cacheName: string,
		message?: string,
		options?: ErrorOptions,
	) {
		const actualMessage = message
			? `Error in cache ${cacheName}: ${message}`
			: `Error in cache ${cacheName}.`;
		super(actualMessage, options);

		this.cacheName = cacheName;
	}
}
