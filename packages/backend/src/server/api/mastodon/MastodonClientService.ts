/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Misskey } from 'megalodon';
import { Injectable } from '@nestjs/common';
import { MiLocalUser } from '@/models/User.js';
import { AuthenticateService } from '@/server/api/AuthenticateService.js';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class MastodonClientService {
	constructor(
		private readonly authenticateService: AuthenticateService,
	) {}

	/**
	 * Gets the authenticated user and API client for a request.
	 */
	public async getAuthClient(request: FastifyRequest, accessToken?: string | null): Promise<{ client: Misskey, me: MiLocalUser | null }> {
		const authorization = request.headers.authorization;
		accessToken = accessToken !== undefined ? accessToken : getAccessToken(authorization);

		const me = await this.getAuth(request, accessToken);
		const client = this.getClient(request, accessToken);

		return { client, me };
	}

	/**
	 * Gets the authenticated client user for a request.
	 */
	public async getAuth(request: FastifyRequest, accessToken?: string | null): Promise<MiLocalUser | null> {
		const authorization = request.headers.authorization;
		accessToken = accessToken !== undefined ? accessToken : getAccessToken(authorization);
		const [me] = await this.authenticateService.authenticate(accessToken);
		return me;
	}

	/**
	 * Creates an authenticated API client for a request.
	 */
	public getClient(request: FastifyRequest, accessToken?: string | null): Misskey {
		const authorization = request.headers.authorization;
		accessToken = accessToken !== undefined ? accessToken : getAccessToken(authorization);

		// TODO pass agent?
		const baseUrl = this.getBaseUrl(request);
		const userAgent = request.headers['user-agent'];
		return new Misskey(baseUrl, accessToken, userAgent);
	}

	readonly getBaseUrl = getBaseUrl;
}

/**
 * Gets the base URL (origin) of the incoming request
 */
export function getBaseUrl(request: FastifyRequest): string {
	return `${request.protocol}://${request.host}`;
}

/**
 * Extracts the first access token from an authorization header
 * Returns null if none were found.
 */
function getAccessToken(authorization: string | undefined): string | null {
	const accessTokenArr = authorization?.split(' ') ?? [null];
	return accessTokenArr[accessTokenArr.length - 1];
}
