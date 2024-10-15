import { fromTuple } from '@/misc/from-tuple.js';

describe(fromTuple, () => {
	it('should return value when value is not an array', () => {
		const value = fromTuple('abc');
		expect(value).toBe('abc');
	});

	it('should return first element when value is an array', () => {
		const value = fromTuple(['abc']);
		expect(value).toBe('abc');
	});
});
