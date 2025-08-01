/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL, domainToASCII } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import RE2 from 're2';
import psl from 'psl';
import semver from 'semver';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import type { MiMeta, SoftwareSuspension } from '@/models/Meta.js';
import type { MiInstance } from '@/models/Instance.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { EnvService } from '@/core/EnvService.js';

@Injectable()
export class UtilityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		private readonly envService: EnvService,
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

	public isBlockedHost(host: string | null): boolean;
	public isBlockedHost(blockedHosts: string[], host: string | null): boolean;
	@bindThis
	public isBlockedHost(blockedHostsOrHost: string[] | string | null, host?: string | null): boolean {
		const blockedHosts = Array.isArray(blockedHostsOrHost) ? blockedHostsOrHost : this.meta.blockedHosts;
		host = Array.isArray(blockedHostsOrHost) ? host : blockedHostsOrHost;

		if (host == null) return false;
		return blockedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	public isSilencedHost(host: string | null): boolean;
	public isSilencedHost(silencedHosts: string[], host: string | null): boolean;
	@bindThis
	public isSilencedHost(silencedHostsOrHost: string[] | string | null, host?: string | null): boolean {
		const silencedHosts = Array.isArray(silencedHostsOrHost) ? silencedHostsOrHost : this.meta.silencedHosts;
		host = Array.isArray(silencedHostsOrHost) ? host : silencedHostsOrHost;

		if (host == null) return false;
		return silencedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	public isMediaSilencedHost(host: string | null): boolean;
	public isMediaSilencedHost(silencedHosts: string[], host: string | null): boolean;
	@bindThis
	public isMediaSilencedHost(mediaSilencedHostsOrHost: string[] | string | null, host?: string | null): boolean {
		const mediaSilencedHosts = Array.isArray(mediaSilencedHostsOrHost) ? mediaSilencedHostsOrHost : this.meta.mediaSilencedHosts;
		host = Array.isArray(mediaSilencedHostsOrHost) ? host : mediaSilencedHostsOrHost;

		if (host == null) return false;
		return mediaSilencedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isAllowListedHost(host: string | null): boolean {
		if (host == null) return false;
		return this.meta.federationHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isBubbledHost(host: string | null): boolean {
		if (host == null) return false;
		return this.meta.bubbleInstances.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
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
	public punyHostPSLDomain(url: string | URL): string {
		const urlObj = typeof(url) === 'object' ? url : new URL(url);
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

	@bindThis
	public isDeliverSuspendedSoftware(software: Pick<MiInstance, 'softwareName' | 'softwareVersion'>): SoftwareSuspension | undefined {
		if (software.softwareName == null) return undefined;
		if (software.softwareVersion == null) {
			// software version is null; suspend iff versionRange is *
			return this.meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& x.versionRange.trim() === '*');
		} else {
			const softwareVersion = software.softwareVersion;
			return this.meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& semver.satisfies(softwareVersion, x.versionRange, { includePrerelease: true }));
		}
	}

	/**
	 * Verifies that a provided URL is in a format acceptable for federation.
	 * @throws {IdentifiableError} If URL cannot be parsed
	 * @throws {IdentifiableError} If URL is not HTTPS
	 * @throws {IdentifiableError} If URL contains credentials
	 */
	@bindThis
	public assertUrl(url: string | URL, allowHttp?: boolean): URL | never {
		// If string, parse and validate
		if (typeof(url) === 'string') {
			try {
				url = new URL(url);
			} catch {
				throw new IdentifiableError('0bedd29b-e3bf-4604-af51-d3352e2518af', `invalid url ${url}: not a valid URL`);
			}
		}

		// Must be HTTPS
		if (!this.checkHttps(url, allowHttp)) {
			throw new IdentifiableError('0bedd29b-e3bf-4604-af51-d3352e2518af', `invalid url ${url}: unsupported protocol ${url.protocol}`);
		}

		// Must not have credentials
		if (url.username || url.password) {
			throw new IdentifiableError('0bedd29b-e3bf-4604-af51-d3352e2518af', `invalid url ${url}: contains embedded credentials`);
		}

		return url;
	}

	/**
	 * Checks if the URL contains HTTPS.
	 * Additionally, allows HTTP in non-production environments.
	 * Based on check-https.ts.
	 */
	@bindThis
	public checkHttps(url: string | URL, allowHttp = false): boolean {
		const isNonProd = this.envService.env.NODE_ENV !== 'production';

		try {
			const proto = new URL(url).protocol;
			return proto === 'https:' || (proto === 'http:' && (isNonProd || allowHttp));
		} catch {
			// Invalid URLs don't "count" as HTTPS
			return false;
		}
	}
}
