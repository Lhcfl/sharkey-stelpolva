/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';

export type ILink = {
	href: string;
	rel?: string;
};

export type IWebFinger = {
	links: ILink[];
	subject: string;
};

const urlRegex = /^https?:\/\//;
const mRegex = /^([^@]+)@(.*)/;

@Injectable()
export class WebfingerService {
	constructor(
		private httpRequestService: HttpRequestService,
	) {
	}

	@bindThis
	public async webfinger(query: string): Promise<IWebFinger> {
		const hostMetaUrl = this.queryToHostMetaUrl(query);
		const template = await this.fetchHostMeta(hostMetaUrl) ?? this.queryToWebFingerTemplate(query);
		const url = this.genUrl(query, template);

		return await this.httpRequestService.getJson<IWebFinger>(url, 'application/jrd+json, application/json');
	}

	@bindThis
	private genUrl(query: string, template: string): string {
		if (template.indexOf('{uri}') < 0) throw new Error(`Invalid webFingerUrl: ${template}`);

		if (query.match(urlRegex)) {
			return template.replace('{uri}', encodeURIComponent(query));
		}

		const m = query.match(mRegex);
		if (m) {
			return template.replace('{uri}', encodeURIComponent(`acct:${query}`));
		}

		throw new Error(`Invalid query (${query})`);
	}

	@bindThis
	private queryToWebFingerTemplate(query: string): string {
		const useHttp = process.env.MISSKEY_WEBFINGER_USE_HTTP && process.env.MISSKEY_WEBFINGER_USE_HTTP.toLowerCase() === 'true';
		if (query.match(urlRegex)) {
			const u = new URL(query);
			return `${useHttp ? 'http' : u.protocol}//${u.hostname}/.well-known/webfinger?resource={uri}`;
		}

		const m = query.match(mRegex);
		if (m) {
			const hostname = m[2];
			return `http${useHttp ? '' : 's'}//${hostname}/.well-known/webfinger?resource={uri}`;
		}

		throw new Error(`Invalid query (${query})`);
	}

	@bindThis
	private queryToHostMetaUrl(query: string): string {
		if (query.match(urlRegex)) {
			const u = new URL(query);
			const useHttp = process.env.MISSKEY_WEBFINGER_USE_HTTP && process.env.MISSKEY_WEBFINGER_USE_HTTP.toLowerCase() === 'true';
			return `${useHttp ? 'http' : u.protocol}//${u.hostname}/.well-known/host-meta`;
		}

		const m = query.match(mRegex);
		if (m) {
			const hostname = m[2];
			return `https://${hostname}/.well-known/host-meta`;
		}

		throw new Error(`Invalid query (${query})`);
	}

	@bindThis
	private async fetchHostMeta(url: string): Promise<string | null> {
		try {
			const res = await this.httpRequestService.getHtml(url, 'application/xrd+xml');
			const options = {
				ignoreAttributes: false,
				isArray: (_name: string, jpath: string) => jpath === 'XRD.Link',
			};
			const parser = new XMLParser(options);
			const hostMeta = parser.parse(res);
			const template = (hostMeta['XRD']['Link'] as Array<any>).filter(p => p['@_rel'] === 'lrdd')[0]['@_template'];
			return template.indexOf('{uri}') < 0 ? null : template;
		} catch (err) {
			console.error(`error while request host-meta for ${url}`);
			return null;
		}
	}
}
