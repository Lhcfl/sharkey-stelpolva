/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FIXME = any;

declare const _LANGS_: string[][];
declare const _LANGS_VERSION_: string;
declare const _VERSION_: string;
declare const _ENV_: string;
declare const _DEV_: boolean;
declare const _PERF_PREFIX_: string;

// Extended to account for TS missing fields: https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/1725
interface NotificationOptions {
	/**
	 * An array of actions to display in the notification, for which the default is an empty array.
	 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification#actions
	 */
	actions?: NotificationAction[];

	/**
	 * A boolean value specifying whether the user should be notified after a new notification replaces an old one.
	 * The default is false, which means they won't be notified.
	 * If true, then tag also must be set.
	 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification#renotify
	 */
	renotify?: boolean;
}

interface NotificationAction {
	/** A string identifying a user action to be displayed on the notification. */
	action: string;

	/** A string containing action text to be shown to the user. */
	title: string;

	/** A string containing the URL of an icon to display with the action. */
	icon?: string;
}
