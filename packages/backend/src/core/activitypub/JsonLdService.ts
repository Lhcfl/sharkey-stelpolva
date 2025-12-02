/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { StatusError } from '@/misc/status-error.js';
import { TimeService } from '@/global/TimeService.js';
import { CONTEXT, PRELOADED_CONTEXTS } from './misc/contexts.js';
import { validateContentTypeSetAsJsonLD } from './misc/validator.js';
import type { ContextDefinition, JsonLdDocument } from 'jsonld';
import type { JsonLd as JsonLdObject, RemoteDocument } from 'jsonld/jsonld-spec.js';

// https://stackoverflow.com/a/66252656
type RemoveIndex<T> = {
	[ K in keyof T as string extends K
		? never
		: number extends K
			? never
			: symbol extends K
				? never
				: K
	] : T[K];
};

export type Document = RemoveIndex<JsonLdDocument>;

export type Signature = {
	id?: string;
	type: string;
	creator: string;
	domain?: string;
	nonce: string;
	created: string;
	signatureValue: string;
};

export type Signed<T extends Document> = T & {
	signature: Signature;
};

export function isSigned<T extends Document>(doc: T): doc is Signed<T> {
	return 'signature' in doc && typeof(doc.signature) === 'object';
}

// RsaSignature2017 implementation is based on https://github.com/transmute-industries/RsaSignature2017

@Injectable()
export class JsonLdService {
	private readonly logger: Logger;

	constructor(
		private httpRequestService: HttpRequestService,
		private readonly timeService: TimeService,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('json-ld');
	}

	@bindThis
	public async signRsaSignature2017<T extends Document>(data: T, privateKey: string, creator: string, domain?: string, created?: Date): Promise<Signed<T>> {
		const options: {
			type: string;
			creator: string;
			domain?: string;
			nonce: string;
			created: string;
		} = {
			type: 'RsaSignature2017',
			creator,
			nonce: crypto.randomBytes(16).toString('hex'),
			created: (created ?? this.timeService.date).toISOString(),
		};

		if (domain) {
			options.domain = domain;
		}

		const toBeSigned = await this.createVerifyData(data, options);

		const signer = crypto.createSign('sha256');
		signer.update(toBeSigned);
		signer.end();

		const signature = signer.sign(privateKey);

		return {
			...data,
			signature: {
				...options,
				signatureValue: signature.toString('base64'),
			},
		};
	}

	@bindThis
	public async verifyRsaSignature2017(data: Signed<Document>, publicKey: string): Promise<boolean> {
		const toBeSigned = await this.createVerifyData(data, data.signature);
		const verifier = crypto.createVerify('sha256');
		verifier.update(toBeSigned);
		return verifier.verify(publicKey, data.signature.signatureValue, 'base64');
	}

	@bindThis
	public async createVerifyData<T extends Document>(data: T, options: Partial<Signature>): Promise<string> {
		const transformedOptions = {
			...options,
			'@context': 'https://w3id.org/identity/v1',
		};
		delete transformedOptions['type'];
		delete transformedOptions['id'];
		delete transformedOptions['signatureValue'];
		const canonizedOptions = await this.normalize(transformedOptions);
		const optionsHash = this.sha256(canonizedOptions.toString());
		const transformedData = { ...data } as T & { signature?: unknown };
		delete transformedData['signature'];
		const cannonidedData = await this.normalize(transformedData);
		this.logger.debug('cannonidedData', cannonidedData);
		const documentHash = this.sha256(cannonidedData.toString());
		const verifyData = `${optionsHash}${documentHash}`;
		return verifyData;
	}

	@bindThis
	// TODO our default CONTEXT isn't valid for the library, is this a bug?
	public async compact(data: Document, context: ContextDefinition = CONTEXT as unknown as ContextDefinition): Promise<Document> {
		const customLoader = this.getLoader();
		// XXX: Importing jsonld dynamically since Jest frequently fails to import it statically
		// https://github.com/misskey-dev/misskey/pull/9894#discussion_r1103753595
		return await (await import('jsonld')).default.compact(data, context, {
			documentLoader: customLoader,
		});
	}

	@bindThis
	public async normalize(data: Document): Promise<string> {
		const customLoader = this.getLoader();
		return await (await import('jsonld')).default.normalize(data, {
			documentLoader: customLoader,
		});
	}

	@bindThis
	private getLoader() {
		return async (url: string): Promise<RemoteDocument> => {
			if (!/^https?:\/\//.test(url)) throw new UnrecoverableError(`Invalid URL: ${url}`);

			{
				if (url in PRELOADED_CONTEXTS) {
					this.logger.debug(`Preload HIT: ${url}`);
					return {
						contextUrl: undefined,
						document: PRELOADED_CONTEXTS[url],
						documentUrl: url,
					};
				}
			}

			this.logger.debug(`Preload MISS: ${url}`);
			const document = await this.fetchDocument(url);
			return {
				contextUrl: undefined,
				document: document,
				documentUrl: url,
			};
		};
	}

	@bindThis
	private async fetchDocument(url: string): Promise<JsonLdObject> {
		const json = await this.httpRequestService.send(
			url,
			{
				headers: {
					Accept: 'application/ld+json, application/json',
				},
			},
			{
				throwErrorWhenResponseNotOk: false,
				validators: [validateContentTypeSetAsJsonLD],
			},
		).then(res => {
			if (!res.ok) {
				throw new StatusError(`failed to fetch JSON-LD from ${url}`, res.status, res.statusText);
			} else {
				return res.json();
			}
		});

		return json as JsonLdObject;
	}

	@bindThis
	public sha256(data: string): string {
		const hash = crypto.createHash('sha256');
		hash.update(data);
		return hash.digest('hex');
	}
}
