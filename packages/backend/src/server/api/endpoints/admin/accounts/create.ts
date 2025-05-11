/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiMeta, UsersRepository } from '@/models/_.js';
import { SignupService } from '@/core/SignupService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { localUsernameSchema, passwordSchema } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { ApiError } from '@/server/api/error.js';
import { Packed } from '@/misc/json-schema.js';
import { RoleService } from '@/core/RoleService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '1fb7cb09-d46a-4fff-b8df-057708cce513',
		},

		wrongInitialPassword: {
			message: 'Initial password is incorrect.',
			code: 'INCORRECT_INITIAL_PASSWORD',
			id: '97147c55-1ae1-4f6f-91d6-e1c3e0e76d62',
		},

		// From ApiCallService.ts
		noCredential: {
			message: 'Credential required.',
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
			httpStatusCode: 401,
		},
		noAdmin: {
			message: 'You are not assigned to an administrator role.',
			code: 'ROLE_PERMISSION_DENIED',
			kind: 'permission',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		},
		noPermission: {
			message: 'Your app does not have the necessary permissions to use this endpoint.',
			code: 'PERMISSION_DENIED',
			kind: 'permission',
			id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'MeDetailed',
		properties: {
			token: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
	},

	// Required token permissions, but we need to check them manually.
	// ApiCallService checks access in a way that would prevent creating the first account.
	softPermissions: [
		'write:admin:account',
		'write:admin:approve-user',
	],
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		username: localUsernameSchema,
		password: passwordSchema,
		setupPassword: { type: 'string', nullable: true },
	},
	required: ['username', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private roleService: RoleService,
		private userEntityService: UserEntityService,
		private signupService: SignupService,
		private readonly moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, _me, token) => {
			const me = _me ? await this.usersRepository.findOneByOrFail({ id: _me.id }) : null;

			if (this.serverSettings.rootUserId == null && me == null && token == null) {
				// 初回セットアップの場合
				if (this.config.setupPassword != null) {
					// 初期パスワードが設定されている場合
					if (ps.setupPassword !== this.config.setupPassword) {
						// 初期パスワードが違う場合
						throw new ApiError(meta.errors.wrongInitialPassword);
					}
				} else if (ps.setupPassword != null && ps.setupPassword.trim() !== '') {
					// 初期パスワードが設定されていないのに初期パスワードが入力された場合
					throw new ApiError(meta.errors.wrongInitialPassword);
				}
			} else {
				if (token && !meta.softPermissions.every(p => token.permission.includes(p))) {
					// Tokens have scoped permissions which may be *less* than the user's official role, so we need to check.
					throw new ApiError(meta.errors.noPermission);
				}

				if (me && !await this.roleService.isAdministrator(me)) {
					// Only administrators (including root) can create users.
					throw new ApiError(meta.errors.noAdmin);
				}

				// Anonymous access is only allowed for initial instance setup (this check may be redundant)
				if (!me && this.serverSettings.rootUserId != null) {
					throw new ApiError(meta.errors.noCredential);
				}
			}

			const { account, secret } = await this.signupService.signup({
				username: ps.username,
				password: ps.password,
				ignorePreservedUsernames: true,
				approved: true,
			});

			if (me) {
				await this.moderationLogService.log(me, 'createAccount', {
					userId: account.id,
					userUsername: account.username,
				});
			}

			const res = await this.userEntityService.pack(account, account, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}) as Packed<'MeDetailed'> & { token: string };

			res.token = secret;

			return res;
		});
	}
}
