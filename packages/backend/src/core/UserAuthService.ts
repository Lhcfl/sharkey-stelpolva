/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import { Injectable, Inject } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { equalsConstantTime } from '@/misc/equals-constant-time.js';
import { AuthenticationError } from '@/server/api/AuthenticateService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { CacheService } from '@/core/CacheService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import type Logger from '@/logger.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { UserProfilesRepository } from '@/models/_.js';

@Injectable()
export class UserAuthService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.userProfilesRepository)
		private readonly userProfilesRepository: UserProfilesRepository,

		private readonly cacheService: CacheService,
		private readonly internalEventService: InternalEventService,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('auth');
	}

	/**
	 * @deprecated Use check2FA instead.
	 */
	@bindThis
	public async twoFactorAuthenticate(profile: MiUserProfile, providedToken: string): Promise<void> {
		const isCorrect = await this.check2FA(profile, providedToken);

		if (!isCorrect) {
			throw new AuthenticationError('Authentication failed');
		}
	}

	@bindThis
	public async check2FA(userProfileOrId: MiUserProfile['userId'] | MiUserProfile | null | undefined, providedToken: string | null | undefined): Promise<boolean> {
		const userProfile = typeof (userProfileOrId) === 'string'
			? await this.cacheService.userProfileCache.fetchMaybe(userProfileOrId)
			: userProfileOrId;

		if (userProfile == null) {
			return false;
		}

		// If 2FA is disabled, then providedToken should be empty.
		// Accept if empty/null/undefined, reject if a value is present.
		if (!userProfile.twoFactorEnabled) {
			return !providedToken;
		}

		// If 2FA is enabled, then we must have verification data to proceed.
		if (!userProfile.twoFactorSecret || !providedToken) {
			return false;
		}

		const isCorrect = await this.checkTOTP(userProfile, userProfile.twoFactorSecret, providedToken);
		if (isCorrect) {
			this.logger.info(`2FA authentication succeeded for user ${userProfile.userId}`);
		} else {
			this.logger.info(`2FA authentication failed for user ${userProfile.userId}`);
		}
		return isCorrect;
	}

	@bindThis
	private async checkTOTP(userProfile: MiUserProfile, twoFactorSecret: string, providedToken: string): Promise<boolean> {
		try {
			// Attempt backup secret first
			if (userProfile.twoFactorBackupSecret != null && userProfile.twoFactorBackupSecret.length > 0) {
				if (await this.checkTOTPBackup(userProfile, userProfile.twoFactorBackupSecret, providedToken)) {
					return true;
				}
			}

			// Validate TOTP if input isn't a valid secret
			return await this.checkTOTPSecret(userProfile, twoFactorSecret, providedToken);
		} catch (err) {
			this.logger.error(`Exception thrown during 2FA authentication for user ${userProfile.userId}: ${renderInlineError(err)}`);
			return false;
		}
	}

	@bindThis
	private async checkTOTPBackup(userProfile: MiUserProfile, twoFactorBackupSecret: string[], providedToken: string): Promise<boolean> {
		// Check all backup tokens in constant time to prevent timing attacks
		let isMatch = false;
		for (const backupSecret of twoFactorBackupSecret) {
			isMatch ||= equalsConstantTime(providedToken, backupSecret);
		}

		// Remove backup token after use
		if (isMatch) {
			await this.userProfilesRepository.update({ userId: userProfile.userId }, {
				twoFactorBackupSecret: twoFactorBackupSecret.filter((secret) => secret !== providedToken),
			});
			await this.internalEventService.emit('updateUserProfile', { userId: userProfile.userId, keys: ['twoFactorBackupSecret'] });
		}

		return isMatch;
	}

	@bindThis
	private async checkTOTPSecret(userProfile: MiUserProfile, twoFactorSecret: string, providedToken: string): Promise<boolean> {
		const totpSecret = OTPAuth.Secret.fromBase32(twoFactorSecret);
		const totpDelta = OTPAuth.TOTP.validate({
			secret: totpSecret,
			token: providedToken,
			digits: 6,
			window: 5,
		});

		return totpDelta != null;
	}

	@bindThis
	public async checkPassword(userProfileOrId: MiUserProfile['userId'] | MiUserProfile | null | undefined, providedPassword: string | null | undefined): Promise<boolean> {
		// Validate password before fetching user, to protect against user enumeration attacks.
		if (!providedPassword) {
			return false;
		}

		// Fetch and validate profile to protect against placeholder attacks.
		const userProfile = typeof(userProfileOrId) === 'string'
			? await this.cacheService.userProfileCache.fetchMaybe(userProfileOrId)
			: userProfileOrId;
		if (userProfile == null) {
			return false;
		}
		if (!userProfile.password) {
			return false;
		}

		// Dispatch to correct hash algorithm
		const isCorrect = await this.checkPasswordHash(userProfile, userProfile.password, providedPassword);
		if (isCorrect) {
			this.logger.info(`Password authentication succeeded for user ${userProfile.userId}`);
		} else {
			this.logger.info(`Password authentication failed for user ${userProfile.userId}`);
		}
		return isCorrect;
	}

	@bindThis
	private async checkPasswordHash(userProfile: MiUserProfile, expectedHash: string, providedPassword: string): Promise<boolean> {
		try {
			if (expectedHash.startsWith('$argon2')) {
				return await this.checkArgon2(userProfile, expectedHash, providedPassword);
			} else if (expectedHash.startsWith('$2')) {
				return await this.checkBcrypt(userProfile, expectedHash, providedPassword);
			} else {
				this.logger.warn(`Found unsupported password hash for user ${userProfile.userId} - please check!`);
				return false;
			}
		} catch (err) {
			this.logger.error(`Exception thrown during password authentication for user ${userProfile.userId}: ${renderInlineError(err)}`);
			return false;
		}
	}

	@bindThis
	private async checkArgon2(userProfile: MiUserProfile, expectedHash: string, providedPassword: string): Promise<boolean> {
		return await argon2.verify(expectedHash, providedPassword);
	}

	@bindThis
	private async checkBcrypt(userProfile: MiUserProfile, expectedHash: string, providedPassword: string): Promise<boolean> {
		const isCorrect = await bcrypt.compare(providedPassword, expectedHash);

		// Migrate password
		if (isCorrect) {
			const newHash = await argon2.hash(providedPassword);
			await this.userProfilesRepository.update({ userId: userProfile.userId }, { password: newHash });
			await this.internalEventService.emit('updateUserProfile', { userId: userProfile.userId, keys: ['password'] });
		}

		return isCorrect;
	}

	@bindThis
	public async hashPassword(providedPassword: string): Promise<string> {
		// Validate password
		if (providedPassword.length < 1) {
			throw new IdentifiableError('ea163d99-51a1-45a5-85fb-cc5eec3c2ed5', 'Invalid password - must not be empty');
		}

		// Do not pass a salt - the library generates a secure one automatically!
		return await argon2.hash(providedPassword);
	}
}
