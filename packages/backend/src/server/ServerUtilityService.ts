/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import querystring from 'querystring';
import multipart from '@fastify/multipart';
import { Inject, Injectable } from '@nestjs/common';
import { FastifyInstance } from 'fastify';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { saveToTempFile } from '@/misc/create-temp.js';

@Injectable()
export class ServerUtilityService {
	constructor(
		@Inject(DI.config)
		private readonly config: Config,
	) {}

	public addMultipartFormDataContentType(fastify: FastifyInstance): void {
		fastify.register(multipart, {
			limits: {
				fileSize: this.config.maxFileSize,
				files: 1,
			},
		});

		// Default behavior saves files to memory - we don't want that!
		// Store to temporary file instead, and copy the body fields while we're at it.
		fastify.addHook<{ Body?: Record<string, string | string[] | undefined> }>('preValidation', async request => {
			if (request.isMultipart()) {
				// We can't use saveRequestFiles() because it erases all the data fields.
				// Instead, recreate it manually.
				// https://github.com/fastify/fastify-multipart/issues/549

				for await (const part of request.parts()) {
					if (part.type === 'field') {
						const k = part.fieldname;
						const v = part.value;
						const body = request.body ??= {};

						// Value can be string, buffer, or undefined.
						// We only support the first one.
						if (typeof(v) !== 'string') continue;

						// This is just progressive conversion from undefined -> string -> string[]
						if (!body[k]) {
							body[k] = v;
						} else if (Array.isArray(body[k])) {
							body[k].push(v);
						} else {
							body[k] = [body[k], v];
						}
					} else { // Otherwise it's a file
						try {
							const [filepath] = await saveToTempFile(part.file);

							const tmpUploads = (request.tmpUploads ??= []);
							tmpUploads.push(filepath);

							const requestSavedFiles = (request.savedRequestFiles ??= []);
							requestSavedFiles.push({
								...part,
								filepath,
							});
						} catch (e) {
							// Cleanup to avoid file leak in case of errors
							await request.cleanRequestFiles();
							request.tmpUploads = null;
							request.savedRequestFiles = null;
							throw e;
						}
					}
				}
			}
		});
	}

	public addFormUrlEncodedContentType(fastify: FastifyInstance) {
		fastify.addContentTypeParser('application/x-www-form-urlencoded', (_, payload, done) => {
			let body = '';
			payload.on('data', (data) => {
				body += data;
			});
			payload.on('end', () => {
				try {
					const parsed = querystring.parse(body);
					done(null, parsed);
				} catch (e) {
					done(e as Error);
				}
			});
			payload.on('error', done);
		});
	}

	public addCORS(fastify: FastifyInstance) {
		fastify.addHook('preHandler', (_, reply, done) => {
			// Allow web-based clients to connect from other origins.
			reply.header('Access-Control-Allow-Origin', '*');

			// Mastodon uses all types of request methods.
			reply.header('Access-Control-Allow-Methods', '*');

			// Allow web-based clients to access Link header - required for mastodon pagination.
			// https://stackoverflow.com/a/54928828
			// https://docs.joinmastodon.org/api/guidelines/#pagination
			// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers
			reply.header('Access-Control-Expose-Headers', 'Link');

			// Cache to avoid extra pre-flight requests
			// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Max-Age
			reply.header('Access-Control-Max-Age', 60 * 60 * 24); // 1 day in seconds

			done();
		});
	}

	public addFlattenedQueryType(fastify: FastifyInstance) {
		// Remove trailing "[]" from query params
		fastify.addHook<{ Querystring?: Record<string, string | string[] | undefined> }>('preValidation', (request, _reply, done) => {
			if (!request.query || typeof(request.query) !== 'object') {
				return done();
			}

			for (const key of Object.keys(request.query)) {
				if (!key.endsWith('[]')) {
					continue;
				}
				if (request.query[key] == null) {
					continue;
				}

				const newKey = key.substring(0, key.length - 2);
				const newValue = request.query[key];
				const oldValue = request.query[newKey];

				// Move the value to the correct key
				if (oldValue != null) {
					if (Array.isArray(oldValue)) {
						// Works for both array and single values
						request.query[newKey] = oldValue.concat(newValue);
					} else if (Array.isArray(newValue)) {
						// Preserve order
						request.query[newKey] = [oldValue, ...newValue];
					} else {
						// Preserve order
						request.query[newKey] = [oldValue, newValue];
					}
				} else {
					request.query[newKey] = newValue;
				}

				// Remove the invalid key
				delete request.query[key];
			}

			return done();
		});
	}
}
