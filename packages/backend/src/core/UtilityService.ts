/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL, domainToASCII } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import RE2 from 're2';
import psl from 'psl';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { MiMeta } from '@/models/Meta.js';

@Injectable()
export class UtilityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,
	) {
	}

	@bindThis
	public getFullApAccount(username: string, host: string | null): string {
		return host ? `${username}@${this.toPuny(host)}` : `${username}@${this.toPuny(this.config.host)}`;
	}

	@bindThis
	public isSelfHost(host: string | null): boolean {
		if (host == null) return true;
		return this.toPuny(this.config.host) === this.toPuny(host);
	}

	@bindThis
	public isUriLocal(uri: string): boolean {
		return this.punyHost(uri) === this.toPuny(this.config.host);
	}

	// メールアドレスのバリデーションを行う
	// https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
	@bindThis
	public validateEmailFormat(email: string): boolean {
		// Note: replaced MK's complicated regex with a simpler one that is more efficient and reliable.
		const regexp = /^.+@.+$/;
		//const regexp = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		return regexp.test(email);
	}

	@bindThis
	public isBlockedHost(blockedHosts: string[], host: string | null): boolean {
		if (host == null) return false;
		return blockedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isMediaSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public concatNoteContentsForKeyWordCheck(content: {
		cw?: string | null;
		text?: string | null;
		pollChoices?: string[] | null;
		others?: string[] | null;
	}): string {
		/**
		 * ノートの内容を結合してキーワードチェック用の文字列を生成する
		 * cwとtextは内容が繋がっているかもしれないので間に何も入れずにチェックする
		 */
		return `${content.cw ?? ''}${content.text ?? ''}\n${(content.pollChoices ?? []).join('\n')}\n${(content.others ?? []).join('\n')}`;
	}

	@bindThis
	public isKeyWordIncluded(text: string, keyWords: string[]): boolean {
		if (keyWords.length === 0) return false;
		if (text === '') return false;

		const regexpregexp = /^\/(.+)\/(.*)$/;

		const matched = keyWords.some(filter => {
			// represents RegExp
			const regexp = filter.match(regexpregexp);
			// This should never happen due to input sanitisation.
			if (!regexp) {
				const words = filter.split(' ');
				return words.every(keyword => text.includes(keyword));
			}
			try {
				// TODO: RE2インスタンスをキャッシュ
				return new RE2(regexp[1], regexp[2]).test(text);
			} catch (err) {
				// This should never happen due to input sanitisation.
				return false;
			}
		});

		return matched;
	}

	@bindThis
	public extractDbHost(uri: string): string {
		const url = new URL(uri);
		return this.toPuny(url.host);
	}

	@bindThis
	public toPuny(host: string): string {
		// domainToASCII will return an empty string if we give it a
		// string like `name:123`, but `host` may well be in that form
		// (e.g. when testing locally, you'll get `localhost:3000`); split
		// the port off, and add it back later
		const hostParts = host.toLowerCase().match(/^(.+?)(:.+)?$/);
		if (!hostParts) return '';
		const hostname = hostParts[1];
		const port = hostParts[2] ?? '';

		return domainToASCII(hostname) + port;
	}

	@bindThis
	public toPunyNullable(host: string | null | undefined): string | null {
		if (host == null) return null;
		return this.toPuny(host);
	}

	@bindThis
	public punyHost(url: string): string {
		const urlObj = new URL(url);
		const host = `${this.toPuny(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
		return host;
	}

	@bindThis
	private specialSuffix(hostname: string): string | null {
		// masto.host provides domain names for its clients, we have to
		// treat it as if it were a public suffix
		const mastoHost = hostname.match(/\.?([a-zA-Z0-9-]+\.masto\.host)$/i);
		if (mastoHost) {
			return mastoHost[1];
		}

		return null;
	}

	@bindThis
	public punyHostPSLDomain(url: string): string {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname;
		const domain = this.specialSuffix(hostname) ?? psl.get(hostname) ?? hostname;
		const host = `${this.toPuny(domain)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
		return host;
	}

	@bindThis
	public isFederationAllowedHost(host: string): boolean {
		if (this.meta.federation === 'none') return false;
		if (this.meta.federation === 'specified' && !this.meta.federationHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`))) return false;
		if (this.isBlockedHost(this.meta.blockedHosts, host)) return false;

		return true;
	}

	@bindThis
	public isFederationAllowedUri(uri: string): boolean {
		const host = this.extractDbHost(uri);
		return this.isFederationAllowedHost(host);
	}

	@bindThis
	public getUrlScheme(url: string): string {
		try {
			// Returns in the format "https:" or an empty string
			return new URL(url).protocol;
		} catch {
			return '';
		}
	}
}
