/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In, type FindOperator } from 'typeorm';

/**
 * Custom TypeORM operator that resolves to equals (=) or includes (IN) depending on the number of values.
 * This covers a missed optimization without the need for manually checking array types.
 */
export function IsOne<T>(valueOrValues: T | FindOperator<T> | readonly T[]) {
	if (Array.isArray(valueOrValues)) {
		if (valueOrValues.length === 1) {
			return valueOrValues[0];
		} else {
			return In(valueOrValues);
		}
	} else {
		return valueOrValues;
	}
}
