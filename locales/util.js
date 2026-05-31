import fs from 'node:fs';
import yaml from 'js-yaml';

/** @typedef {import('./index.d.ts').ILocale} ILocale */
/** @typedef {import('./index.d.ts').ParameterizedString} ParameterizedString */

/**
 * @template {ILocale} TLocale
 * @param {...TLocale} locales
 * @returns {TLocale}
 */
export function merge(...locales) {
	/** @type {ILocale} */
	const merged = {};

	for (const locale of locales) {
		for (const [key, newValue] of Object.entries(locale)) {
			const oldValue = merged[key];

			// New key? Add it directly.
			if (!oldValue) {
				merged[key] = newValue;
				continue;
			}

			// Both strings? Overwrite old with new.
			if (typeof(oldValue) === 'string' && typeof(newValue) === 'string') {
				merged[key] = newValue;
				continue;
			}

			// Both objects? Merge them.
			if (typeof(oldValue) === 'object' && typeof(newValue) === 'object') {
				merged[key] = merge(oldValue, newValue);
				continue;
			}

			// Different types? Warn and overwrite anyway.
			console.warn(`Locale error: key "${key}" has multiple incompatible types: ${JSON.stringify(oldValue)} and ${JSON.stringify(newValue)}.`);
			merged[key] = newValue;
		}
	}

	// @ts-expect-error TS doesn't let us reference generics within the method, so this can't be typed correctly.
	return merged;
}

/**
 * @template {object} T
 * @param {string} path
 * @returns {T | {}}
 */
export function loadOptionalYaml(path) {
	const text = loadOptionalFile(path);
	if (text) {
		/** @type {any} */
		const content = yaml.load(text);
		if (typeof(content) === 'object' && content != null) {
			return content;
		}
	}
	return {};
}

/**
 * @param {string} path
 * @returns {string | null}
 */
export function loadOptionalFile(path) {
	// vitestの挙動を調整するため、一度ローカル変数化する必要がある
	// https://github.com/vitest-dev/vitest/issues/3988#issuecomment-1686599577
	// https://github.com/misskey-dev/misskey/pull/14057#issuecomment-2192833785
	const metaUrl = import.meta.url;
	const resolved = new URL(path, metaUrl);

	try {
		const file = fs.readFileSync(resolved, 'utf-8');
		return clean(file);
	} catch {
		return null;
	}
}

/**
 * 何故か文字列にバックスペース文字が混入することがあり、YAMLが壊れるので取り除く
 *
 * also, we remove the backslashes in front of open braces (the
 * backslashes are only needed to tell `generateDTS.js` that the
 * braces do not represent parameters)
 * @param {string} text
 * @returns {string}
 */
function clean(text) {
	return text.replace(new RegExp(String.fromCodePoint(0x08), 'g'), '').replaceAll(new RegExp(/\\+\{/,'g'), '{');
}
