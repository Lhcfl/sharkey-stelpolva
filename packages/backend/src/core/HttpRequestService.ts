/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import ipaddr from 'ipaddr.js';
import CacheableLookup from 'cacheable-lookup';
import fetch from 'node-fetch';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config, PrivateNetwork } from '@/config.js';
import { StatusError } from '@/misc/status-error.js';
import { bindThis } from '@/decorators.js';
import { validateContentTypeSetAsActivityPub } from '@/core/activitypub/misc/validator.js';
import type { IObject, IObjectWithId } from '@/core/activitypub/type.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import type { Response } from 'node-fetch';
import type { Socket } from 'node:net';

export type HttpRequestSendOptions = {
	throwErrorWhenResponseNotOk: boolean;
	validators?: ((res: Response) => void)[];
};

export async function isPrivateUrl(url: URL, lookup: net.LookupFunction): Promise<boolean> {
	const ip = await resolveIp(url, lookup);
	return ip.range() !== 'unicast';
}

export async function resolveIp(url: URL, lookup: net.LookupFunction) {
	if (ipaddr.isValid(url.hostname)) {
		return ipaddr.parse(url.hostname);
	}

	const resolvedIp = await new Promise<string>((resolve, reject) => {
		lookup(url.hostname, {}, (err, address) => {
			if (err) reject(err);
			else resolve(address as string);
		});
	});

	return ipaddr.parse(resolvedIp);
}

export function isAllowedPrivateIp(allowedPrivateNetworks: PrivateNetwork[] | undefined, ip: string, port?: number): boolean {
	const parsedIp = ipaddr.parse(ip);

	for (const { cidr, ports } of allowedPrivateNetworks ?? []) {
		if (cidr[0].kind() === parsedIp.kind() && parsedIp.match(cidr)) {
			if (ports == null || (port != null && ports.includes(port))) {
				return false;
			}
		}
	}

	return parsedIp.range() !== 'unicast';
}

export function validateSocketConnect(allowedPrivateNetworks: PrivateNetwork[] | undefined, socket: Socket): void {
	const address = socket.remoteAddress;
	if (address && ipaddr.isValid(address)) {
		if (isAllowedPrivateIp(allowedPrivateNetworks, address, socket.remotePort)) {
			socket.destroy(new Error(`Blocked address: ${address}`));
		}
	}
}

declare module 'node:http' {
	interface Agent {
		createConnection(options: net.NetConnectOpts, callback?: (err: unknown, stream: net.Socket) => void): net.Socket;
	}
}

class HttpRequestServiceAgent extends http.Agent {
	constructor(
		private config: Config,
		options?: http.AgentOptions,
	) {
		super(options);
	}

	@bindThis
	public createConnection(options: net.NetConnectOpts, callback?: (err: unknown, stream: net.Socket) => void): net.Socket {
		const socket = super.createConnection(options, callback)
			.on('connect', () => {
				if (process.env.NODE_ENV === 'production') {
					validateSocketConnect(this.config.allowedPrivateNetworks, socket);
				}
			});
		return socket;
	}
}

class HttpsRequestServiceAgent extends https.Agent {
	constructor(
		private config: Config,
		options?: https.AgentOptions,
	) {
		super(options);
	}

	@bindThis
	public createConnection(options: net.NetConnectOpts, callback?: (err: unknown, stream: net.Socket) => void): net.Socket {
		const socket = super.createConnection(options, callback)
			.on('connect', () => {
				if (process.env.NODE_ENV === 'production') {
					validateSocketConnect(this.config.allowedPrivateNetworks, socket);
				}
			});
		return socket;
	}
}

@Injectable()
export class HttpRequestService {
	/**
	 * Get http non-proxy agent (without local address filtering)
	 */
	private readonly httpNative: http.Agent;

	/**
	 * Get https non-proxy agent (without local address filtering)
	 */
	private readonly httpsNative: https.Agent;

	/**
	 * Get http non-proxy agent
	 */
	private readonly http: http.Agent;

	/**
	 * Get https non-proxy agent
	 */
	private readonly https: https.Agent;

	/**
	 * Get http proxy or non-proxy agent
	 */
	public readonly httpAgent: http.Agent;

	/**
	 * Get https proxy or non-proxy agent
	 */
	public readonly httpsAgent: https.Agent;

	/**
	 * Get shared DNS resolver
	 */
	public readonly lookup: net.LookupFunction;

	constructor(
		@Inject(DI.config)
		private config: Config,
		private readonly apUtilityService: ApUtilityService,
		private readonly utilityService: UtilityService,
	) {
		const cache = new CacheableLookup({
			maxTtl: 3600,	// 1hours
			errorTtl: 30,	// 30secs
			lookup: false,	// nativeのdns.lookupにfallbackしない
		});

		this.lookup = cache.lookup as unknown as net.LookupFunction;

		const agentOption = {
			keepAlive: true,
			keepAliveMsecs: 30 * 1000,
			lookup: cache.lookup as unknown as net.LookupFunction,
			localAddress: config.outgoingAddress,
		};

		this.httpNative = new http.Agent(agentOption);

		this.httpsNative = new https.Agent(agentOption);

		this.http = new HttpRequestServiceAgent(config, agentOption);

		this.https = new HttpsRequestServiceAgent(config, agentOption);

		const maxSockets = Math.max(256, config.deliverJobConcurrency ?? 128);

		this.httpAgent = config.proxy
			? new HttpProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: config.proxy,
				localAddress: config.outgoingAddress,
			})
			: this.http;

		this.httpsAgent = config.proxy
			? new HttpsProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: config.proxy,
				localAddress: config.outgoingAddress,
			})
			: this.https;
	}

	/**
	 * Get agent by URL
	 * @param url URL
	 * @param bypassProxy Always bypass proxy
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentByUrl(url: URL, bypassProxy = false, isLocalAddressAllowed = false): http.Agent | https.Agent {
		if (bypassProxy || (this.config.proxyBypassHosts ?? []).includes(url.hostname)) {
			if (isLocalAddressAllowed) {
				return url.protocol === 'http:' ? this.httpNative : this.httpsNative;
			}
			return url.protocol === 'http:' ? this.http : this.https;
		} else {
			if (isLocalAddressAllowed && (!this.config.proxy)) {
				return url.protocol === 'http:' ? this.httpNative : this.httpsNative;
			}
			return url.protocol === 'http:' ? this.httpAgent : this.httpsAgent;
		}
	}

	/**
	 * Get agent for http by URL
	 * @param url URL
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentForHttp(url: URL, isLocalAddressAllowed = false): http.Agent {
		if ((this.config.proxyBypassHosts ?? []).includes(url.hostname)) {
			return isLocalAddressAllowed
				? this.httpNative
				: this.http;
		} else {
			return this.httpAgent;
		}
	}

	/**
	 * Get agent for https by URL
	 * @param url URL
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentForHttps(url: URL, isLocalAddressAllowed = false): https.Agent {
		if ((this.config.proxyBypassHosts ?? []).includes(url.hostname)) {
			return isLocalAddressAllowed
				? this.httpsNative
				: this.https;
		} else {
			return this.httpsAgent;
		}
	}

	@bindThis
	public async getActivityJson(url: string, isLocalAddressAllowed = false, allowAnonymous = false): Promise<IObjectWithId> {
		const res = await this.send(url, {
			method: 'GET',
			headers: {
				Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
			},
			timeout: 5000,
			size: 1024 * 256,
			isLocalAddressAllowed: isLocalAddressAllowed,
		}, {
			throwErrorWhenResponseNotOk: true,
			validators: [validateContentTypeSetAsActivityPub],
		});

		const activity = await res.json() as IObject;

		// Make sure the object ID matches the final URL (which is where it actually exists).
		// The caller (ApResolverService) will verify the ID against the original / entry URL, which ensures that all three match.
		if (allowAnonymous && activity.id == null) {
			activity.id = res.url;
		} else {
			this.apUtilityService.assertIdMatchesUrlAuthority(activity, res.url);
		}

		return activity as IObjectWithId;
	}

	@bindThis
	public async getJson<T = unknown>(url: string, accept = 'application/json, */*', headers?: Record<string, string>, isLocalAddressAllowed = false): Promise<T> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
			size: 1024 * 256,
			isLocalAddressAllowed: isLocalAddressAllowed,
		});

		return await res.json() as T;
	}

	@bindThis
	public async getHtml(url: string, accept = 'text/html, */*', headers?: Record<string, string>, isLocalAddressAllowed = false): Promise<string> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
			isLocalAddressAllowed: isLocalAddressAllowed,
		});

		return await res.text();
	}

	@bindThis
	public async send(
		url: string,
		args: {
			method?: string,
			body?: string,
			headers?: Record<string, string>,
			timeout?: number,
			size?: number,
			isLocalAddressAllowed?: boolean,
			allowHttp?: boolean,
		} = {},
		extra: HttpRequestSendOptions = {
			throwErrorWhenResponseNotOk: true,
			validators: [],
		},
	): Promise<Response> {
		const timeout = args.timeout ?? 5000;

		const parsedUrl = new URL(url);
		const allowHttp = args.allowHttp || await isPrivateUrl(parsedUrl, this.lookup);
		this.utilityService.assertUrl(parsedUrl, allowHttp);

		const controller = new AbortController();
		setTimeout(() => {
			controller.abort();
		}, timeout);

		const isLocalAddressAllowed = args.isLocalAddressAllowed ?? false;

		const res = await fetch(parsedUrl, {
			method: args.method ?? 'GET',
			headers: {
				'User-Agent': this.config.userAgent,
				...(args.headers ?? {}),
			},
			body: args.body,
			size: args.size ?? 10 * 1024 * 1024,
			agent: (url) => this.getAgentByUrl(url, false, isLocalAddressAllowed),
			signal: controller.signal,
		});

		if (!res.ok && extra.throwErrorWhenResponseNotOk) {
			throw new StatusError(`request error from ${url}`, res.status, res.statusText);
		}

		if (res.ok) {
			for (const validator of (extra.validators ?? [])) {
				validator(res);
			}
		}

		return res;
	}
}
