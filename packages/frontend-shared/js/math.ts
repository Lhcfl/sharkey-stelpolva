/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function clamp(value: number, min: number, max: number) {
	if (value > max) return max;
	if (value < min) return min;
	return value;
}
