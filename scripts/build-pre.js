/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const fs = require('fs');
const packageJsonPath = __dirname + '/../package.json'
const { execFileSync } = require('node:child_process');

function build() {
	let gitVersion;
	try {
		gitVersion = execFileSync('git', ['describe', '--tags'], {
			encoding: 'utf-8',
		});
		gitVersion = gitVersion.trim();
	} catch (e) {
		console.warn("couldn't get git commit details, ignoring",e);
	}

	try {
		const json = fs.readFileSync(packageJsonPath, 'utf-8')
		const meta = JSON.parse(json);
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
