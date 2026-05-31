/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type JsonValue = JsonArray | JsonObject | string | number | boolean | null;
export type JsonObject = { [K in string]?: JsonValue };
export type JsonArray = JsonValue[];

export type JsonSerialized<T> =
	// Any / Unknown
	// TODO this can map to JsonValue once we no longer pass "any" into this
	unknown extends T ? T :
	// Primitives
	T extends number | boolean | string | null ? T :
	// Arrays
	T extends Array<infer TItem> ? JsonSerializedArray<TItem> :
	// Dates
	T extends Date ? string :
	// Objects
	T extends object ? JsonSerializedObject<T> :
	// Anything else gets stripped by the serializer
	never;
type JsonSerializedArray<T> = JsonSerialized<T>[];
type JsonSerializedObject<T> = {
	[K in RequiredStringProperties<T>]: JsonSerialized<T[K]>;
} & {
	[K in OptionalStringProperties<T>]?: JsonSerialized<T[K]>;
};

type RequiredStringProperties<T> = {
	[K in keyof T]: IfJsonOptional<T, K, never, K>;
}[Extract<keyof T, string>];

type OptionalStringProperties<T> = {
	[K in keyof T]: IfJsonOptional<T, K, K, never>;
}[Extract<keyof T, string>];

type IfJsonOptional<T, K extends keyof T, TTrue, TFalse> =
	// Marked as optional (question mark syntax)
	{ [_K in K]?: T[_K] } extends Pick<T, K> ? TTrue :
	// Includes unknown or any (impossible to tell without the question mark)
	unknown extends T[K] ? TFalse :
	// Includes undefined (will be stripped by JSON serializer)
	undefined extends T[K] ? TTrue : TFalse;
type IsJsonOptional<T, K extends keyof T> = IfJsonOptional<T, K, true, false>;

// This works because an object with optional keys cannot extend an object with the same required keys, even if everything else matches
type IfOptional<T, K extends keyof T, TTrue, TFalse> = { [_K in K]?: T[_K] } extends Pick<T, K> ? TTrue : TFalse;
type IsOptional<T, K extends keyof T> = IfOptional<T, K, true, false>;

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
