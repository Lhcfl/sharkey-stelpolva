/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { globSync } from 'glob';
import type { RedisOptions } from 'ioredis';

type RedisOptionsSource = Partial<RedisOptions> & {
	host: string;
	port: number;
	family?: number;
	pass: string;
	db?: number;
	prefix?: string;
};

/**
 * 設定ファイルの型
 */
type Source = {
	url: string;
	port?: number;
	socket?: string;
	chmodSocket?: string;
	disableHsts?: boolean;
	db: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
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
	meilisearch?: {
		host: string;
		port: string;
		apiKey: string;
		ssl?: boolean;
		index: string;
		scope?: 'local' | 'global' | string[];
	};

	publishTarballInsteadOfProvideRepositoryUrl?: boolean;

	proxy?: string;
	proxySmtp?: string;
	proxyBypassHosts?: string[];

	allowedPrivateNetworks?: string[];

	maxFileSize?: number;
	maxNoteLength?: number;

	clusterLimit?: number;

	id: string;

	outgoingAddress?: string;
	outgoingAddressFamily?: 'ipv4' | 'ipv6' | 'dual';

	deliverJobConcurrency?: number;
	inboxJobConcurrency?: number;
	relationshipJobConcurrency?: number;
	deliverJobPerSec?: number;
	inboxJobPerSec?: number;
	relationshipJobPerSec?: number;
	deliverJobMaxAttempts?: number;
	inboxJobMaxAttempts?: number;

	mediaProxy?: string;
	proxyRemoteFiles?: boolean;
	videoThumbnailGenerator?: string;

	customMOTD?: string[];

	signToActivityPubGet?: boolean;
	checkActivityPubGetSignature?: boolean;

	perChannelMaxNoteCacheCount?: number;
	perUserNotificationsMaxCount?: number;
	deactivateAntennaThreshold?: number;
	pidFile: string;
};

export type Config = {
	url: string;
	port: number;
	socket: string | undefined;
	chmodSocket: string | undefined;
	disableHsts: boolean | undefined;
	db: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
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
	allowedPrivateNetworks: string[] | undefined;
	maxFileSize: number | undefined;
	maxNoteLength: number;
	clusterLimit: number | undefined;
	id: string;
	outgoingAddress: string | undefined;
	outgoingAddressFamily: 'ipv4' | 'ipv6' | 'dual' | undefined;
	deliverJobConcurrency: number | undefined;
	inboxJobConcurrency: number | undefined;
	relationshipJobConcurrency: number | undefined;
	deliverJobPerSec: number | undefined;
	inboxJobPerSec: number | undefined;
	relationshipJobPerSec: number | undefined;
	deliverJobMaxAttempts: number | undefined;
	inboxJobMaxAttempts: number | undefined;
	proxyRemoteFiles: boolean | undefined;
	customMOTD: string[] | undefined;
	signToActivityPubGet: boolean;
	checkActivityPubGetSignature: boolean | undefined;

	version: string;
	publishTarballInsteadOfProvideRepositoryUrl: boolean;
	host: string;
	hostname: string;
	scheme: string;
	wsScheme: string;
	apiUrl: string;
	wsUrl: string;
	authUrl: string;
	driveUrl: string;
	userAgent: string;
	clientEntry: string;
	clientManifestExists: boolean;
	mediaProxy: string;
	externalMediaProxyEnabled: boolean;
	videoThumbnailGenerator: string | null;
	redis: RedisOptions & RedisOptionsSource;
	redisForPubsub: RedisOptions & RedisOptionsSource;
	redisForJobQueue: RedisOptions & RedisOptionsSource;
	redisForTimelines: RedisOptions & RedisOptionsSource;
	perChannelMaxNoteCacheCount: number;
	perUserNotificationsMaxCount: number;
	deactivateAntennaThreshold: number;
	pidFile: string;
};

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

/**
 * Path of configuration directory
 */
const dir = `${_dirname}/../../../.config`;

/**
 * Path of configuration file
 */
const path = process.env.MISSKEY_CONFIG_YML
	? resolve(dir, process.env.MISSKEY_CONFIG_YML)
	: process.env.NODE_ENV === 'test'
		? resolve(dir, 'test.yml')
		: resolve(dir, 'default.yml');

export function loadConfig(): Config {
	const meta = JSON.parse(fs.readFileSync(`${_dirname}/../../../built/meta.json`, 'utf-8'));
	const clientManifestExists = fs.existsSync(`${_dirname}/../../../built/_vite_/manifest.json`);
	const clientManifest = clientManifestExists ?
		JSON.parse(fs.readFileSync(`${_dirname}/../../../built/_vite_/manifest.json`, 'utf-8'))
		: { 'src/_boot_.ts': { file: 'src/_boot_.ts' } };

	const config = globSync(path).sort()
		.map(path => fs.readFileSync(path, 'utf-8'))
		.map(contents => yaml.load(contents) as Source)
		.reduce(
			(acc: Source, cur: Source) => Object.assign(acc, cur),
			{} as Source,
		) as Source;

	applyEnvOverrides(config);

	const url = tryCreateUrl(config.url);
	const version = meta.version;
	const host = url.host;
	const hostname = url.hostname;
	const scheme = url.protocol.replace(/:$/, '');
	const wsScheme = scheme.replace('http', 'ws');

	const externalMediaProxy = config.mediaProxy ?
		config.mediaProxy.endsWith('/') ? config.mediaProxy.substring(0, config.mediaProxy.length - 1) : config.mediaProxy
		: null;
	const internalMediaProxy = `${scheme}://${host}/proxy`;
	const redis = convertRedisOptions(config.redis, host);

	return {
		version,
		publishTarballInsteadOfProvideRepositoryUrl: !!config.publishTarballInsteadOfProvideRepositoryUrl,
		url: url.origin,
		port: config.port ?? parseInt(process.env.PORT ?? '', 10),
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
		db: config.db,
		dbReplications: config.dbReplications,
		dbSlaves: config.dbSlaves,
		meilisearch: config.meilisearch,
		redis,
		redisForPubsub: config.redisForPubsub ? convertRedisOptions(config.redisForPubsub, host) : redis,
		redisForJobQueue: config.redisForJobQueue ? convertRedisOptions(config.redisForJobQueue, host) : redis,
		redisForTimelines: config.redisForTimelines ? convertRedisOptions(config.redisForTimelines, host) : redis,
		id: config.id,
		proxy: config.proxy,
		proxySmtp: config.proxySmtp,
		proxyBypassHosts: config.proxyBypassHosts,
		allowedPrivateNetworks: config.allowedPrivateNetworks,
		maxFileSize: config.maxFileSize,
		maxNoteLength: config.maxNoteLength ?? 3000,
		clusterLimit: config.clusterLimit,
		outgoingAddress: config.outgoingAddress,
		outgoingAddressFamily: config.outgoingAddressFamily,
		deliverJobConcurrency: config.deliverJobConcurrency,
		inboxJobConcurrency: config.inboxJobConcurrency,
		relationshipJobConcurrency: config.relationshipJobConcurrency,
		deliverJobPerSec: config.deliverJobPerSec,
		inboxJobPerSec: config.inboxJobPerSec,
		relationshipJobPerSec: config.relationshipJobPerSec,
		deliverJobMaxAttempts: config.deliverJobMaxAttempts,
		inboxJobMaxAttempts: config.inboxJobMaxAttempts,
		proxyRemoteFiles: config.proxyRemoteFiles,
		customMOTD: config.customMOTD,
		signToActivityPubGet: config.signToActivityPubGet ?? true,
		checkActivityPubGetSignature: config.checkActivityPubGetSignature,
		mediaProxy: externalMediaProxy ?? internalMediaProxy,
		externalMediaProxyEnabled: externalMediaProxy !== null && externalMediaProxy !== internalMediaProxy,
		videoThumbnailGenerator: config.videoThumbnailGenerator ?
			config.videoThumbnailGenerator.endsWith('/') ? config.videoThumbnailGenerator.substring(0, config.videoThumbnailGenerator.length - 1) : config.videoThumbnailGenerator
			: null,
		userAgent: `Misskey/${version} (${config.url})`,
		clientEntry: clientManifest['src/_boot_.ts'],
		clientManifestExists: clientManifestExists,
		perChannelMaxNoteCacheCount: config.perChannelMaxNoteCacheCount ?? 1000,
		perUserNotificationsMaxCount: config.perUserNotificationsMaxCount ?? 500,
		deactivateAntennaThreshold: config.deactivateAntennaThreshold ?? (1000 * 60 * 60 * 24 * 7),
		pidFile: config.pidFile,
	};
}

function tryCreateUrl(url: string) {
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

	function _apply_top(steps: (string | number)[]) {
		_walk('', [], steps);
	}

	function _walk(name: string, path: (string | number)[], steps: (string | number)[]) {
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

	function _step2name(step: string|number): string {
		return step.toString().replaceAll(/[^a-z0-9]+/gi,'').toUpperCase();
	}

	// this recurses down, bailing out if there's no config to override
	function _descend(name: string, path: (string | number)[], thisStep: string | number, steps: (string | number)[]) {
		name = `${name}${_step2name(thisStep)}_`;
		path = [ ...path, thisStep ];
		_walk(name, path, steps);
	}

	// this is the bottom of the recursion: look at the environment and
	// set the value
	function _lastBit(name: string, path: (string | number)[], lastStep: string | number) {
		name = `MK_CONFIG_${name}${_step2name(lastStep)}`;

		const val = process.env[name];
		if (val != null && val != undefined) {
			_assign(path, lastStep, val);
		}

		const file = process.env[`${name}_FILE`];
		if (file) {
			_assign(path, lastStep, fs.readFileSync(file, 'utf-8').trim());
		}
	}

	const alwaysStrings = { 'chmodSocket': 1 };

	function _assign(path: (string | number)[], lastStep: string | number, value: string) {
		let thisConfig = config;
		for (const step of path) {
			if (!thisConfig[step]) {
				thisConfig[step] = {};
			}
			thisConfig = thisConfig[step];
		}

		if (!alwaysStrings[lastStep]) {
			if (value.match(/^[0-9]+$/)) {
				value = parseInt(value);
			} else if (value.match(/^(true|false)$/i)) {
				value = !!value.match(/^true$/i);
			}
		}

		thisConfig[lastStep] = value;
	}

	// these are all the settings that can be overridden

	_apply_top([['url', 'port', 'socket', 'chmodSocket', 'disableHsts']]);
	_apply_top(['db', ['host', 'port', 'db', 'user', 'pass']]);
	_apply_top(['dbSlaves', config.dbSlaves?.keys(), ['host', 'port', 'db', 'user', 'pass']]);
	_apply_top([
		['redis', 'redisForPubsub', 'redisForJobQueue', 'redisForTimelines'],
		['host','port','username','pass','db','prefix'],
	]);
	_apply_top(['meilisearch', ['host', 'port', 'apikey', 'ssl', 'index', 'scope']]);
	_apply_top([['clusterLimit', 'deliverJobConcurrency', 'inboxJobConcurrency', 'relashionshipJobConcurrency', 'deliverJobPerSec', 'inboxJobPerSec', 'relashionshipJobPerSec', 'deliverJobMaxAttempts', 'inboxJobMaxAttempts']]);
	_apply_top([['outgoingAddress', 'outgoingAddressFamily', 'proxy', 'proxySmtp', 'mediaProxy', 'videoThumbnailGenerator']]);
	_apply_top([['maxFileSize', 'maxNoteLength', 'pidFile']]);
}
