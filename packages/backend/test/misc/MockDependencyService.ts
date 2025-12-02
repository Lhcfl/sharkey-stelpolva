/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { DependencyService } from '@/global/DependencyService.js';
import { bindThis } from '@/decorators.js';

/**
 * Extension of DependencyService that allows version information to be mocked.
 */
@Injectable()
export class MockDependencyService extends DependencyService {
	/**
	 * Overrides the version for a dependency.
	 * Pass a string or null to override the version, or pass undefined to clear the override and restore the original value.
	 */
	@bindThis
	public setDependencyVersion(dependency: string, version: string | null | undefined) {
		if (version !== undefined) {
			this.dependencyVersionCache.set(dependency, version);
		} else {
			this.dependencyVersionCache.delete(dependency);
		}
	}

	/**
	 * Resets the mock to initial values.
	 */
	@bindThis
	public mockReset(): void {
		this.dependencyVersionCache.clear();
	}
}
