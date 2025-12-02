/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import * as http from 'node:http';
import * as https from 'node:https';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler, NodeHttpHandlerOptions } from '@smithy/node-http-handler';
import type { MiMeta } from '@/models/Meta.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import type { InternalEventTypes } from '@/core/GlobalEventService.js';
import type { DeleteObjectCommandInput, PutObjectCommandInput } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service implements OnApplicationShutdown {
	private client?: S3Client;

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		private httpRequestService: HttpRequestService,
		private readonly internalEventService: InternalEventService,
	) {
		this.internalEventService.on('metaUpdated', this.onMetaUpdated);
	}

	@bindThis
	private onMetaUpdated(body: InternalEventTypes['metaUpdated']): void {
		if (this.needsChange(body.before, body.after)) {
			this.disposeClient();
			this.client = this.createS3Client(body.after);
		}
	}

	private needsChange(before: MiMeta | undefined, after: MiMeta): boolean {
		if (before == null) return true;
		if (before.objectStorageEndpoint !== after.objectStorageEndpoint) return true;
		if (before.objectStorageUseSSL !== after.objectStorageUseSSL) return true;
		if (before.objectStorageUseProxy !== after.objectStorageUseProxy) return true;
		if (before.objectStorageAccessKey !== after.objectStorageAccessKey) return true;
		if (before.objectStorageSecretKey !== after.objectStorageSecretKey) return true;
		if (before.objectStorageRegion !== after.objectStorageRegion) return true;
		if (before.objectStorageUseSSL !== after.objectStorageUseSSL) return true;
		if (before.objectStorageS3ForcePathStyle !== after.objectStorageS3ForcePathStyle) return true;
		if (before.objectStorageRegion !== after.objectStorageRegion) return true;
		return false;
	}

	@bindThis
	private getS3Client(): S3Client {
		return this.client ??= this.createS3Client(this.meta);
	}

	@bindThis
	private createS3Client(meta: MiMeta): S3Client {
		const u = meta.objectStorageEndpoint
			? `${meta.objectStorageUseSSL ? 'https' : 'http'}://${meta.objectStorageEndpoint}`
			: `${meta.objectStorageUseSSL ? 'https' : 'http'}://example.net`; // dummy url to select http(s) agent

		const agent = this.httpRequestService.getAgentByUrl(new URL(u), !meta.objectStorageUseProxy, true);
		const handlerOption: NodeHttpHandlerOptions = {};
		if (meta.objectStorageUseSSL) {
			handlerOption.httpsAgent = agent as https.Agent;
		} else {
			handlerOption.httpAgent = agent as http.Agent;
		}

		return new S3Client({
			endpoint: meta.objectStorageEndpoint ? u : undefined,
			credentials: (meta.objectStorageAccessKey !== null && meta.objectStorageSecretKey !== null) ? {
				accessKeyId: meta.objectStorageAccessKey,
				secretAccessKey: meta.objectStorageSecretKey,
			} : undefined,
			region: meta.objectStorageRegion ? meta.objectStorageRegion : undefined, // 空文字列もundefinedにするため ?? は使わない
			tls: meta.objectStorageUseSSL,
			forcePathStyle: meta.objectStorageEndpoint ? meta.objectStorageS3ForcePathStyle : false, // AWS with endPoint omitted
			requestHandler: new NodeHttpHandler(handlerOption),
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
	}

	@bindThis
	public async upload(input: PutObjectCommandInput) {
		const client = this.getS3Client();
		return await new Upload({
			client,
			params: input,
			partSize: (client.config.endpoint && (await client.config.endpoint()).hostname === 'storage.googleapis.com')
				? 500 * 1024 * 1024
				: 8 * 1024 * 1024,
		}).done();
	}

	@bindThis
	public delete(input: DeleteObjectCommandInput) {
		const client = this.getS3Client();
		return client.send(new DeleteObjectCommand(input));
	}

	@bindThis
	private disposeClient(): void {
		if (this.client) {
			this.client.destroy();
			this.client = undefined;
		}
	}

	@bindThis
	private dispose(): void {
		this.disposeClient();
		this.internalEventService.off('metaUpdated', this.onMetaUpdated);
	}

	@bindThis
	onApplicationShutdown() {
		this.dispose();
	}
}
