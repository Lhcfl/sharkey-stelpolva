export function fromTuple<T>(value: T | [T]): T {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}
