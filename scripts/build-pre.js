/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const fs = require('fs');
const packageJsonPath = __dirname + '/../package.json'
const { execFileSync } = require('node:child_process');

function callGit(args) {
	return execFileSync('git', args, {
		encoding: 'utf-8',
	}).trim();
}

function getGitVersion(versionFromPackageJson) {
	const thisTag = callGit(['tag', '--points-at', 'HEAD']);
	if (thisTag) {
		// we're building from a tag, we don't care about extra details
		return null;
	}

	const commitId = callGit(['rev-parse', '--short', 'HEAD']);
	return `${versionFromPackageJson}+g${commitId}`;
}

function build() {
	try {
		const json = fs.readFileSync(packageJsonPath, 'utf-8')
		const meta = JSON.parse(json);

		let gitVersion;
		try {
			gitVersion = getGitVersion(meta.version);
		} catch (e) {
			console.warn("couldn't get git commit details, ignoring",e);
		}

		fs.mkdirSync(__dirname + '/../built', { recursive: true });
		fs.writeFileSync(__dirname + '/../built/meta.json', JSON.stringify({ version: meta.version, gitVersion }), 'utf-8');
	} catch (e) {
		console.error(e)
	}
}

build();

if (process.argv.includes("--watch")) {
	fs.watch(packageJsonPath, (event, filename) => {
		console.log(`update ${filename} ...`)
		build()
	})
}
