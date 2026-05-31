#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import nodePath from 'node:path';
import nodeFs from 'node:fs/promises';

/*
 * Configuration
 */

/**
 * Filename patterns to exclude.
 */
const excludedPaths: RegExp[] = [
	/\/node_modules\//,
	/\/(js_)?built\//i,
	/\/temp\//i,
];

/**
 * Keys containing dependency lists within a package.json file.
 */
const dependencyProps: DepType[] = [
	'overrides',
	'resolutions',
	'peerDependencies',
	'optionalDependencies',
	'devDependencies',
	'dependencies',
];

// TODO implement overrides from pnpm-workspace
// /**
//  * PNPM workspace file to source configuration.
//  */
// const pnpmWorkspace = 'pnpm-workspace.yml';

/*
 * Main Code
 */

/**
 * Root directory of the repository.
 */
const rootDir: string = nodePath.resolve(import.meta.dirname, '..');

/**
 * All packages located in the solution
 */
const packages: Package[] = await loadPackages();

/**
 * All packages defined in the solution
 */
const dependencies = mapDependencies(packages);
const allDependencies = dependencies.values().toArray();
const allDependenciesWithDifference = allDependencies.filter(d => d.hasDifference);

console.log(`Found ${allDependenciesWithDifference.length} mismatched dependencies (out of ${allDependencies.length} total) from ${packages.length} packages.`);

if (allDependenciesWithDifference.length > 0) {
	await syncDependencies(allDependenciesWithDifference);
	console.log('package.json files have changed. Please run "pnpm i" to update the pnpm-lock.yaml, then verify that everything still works.');
}

async function loadPackages() {
	const packages: Package[] = [];

	const loadPackagesFrom = async (dir: string): Promise<void> => {
		const files = await nodeFs.readdir(dir, { withFileTypes: true });

		for (const entry of files) {
			const path = nodePath.join(dir, entry.name);

			// Check for filtered paths
			let filterPath = path.replaceAll(nodePath.sep, '/');
			if (entry.isDirectory()) {
				filterPath += '/';
			}
			if (excludedPaths.some(p => p.test(filterPath))) {
				//console.debug(`Skipping excluded path ${path}`);
				continue;
			}

			if (entry.isDirectory()) {
				await loadPackagesFrom(path);
				continue;
			}

			if (entry.isFile() && entry.name === 'package.json') {
				try {
					const packageText = await nodeFs.readFile(path, { encoding: 'utf-8' });
					const packageJson = JSON.parse(packageText);

					// Handle duplicate package names
					let packageName = packageJson.name || nodePath.basename(dir);
					if (packages.some(p => p.name === packageName)) {
						let i = 1;
						while (packages.some(p => p.name === `${packageName}:${i}`)) {
							i++;
						}
						packageName = `${packageName}:${i}`;
					}

					// Parse dependencies from all defined sections
					const groups: Record<string, Dependency[]> = {};
					for (const type of dependencyProps) {
						groups[type] = parseDependencies(packageName, packageJson, type);
					}

					// Flatten sections into final list
					const dependencies = mergeDependencies(packageName, groups);
					if (dependencies.length > 0) {
						console.info(`Loaded ${dependencies.length} dependencies from ${packageName}`);
					} else {
						// console.debug(`Loaded no dependencies from ${packageName}`);
					}

					// Record this package.json file
					packages.push({
						name: packageName,
						json: packageJson,
						path,
						dependencies,
					});
				} catch (err) {
					console.warn(`Error reading package from ${path}:`, err);
				}
			}
		}
	};

	await loadPackagesFrom(rootDir);
	return packages;
}

function mergeDependencies(packageName: string, dependencyGroups: Record<DepType, Dependency[]>): Dependency[] {
	const dependencies: Dependency[] = [];

	for (const type of Object.keys(dependencyGroups)) {
		const typeDependencies: Dependency[] = dependencyGroups[type];
		for (const dependency of typeDependencies) {
			const existing = dependencies.find(d => d.name === dependency.name);
			if (existing) {
				console.warn(`[${packageName}/${type}/${dependency.name}] Skipping duplicate dependency (was already defined in ${existing.type})`);
			} else {
				dependencies.push(dependency);
			}
		}
	}

	return dependencies;
}

function parseDependencies(packageName: string, packageJson: Record<DepType, unknown>, type: DepType): Dependency[] {
	const dependencies: Dependency[] = [];

	// Make sure we actually have this type
	if (typeof(packageJson[type]) === 'object' && packageJson[type] != null) {
		for (const [name, npmVersion] of Object.entries(packageJson[type])) {
			const version = parseVersionString(packageName, type, name, npmVersion);
			if (version != null) {
				dependencies.push({
					name,
					type,
					version,
					npmVersion,
				});
			}
		}
	}

	return dependencies;
}

function parseVersionString(packageName: string, depType: DepType, depName: string, rawVersion: unknown): DepVersion | null {
	if (typeof(rawVersion) !== 'string') {
		console.warn(`[${packageName}/${depType}/${depName}] Skipping version string "${rawVersion}" - incorrect type ${typeof(rawVersion)}`);
		return null;
	}

	let versionString: string = rawVersion;

	if (versionString.startsWith('npm:') || versionString.startsWith('workspace:')) {
		//console.warn(`[${packageName}/${depType}/${depName}] Skipping version string "${versionString}" - package redirects are not supported`);
		return null;
	}

	if (versionString.startsWith('github:') || versionString.startsWith('http:') || versionString.startsWith('https:')) {
		//console.warn(`[${packageName}/${depType}/${depName}] Skipping version string "${versionString}" - external packages are not supported`);
		return null;
	}

	if (versionString === '') {
		versionString = '*';
	} else if (versionString === 'latest') {
		versionString = '*';
	} else if (versionString === 'next') {
		versionString = '*';
	} else {
		versionString = versionString.replaceAll(/(\b|^)[x*]+(\b|$)/g, '*');
	}

	const versionMatch = versionString.match(/^([\^<>~=]*)((\d+|\*)(\.(\d+|\*)+)*)(\b|$|[-+])/);
	if (!versionMatch) {
		console.warn(`[${packageName}/${depType}/${depName}] Skipping version string "${versionString}" - not in a parseable format`);
		return null;
	}

	const upgradePrefix = versionMatch[1];
	const primaryVersion = versionMatch[2];

	// Parse the primary version (x.y.z)
	/* @ts-expect-error validated by the Regex prior, but TS doesn't know that */
	const parsedVersion: DepVersion = primaryVersion
		.split('.')
		.map(p => p === '*' ? '*' : parseInt(p));

	// Parse the upgrade prefix
	if (upgradePrefix === '>' || upgradePrefix === '>=') {
		parsedVersion.push('*');
	} else if (upgradePrefix === '~') {
		// "Allows patch-level changes if a minor version is specified on the comparator. Allows minor-level changes if not."
		// https://github.com/npm/node-semver#versions
		const start = parsedVersion.length > 2 ? 2 : 1;
		for (let i = start; i < parsedVersion.length; i++) {
			parsedVersion[i] = '*';
		}
	} else if (upgradePrefix === '^') {
		// "Allows changes that do not modify the left-most non-zero element in the [major, minor, patch] tuple."
		// https://github.com/npm/node-semver#versions
		for (let i = 1; i < parsedVersion.length; i++) {
			parsedVersion[i] = '*';
		}
	}

	// Collapse x.*.z to just x.*
	const firstStarIdx = parsedVersion.indexOf('*');
	if (firstStarIdx >= 0) {
		parsedVersion.length = firstStarIdx + 1;
	}

	return parsedVersion;
}

function mapDependencies(packages: Package[]): Map<string, MappedDependency> {
	const mappedDependencies = new Map<string, MappedDependency>();

	for (const pkg of packages) {
		for (const dependency of pkg.dependencies) {
			const packageDependency = { package: pkg, packageDependency: dependency };

			let mapping = mappedDependencies.get(dependency.name);
			if (!mapping) {
				mapping = {
					name: dependency.name,
					newestVersion: dependency.version,
					newestNpmVersion: dependency.npmVersion,
					hasDifference: false,
					packages: [packageDependency],
				};
				mappedDependencies.set(dependency.name, mapping);
			} else {
				if (dependency.npmVersion !== mapping.newestNpmVersion) {
					mapping.hasDifference = true;

					if (isNewer(dependency.version, mapping.newestVersion)) {
						mapping.newestVersion = dependency.version;
						mapping.newestNpmVersion = dependency.npmVersion;
					}
				}

				mapping.packages.push(packageDependency);
			}
		}
	}

	return mappedDependencies;
}

function isNewer(a: DepVersion, b: DepVersion): boolean {
	return compareVersions(a, b) > 0;
}

/**
 * -1 => a is older / b is newer
 * 0 => same age
 * 1 => a is newer / b is older
 */
function compareVersions(a: DepVersion, b: DepVersion): -1 | 0 | 1 {
	const limit = Math.max(a.length, b.length);

	// Check each part (x.y.z and so on)
	for (let i = 0; i < limit; i++) {
		const aPart = a[i] ?? '*';
		const bPart = b[i] ?? '*';

		if (aPart === '*') {
			if (bPart !== '*') {
				// A matches any and B has a limit, therefore A is newer
				return 1;
			}
		} else if (bPart === '*') {
			// A has a limit and B matches any, therefore B is newer
			return -1;
		} else if (aPart !== bPart) {
			if (aPart > bPart) {
				// A has a limit and B has a lower limit, therefore A is newer
				return 1;
			} else {
				// A has a limit and B has a higher limit, therefore B is newer
				return -1;
			}
		}
	}

	// If parseable versions match, then consider them the same.
	return 0;
}

async function syncDependencies(dependencies: MappedDependency[]): Promise<void> {
	const modifiedPackages: Map<string, Package> = new Map();

	for (const dependency of dependencies) {
		for (const pkg of dependency.packages) {
			if (dependency.newestNpmVersion !== pkg.packageDependency.npmVersion) {
				console.log(`Updating ${dependency.name} from version ${pkg.packageDependency.npmVersion} to ${dependency.newestNpmVersion} in package ${pkg.package.name}`);
				pkg.package.json[pkg.packageDependency.type][dependency.name] = dependency.newestNpmVersion;
				modifiedPackages.set(pkg.package.name, pkg.package);
			}
		}
	}

	for (const pkg of modifiedPackages.values()) {
		const packageText = JSON.stringify(pkg.json, null, '\t');
		await nodeFs.writeFile(pkg.path, packageText, 'utf-8');
	}
}

interface Package {
	name: string;
	path: string;
	json: object;
	dependencies: Dependency[];
}

interface Dependency {
	name: string;
	type: DepType;
	version: DepVersion;
	npmVersion: string;
}

type DepType =
	'dependencies'
	| 'devDependencies'
	| 'optionalDependencies'
	| 'peerDependencies'
	| 'resolutions'
	| 'overrides';
type DepVersion = [DepPart, ...DepPart[]];
type DepPart = number | '*';

interface MappedDependency {
	name: string;
	newestVersion: DepVersion;
	newestNpmVersion: string;
	hasDifference: boolean;
	packages: { package: Package; packageDependency: Dependency; }[];
}

