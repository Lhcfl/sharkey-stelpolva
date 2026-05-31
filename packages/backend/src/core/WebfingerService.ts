/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { Injectable } from '@nestjs/common';
import { load as cheerio } from 'cheerio/slim';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { EnvService } from '@/global/EnvService.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { RemoteLoggerService } from './RemoteLoggerService.js';

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
	private readonly defaultProtocol: 'http:' | 'https:';

	private logger: Logger;

	constructor(
		private httpRequestService: HttpRequestService,
		private remoteLoggerService: RemoteLoggerService,

		envService: EnvService,
	) {
		this.logger = this.remoteLoggerService.logger.createSubLogger('webfinger');

		// we have the colons here, because URL.protocol does as well, so it's
		// more uniform in the places we use both
		this.defaultProtocol = envService.env.MISSKEY_WEBFINGER_USE_HTTP?.toLowerCase() === 'true' ? 'http:' : 'https:';
	}

	@bindThis
	public async webfinger(query: string): Promise<IWebFinger> {
		const hostMetaUrl = this.queryToHostMetaUrl(query);
		const template = await this.fetchWebFingerTemplateFromHostMeta(hostMetaUrl) ?? this.queryToWebFingerTemplate(query);
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
		if (query.match(urlRegex)) {
			const u = new URL(query);
			return `${u.protocol}//${u.hostname}/.well-known/webfinger?resource={uri}`;
		}

		const m = query.match(mRegex);
		if (m) {
			const hostname = m[2];
			return `${this.defaultProtocol}//${hostname}/.well-known/webfinger?resource={uri}`;
		}

		throw new Error(`Invalid query (${query})`);
	}

	@bindThis
	private queryToHostMetaUrl(query: string): string {
		if (query.match(urlRegex)) {
			const u = new URL(query);
			return `${u.protocol}//${u.hostname}/.well-known/host-meta`;
		}

		const m = query.match(mRegex);
		if (m) {
			const hostname = m[2];
			return `${this.defaultProtocol}//${hostname}/.well-known/host-meta`;
		}

		throw new Error(`Invalid query (${query})`);
	}

	@bindThis
	private async fetchWebFingerTemplateFromHostMeta(url: string): Promise<string | null> {
		try {
			const res = await this.httpRequestService.getHtml(url, 'application/xrd+xml');
			const hostMeta = cheerio(res, {
				xml: true,
			});

			const template = hostMeta('XRD > Link[rel="lrdd"][template*="{uri}"]').attr('template');
			return template ?? null;
		} catch (err) {
			this.logger.error(`error while request host-meta for ${url}: ${renderInlineError(err)}`);
			return null;
		}
	}
}
