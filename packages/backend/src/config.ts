/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { globSync } from 'glob';
import ipaddr from 'ipaddr.js';
import Logger from './logger.js';
import type * as Sentry from '@sentry/node';
import type * as SentryVue from '@sentry/vue';
import type { RedisOptions } from 'ioredis';
import type { IPv4, IPv6 } from 'ipaddr.js';
import type { LoggerService } from '@/core/LoggerService.js';

type RedisOptionsSource = Partial<RedisOptions> & {
	host?: string;
	port?: number;
	family?: number;
	path?: string,
	pass: string;
	db?: number;
	prefix?: string;
};

/**
 * 設定ファイルの型
 */
type Source = {
	url?: string;
	port?: number;
	address?: string;
	socket?: string;
	chmodSocket?: string;
	disableHsts?: boolean;
	db: {
		host: string;
		port: number;
		db?: string;
		user?: string;
		pass?: string;
		slowQueryThreshold?: number;
		disableCache?: boolean;
		extra?: { [x: string]: string };
	};
	dbReplications?: boolean;
	dbSlaves?: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
	}[];
	redis: RedisOptionsSource;
	redisForPubsub?: RedisOptionsSource;
	redisForJobQueue?: RedisOptionsSource;
	redisForTimelines?: RedisOptionsSource;
	redisForReactions?: RedisOptionsSource;
	redisForRateLimit?: RedisOptionsSource;
	fulltextSearch?: {
		provider?: FulltextSearchProvider;
	};
	meilisearch?: {
		host: string;
		port: string;
		apiKey: string;
		ssl?: boolean;
		index: string;
		scope?: 'local' | 'global' | string[];
	};
	sentryForBackend?: { options: Partial<Sentry.NodeOptions>; enableNodeProfiling: boolean; };
	sentryForFrontend?: {
		options: Partial<SentryVue.BrowserOptions> & { dsn: string };
		vueIntegration?: SentryVue.VueIntegrationOptions | null;
		browserTracingIntegration?: Parameters<typeof SentryVue.browserTracingIntegration>[0] | null;
		replayIntegration?: Parameters<typeof SentryVue.replayIntegration>[0] | null;
	};

	publishTarballInsteadOfProvideRepositoryUrl?: boolean;

	setupPassword?: string;

	proxy?: string;
	proxySmtp?: string;
	proxyBypassHosts?: string[];

	allowedPrivateNetworks?: PrivateNetworkSource[];
	disallowExternalApRedirect?: boolean;

	maxFileSize?: number;
	maxNoteLength?: number;
	maxCwLength?: number;
	maxRemoteCwLength?: number;
	maxRemoteNoteLength?: number;
	maxAltTextLength?: number;
	maxRemoteAltTextLength?: number;
	maxBioLength?: number;
	maxRemoteBioLength?: number;
	maxDialogAnnouncements?: number;

	clusterLimit?: number;

	id: string;

	outgoingAddress?: string;
	outgoingAddressFamily?: 'ipv4' | 'ipv6' | 'dual';

	deliverJobConcurrency?: number;
	inboxJobConcurrency?: number;
	relationshipJobConcurrency?: number;
	backgroundJobConcurrency?: number;
	deliverJobPerSec?: number;
	inboxJobPerSec?: number;
	relationshipJobPerSec?: number;
	backgroundJobPerSec?: number;
	deliverJobMaxAttempts?: number;
	inboxJobMaxAttempts?: number;
	backgroundJobMaxAttempts?: number;

	mediaDirectory?: string;
	mediaProxy?: string;
	proxyRemoteFiles?: boolean;
	videoThumbnailGenerator?: string;

	customMOTD?: string[];

	signToActivityPubGet?: boolean;
	attachLdSignatureForRelays?: boolean;
	checkActivityPubGetSignature?: boolean;

	perChannelMaxNoteCacheCount?: number;
	perUserNotificationsMaxCount?: number;
	deactivateAntennaThreshold?: number;

	import?: {
		downloadTimeout: number;
		maxFileSize: number;
	};

	pidFile: string;

	avatarDecorationAllowedHosts: string[] | undefined;
	stpvAprilFoolsEnabled?: boolean,
	filePermissionBits?: string;

	logging?: {
		sql?: {
			disableQueryTruncation?: boolean,
			enableQueryParamLogging?: boolean,
		};
	}

	activityLogging?: {
		enabled?: boolean;
		preSave?: boolean;
		maxAge?: number;
	};

	websocketCompression?: boolean;

	customHtml?: {
		head?: string;
	}
};

export type PrivateNetworkSource = string | { network?: string, ports?: number[] };

export type PrivateNetwork = {
	/**
	 * CIDR IP/netmask definition of the IP range to match.
	 */
	cidr: CIDR;

	/**
	 * List of ports to match.
	 * If undefined, then all ports match.
	 * If empty, then NO ports match.
	 */
	ports?: number[];
};

export type CIDR = [ip: IPv4 | IPv6, prefixLength: number];

export function parsePrivateNetworks(patterns: PrivateNetworkSource[], configLogger: Logger): PrivateNetwork[];
export function parsePrivateNetworks(patterns: undefined, configLogger: Logger): undefined;
export function parsePrivateNetworks(patterns: PrivateNetworkSource[] | undefined, configLogger: Logger): PrivateNetwork[] | undefined;
export function parsePrivateNetworks(patterns: PrivateNetworkSource[] | undefined, configLogger: Logger): PrivateNetwork[] | undefined {
	if (!patterns) return undefined;
	return patterns
		.map(e => {
			if (typeof(e) === 'string') {
				const cidr = parseIpOrMask(e);
				if (cidr) {
					return { cidr } satisfies PrivateNetwork;
				}
			} else if (e.network) {
				const cidr = parseIpOrMask(e.network);
				if (cidr) {
					return { cidr, ports: e.ports } satisfies PrivateNetwork;
				}
			}

			configLogger.warn('Skipping invalid entry in allowedPrivateNetworks: ', e);
			return null;
		})
		.filter(p => p != null);
}

function parseIpOrMask(ipOrMask: string): CIDR | null {
	if (ipaddr.isValidCIDR(ipOrMask)) {
		return ipaddr.parseCIDR(ipOrMask);
	}
	if (ipaddr.isValid(ipOrMask)) {
		const ip = ipaddr.parse(ipOrMask);
		return [ip, 32];
	}
	return null;
}

export type Config = {
	url: string;
	port: number;
	address: string;
	socket: string | undefined;
	chmodSocket: string | undefined;
	disableHsts: boolean | undefined;
	db: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
		slowQueryThreshold?: number;
		disableCache?: boolean;
		extra?: { [x: string]: string };
	};
	dbReplications: boolean | undefined;
	dbSlaves: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
	}[] | undefined;
	fulltextSearch?: {
		provider?: FulltextSearchProvider;
	};
	meilisearch: {
		host: string;
		port: string;
		apiKey: string;
		ssl?: boolean;
		index: string;
		scope?: 'local' | 'global' | string[];
	} | undefined;
	proxy: string | undefined;
	proxySmtp: string | undefined;
	proxyBypassHosts: string[] | undefined;
	allowedPrivateNetworks: PrivateNetwork[] | undefined;
	disallowExternalApRedirect: boolean;
	maxFileSize: number;
	maxNoteLength: number;
	maxRemoteNoteLength: number;
	maxCwLength: number;
	maxRemoteCwLength: number;
	maxAltTextLength: number;
	maxRemoteAltTextLength: number;
	maxBioLength: number;
	maxRemoteBioLength: number;
	maxDialogAnnouncements: number;
	clusterLimit: number | undefined;
	id: string;
	outgoingAddress: string | undefined;
	outgoingAddressFamily: 'ipv4' | 'ipv6' | 'dual' | undefined;
	deliverJobConcurrency: number | undefined;
	inboxJobConcurrency: number | undefined;
	relationshipJobConcurrency: number | undefined;
	backgroundJobConcurrency: number | undefined;
	deliverJobPerSec: number | undefined;
	inboxJobPerSec: number | undefined;
	relationshipJobPerSec: number | undefined;
	backgroundJobPerSec: number | undefined;
	deliverJobMaxAttempts: number | undefined;
	inboxJobMaxAttempts: number | undefined;
	backgroundJobMaxAttempts: number | undefined;
	proxyRemoteFiles: boolean | undefined;
	customMOTD: string[] | undefined;
	signToActivityPubGet: boolean;
	attachLdSignatureForRelays: boolean;
	/** @deprecated Use MiMeta.allowUnsignedFetch instead */
	checkActivityPubGetSignature: boolean | undefined;
	logging?: {
		sql?: {
			disableQueryTruncation?: boolean,
			enableQueryParamLogging?: boolean,
		};
	}

	version: string;
	publishTarballInsteadOfProvideRepositoryUrl: boolean;
	setupPassword: string | undefined;
	host: string;
	hostname: string;
	scheme: string;
	wsScheme: string;
	apiUrl: string;
	wsUrl: string;
	authUrl: string;
	driveUrl: string;
	userAgent: string;
	frontendEntry: string;
	frontendManifestExists: boolean;
	frontendEmbedEntry: string;
	frontendEmbedManifestExists: boolean;
	mediaDirectory: string;
	mediaProxy: string;
	externalMediaProxyEnabled: boolean;
	videoThumbnailGenerator: string | null;
	redis: RedisOptions & RedisOptionsSource;
	redisForPubsub: RedisOptions & RedisOptionsSource;
	redisForJobQueue: RedisOptions & RedisOptionsSource;
	redisForTimelines: RedisOptions & RedisOptionsSource;
	redisForReactions: RedisOptions & RedisOptionsSource;
	redisForRateLimit: RedisOptions & RedisOptionsSource;
	sentryForBackend: { options: Partial<Sentry.NodeOptions>; enableNodeProfiling: boolean; } | undefined;
	sentryForFrontend: {
		options: Partial<SentryVue.BrowserOptions> & { dsn: string };
		vueIntegration?: SentryVue.VueIntegrationOptions | null;
		browserTracingIntegration?: Parameters<typeof SentryVue.browserTracingIntegration>[0] | null;
		replayIntegration?: Parameters<typeof SentryVue.replayIntegration>[0] | null;
	} | undefined;
	perChannelMaxNoteCacheCount: number;
	perUserNotificationsMaxCount: number;
	deactivateAntennaThreshold: number;
	stpvAprilFoolsEnabled?: boolean;

	import: {
		downloadTimeout: number;
		maxFileSize: number;
	} | undefined;

	pidFile: string;
	avatarDecorationAllowedHosts: string[] | undefined;
	filePermissionBits?: string;

	activityLogging: {
		enabled: boolean;
		preSave: boolean;
		maxAge: number;
	};

	websocketCompression?: boolean;

	customHtml: {
		head: string;
	}
};

export type FulltextSearchProvider = 'sqlLike' | 'sqlPgroonga' | 'meilisearch' | 'sqlTsvector';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

/**
 * Path of configuration directory
 */
const dir = process.env.MISSKEY_CONFIG_DIR ?? `${_dirname}/../../../.config`;

/**
 * Path of configuration file
 */
const path = process.env.MISSKEY_CONFIG_YML
	? resolve(dir, process.env.MISSKEY_CONFIG_YML)
	: process.env.NODE_ENV === 'test'
		? resolve(dir, 'test.yml')
		: resolve(dir, 'default.yml');

export function loadConfig(loggerService: LoggerService): Config {
	const configLogger = loggerService.getLogger('config');

	const meta = JSON.parse(fs.readFileSync(`${_dirname}/../../../built/meta.json`, 'utf-8'));

	const frontendManifestExists = fs.existsSync(_dirname + '/../../../built/_frontend_vite_/manifest.json');
	const frontendEmbedManifestExists = fs.existsSync(_dirname + '/../../../built/_frontend_embed_vite_/manifest.json');
	const frontendManifest = frontendManifestExists ?
		JSON.parse(fs.readFileSync(`${_dirname}/../../../built/_frontend_vite_/manifest.json`, 'utf-8'))
		: { 'src/_boot_.ts': { file: 'src/_boot_.ts' } };
	const frontendEmbedManifest = frontendEmbedManifestExists ?
		JSON.parse(fs.readFileSync(`${_dirname}/../../../built/_frontend_embed_vite_/manifest.json`, 'utf-8'))
		: { 'src/boot.ts': { file: 'src/boot.ts' } };

	const configFiles = globSync(path).sort();

	if (configFiles.length === 0
			&& !process.env['MK_WARNED_ABOUT_CONFIG']) {
		configLogger.warn('No config files loaded, check if this is intentional');
		process.env['MK_WARNED_ABOUT_CONFIG'] = '1';
	}

	const config = configFiles.map(path => {
		configLogger.info(`Reading configuration from ${path}`);
		return fs.readFileSync(path, 'utf-8');
	})
		.map(contents => yaml.load(contents) as Source)
		.reduce(
			(acc: Source, cur: Source) => Object.assign(acc, cur),
			{} as Source,
		) as Source;

	applyEnvOverrides(config);

	const url = tryCreateUrl(config.url ?? process.env.MISSKEY_URL ?? '');
	const version = meta.gitVersion ?? meta.version;
	const host = url.host;
	const hostname = url.hostname;
	const scheme = url.protocol.replace(/:$/, '');
	const wsScheme = scheme.replace('http', 'ws');

	const dbDb = config.db.db ?? process.env.DATABASE_DB ?? '';
	const dbUser = config.db.user ?? process.env.DATABASE_USER ?? '';
	const dbPass = config.db.pass ?? process.env.DATABASE_PASSWORD ?? '';

	const externalMediaProxy = config.mediaProxy ?
		config.mediaProxy.endsWith('/') ? config.mediaProxy.substring(0, config.mediaProxy.length - 1) : config.mediaProxy
		: null;
	const internalMediaProxy = `${scheme}://${host}/proxy`;
	const redis = convertRedisOptions(config.redis, host);

	// nullish => 300 (default)
	// 0 => undefined (disabled)
	const slowQueryThreshold = (config.db.slowQueryThreshold ?? 300) || undefined;

	return {
		version,
		publishTarballInsteadOfProvideRepositoryUrl: !!config.publishTarballInsteadOfProvideRepositoryUrl,
		setupPassword: config.setupPassword,
		url: url.origin,
		port: config.port ?? parseInt(process.env.PORT ?? '3000', 10),
		address: config.address ?? '0.0.0.0',
		socket: config.socket,
		chmodSocket: config.chmodSocket,
		disableHsts: config.disableHsts,
		host,
		hostname,
		scheme,
		wsScheme,
		wsUrl: `${wsScheme}://${host}`,
		apiUrl: `${scheme}://${host}/api`,
		authUrl: `${scheme}://${host}/auth`,
		driveUrl: `${scheme}://${host}/files`,
		db: { ...config.db, db: dbDb, user: dbUser, pass: dbPass, slowQueryThreshold },
		dbReplications: config.dbReplications,
		dbSlaves: config.dbSlaves,
		fulltextSearch: config.fulltextSearch,
		meilisearch: config.meilisearch,
		redis,
		redisForPubsub: config.redisForPubsub ? convertRedisOptions(config.redisForPubsub, host) : redis,
		redisForJobQueue: config.redisForJobQueue ? convertRedisOptions(config.redisForJobQueue, host) : redis,
		redisForTimelines: config.redisForTimelines ? convertRedisOptions(config.redisForTimelines, host) : redis,
		redisForReactions: config.redisForReactions ? convertRedisOptions(config.redisForReactions, host) : redis,
		redisForRateLimit: config.redisForRateLimit ? convertRedisOptions(config.redisForRateLimit, host) : redis,
		sentryForBackend: config.sentryForBackend,
		sentryForFrontend: config.sentryForFrontend,
		id: config.id,
		proxy: config.proxy,
		proxySmtp: config.proxySmtp,
		proxyBypassHosts: config.proxyBypassHosts,
		allowedPrivateNetworks: parsePrivateNetworks(config.allowedPrivateNetworks, configLogger),
		disallowExternalApRedirect: config.disallowExternalApRedirect ?? false,
		maxFileSize: config.maxFileSize ?? 262144000,
		maxNoteLength: config.maxNoteLength ?? 3000,
		maxRemoteNoteLength: config.maxRemoteNoteLength ?? 100000,
		maxCwLength: config.maxCwLength ?? 500,
		maxRemoteCwLength: config.maxRemoteCwLength ?? 5000,
		maxAltTextLength: config.maxAltTextLength ?? 20000,
		maxRemoteAltTextLength: config.maxRemoteAltTextLength ?? 100000,
		maxBioLength: config.maxBioLength ?? 1500,
		maxRemoteBioLength: config.maxRemoteBioLength ?? 15000,
		maxDialogAnnouncements: config.maxDialogAnnouncements ?? 5,
		clusterLimit: config.clusterLimit,
		outgoingAddress: config.outgoingAddress,
		outgoingAddressFamily: config.outgoingAddressFamily,
		deliverJobConcurrency: config.deliverJobConcurrency,
		inboxJobConcurrency: config.inboxJobConcurrency,
		relationshipJobConcurrency: config.relationshipJobConcurrency,
		backgroundJobConcurrency: config.backgroundJobConcurrency,
		deliverJobPerSec: config.deliverJobPerSec,
		inboxJobPerSec: config.inboxJobPerSec,
		relationshipJobPerSec: config.relationshipJobPerSec,
		backgroundJobPerSec: config.backgroundJobPerSec,
		deliverJobMaxAttempts: config.deliverJobMaxAttempts,
		inboxJobMaxAttempts: config.inboxJobMaxAttempts,
		backgroundJobMaxAttempts: config.backgroundJobMaxAttempts,
		proxyRemoteFiles: config.proxyRemoteFiles,
		customMOTD: config.customMOTD,
		signToActivityPubGet: config.signToActivityPubGet ?? true,
		attachLdSignatureForRelays: config.attachLdSignatureForRelays ?? true,
		checkActivityPubGetSignature: config.checkActivityPubGetSignature,
		mediaDirectory: config.mediaDirectory ?? resolve(_dirname, '../../../files'),
		mediaProxy: externalMediaProxy ?? internalMediaProxy,
		externalMediaProxyEnabled: externalMediaProxy !== null && externalMediaProxy !== internalMediaProxy,
		videoThumbnailGenerator: config.videoThumbnailGenerator ?
			config.videoThumbnailGenerator.endsWith('/') ? config.videoThumbnailGenerator.substring(0, config.videoThumbnailGenerator.length - 1) : config.videoThumbnailGenerator
			: null,
		userAgent: `Misskey/${version} (${config.url})`,
		frontendEntry: frontendManifest['src/_boot_.ts'],
		frontendManifestExists: frontendManifestExists,
		frontendEmbedEntry: frontendEmbedManifest['src/boot.ts'],
		frontendEmbedManifestExists: frontendEmbedManifestExists,
		perChannelMaxNoteCacheCount: config.perChannelMaxNoteCacheCount ?? 1000,
		perUserNotificationsMaxCount: config.perUserNotificationsMaxCount ?? 500,
		deactivateAntennaThreshold: config.deactivateAntennaThreshold ?? (1000 * 60 * 60 * 24 * 7),
		import: config.import,
		pidFile: config.pidFile,
		avatarDecorationAllowedHosts: config.avatarDecorationAllowedHosts,
		stpvAprilFoolsEnabled: config.stpvAprilFoolsEnabled,
		filePermissionBits: config.filePermissionBits,
		logging: config.logging,
		activityLogging: {
			enabled: config.activityLogging?.enabled ?? false,
			preSave: config.activityLogging?.preSave ?? false,
			maxAge: config.activityLogging?.maxAge ?? (1000 * 60 * 60 * 24 * 30),
		},
		websocketCompression: config.websocketCompression ?? false,
		customHtml: {
			head: config.customHtml?.head ?? '',
		},
	};
}

function tryCreateUrl(url: string) {
	if (!url) {
		throw new Error('Failed to load: no "url" property found in config. Please check the value of "MISSKEY_CONFIG_DIR" and "MISSKEY_CONFIG_YML", and verify that all configuration files are correct.');
	}

	try {
		return new URL(url);
	} catch (e) {
		throw new Error(`url="${url}" is not a valid URL.`);
	}
}

function convertRedisOptions(options: RedisOptionsSource, host: string): RedisOptions & RedisOptionsSource {
	return {
		...options,
		password: options.pass,
		prefix: options.prefix ?? host,
		family: options.family ?? 0,
		keyPrefix: `${options.prefix ?? host}:`,
		db: options.db ?? 0,
	};
}

/*
	this function allows overriding any string-valued config option with
	a sensible-named environment variable

	e.g. `MK_CONFIG_MEILISEARCH_APIKEY` sets `config.meilisearch.apikey`

	you can also override a single `dbSlave` value,
	e.g. `MK_CONFIG_DBSLAVES_1_PASS` sets the password for the 2nd
	database replica (the first one would be
	`MK_CONFIG_DBSLAVES_0_PASS`); in this case, `config.dbSlaves` must
	be set to an array of the right size already in the file

	values can be read from files, too: setting `MK_DB_PASS_FILE` to
	`/some/file` would set the main database password to the contents of
	`/some/file` (trimmed of whitespaces)
 */
function applyEnvOverrides(config: Source) {
	// these inner functions recurse through the config structure, using
	// the given steps, building the env variable name

	function _apply_top(steps: (string | string[] | number | number[])[]) {
		_walk('', [], steps);
	}

	function _walk(name: string, path: (string | number)[], steps: (string | string[] | number | number[])[]) {
		// are there more steps after this one? recurse
		if (steps.length > 1) {
			const thisStep = steps.shift();
			if (thisStep === null || thisStep === undefined) return;

			// if a step is not a simple value, iterate through it
			if (typeof thisStep === 'object') {
				for (const thisOneStep of thisStep) {
					_descend(name, path, thisOneStep, steps);
				}
			} else {
				_descend(name, path, thisStep, steps);
			}

			// the actual override has happened at the bottom of the
			// recursion, we're done
			return;
		}

		// this is the last step, same thing as above
		const lastStep = steps[0];

		if (typeof lastStep === 'object') {
			for (const lastOneStep of lastStep) {
				_lastBit(name, path, lastOneStep);
			}
		} else {
			_lastBit(name, path, lastStep);
		}
	}

	function _step2name(step: string | number): string {
		return step.toString().replaceAll(/[^a-z0-9]+/gi, '').toUpperCase();
	}

	// this recurses down, bailing out if there's no config to override
	function _descend(name: string, path: (string | number)[], thisStep: string | number, steps: (string | string[] | number | number[])[]) {
		name = `${name}${_step2name(thisStep)}_`;
		path = [...path, thisStep];
		_walk(name, path, steps);
	}

	// this is the bottom of the recursion: look at the environment and
	// set the value
	function _lastBit(name: string, path: (string | number)[], lastStep: string | number) {
		name = `MK_CONFIG_${name}${_step2name(lastStep)}`;

		const val = process.env[name];
		if (val !== null && val !== undefined) {
			_assign(path, lastStep, val);
		}

		const file = process.env[`${name}_FILE`];
		if (file) {
			_assign(path, lastStep, fs.readFileSync(file, 'utf-8').trim());
		}
	}

	const alwaysStrings: { [key in string]?: boolean } = {
		'chmodSocket': true,
		'filePermissionBits': true,
	};

	function _assign(path: (string | number)[], lastStep: string | number, value: string) {
		let thisConfig = config as any;
		for (const step of path) {
			if (!thisConfig[step]) {
				thisConfig[step] = {};
			}
			thisConfig = thisConfig[step];
		}

		if (!alwaysStrings[lastStep]) {
			if (value.match(/^[0-9]+$/)) {
				thisConfig[lastStep] = parseInt(value);
				return;
			} else if (value.match(/^(true|false)$/i)) {
				thisConfig[lastStep] = !!value.match(/^true$/i);
				return;
			}
		}

		thisConfig[lastStep] = value;
	}

	// these are all the settings that can be overridden

	_apply_top([['url', 'port', 'address', 'socket', 'chmodSocket', 'disableHsts', 'id', 'dbReplications', 'websocketCompression']]);
	_apply_top(['db', ['host', 'port', 'db', 'user', 'pass', 'slowQueryThreshold', 'disableCache']]);
	_apply_top(['dbSlaves', Array.from((config.dbSlaves ?? []).keys()), ['host', 'port', 'db', 'user', 'pass']]);
	_apply_top([
		['redis', 'redisForPubsub', 'redisForJobQueue', 'redisForTimelines', 'redisForReactions', 'redisForRateLimit'],
		['host', 'port', 'username', 'pass', 'db', 'prefix'],
	]);
	_apply_top(['fulltextSearch', 'provider']);
	_apply_top(['meilisearch', ['host', 'port', 'apiKey', 'ssl', 'index', 'scope']]);
	_apply_top([['sentryForFrontend', 'sentryForBackend'], 'options', ['dsn', 'profileSampleRate', 'serverName', 'includeLocalVariables', 'proxy', 'keepAlive', 'caCerts']]);
	_apply_top(['sentryForBackend', 'enableNodeProfiling']);
	_apply_top(['sentryForFrontend', 'vueIntegration', ['attachProps', 'attachErrorHandler']]);
	_apply_top(['sentryForFrontend', 'vueIntegration', 'tracingOptions', 'timeout']);
	_apply_top(['sentryForFrontend', 'browserTracingIntegration', 'routeLabel']);
	_apply_top([['clusterLimit', 'deliverJobConcurrency', 'inboxJobConcurrency', 'relashionshipJobConcurrency', 'deliverJobPerSec', 'inboxJobPerSec', 'relashionshipJobPerSec', 'deliverJobMaxAttempts', 'inboxJobMaxAttempts']]);
	_apply_top([['outgoingAddress', 'outgoingAddressFamily', 'proxy', 'proxySmtp', 'mediaDirectory', 'mediaProxy', 'proxyRemoteFiles', 'videoThumbnailGenerator']]);
	_apply_top([['maxFileSize', 'maxNoteLength', 'maxRemoteNoteLength', 'maxAltTextLength', 'maxRemoteAltTextLength', 'maxBioLength', 'maxRemoteBioLength', 'maxDialogAnnouncements', 'pidFile', 'filePermissionBits']]);
	_apply_top(['import', ['downloadTimeout', 'maxFileSize']]);
	_apply_top([['signToActivityPubGet', 'checkActivityPubGetSignature', 'setupPassword', 'disallowExternalApRedirect']]);
	_apply_top(['logging', 'sql', ['disableQueryTruncation', 'enableQueryParamLogging']]);
	_apply_top(['activityLogging', ['enabled', 'preSave', 'maxAge']]);
	_apply_top(['customHtml', ['head']]);
}
