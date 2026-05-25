import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function trackedFiles(): string[] {
	return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

const tracked = trackedFiles();
const forbiddenPattern =
	/(^artifacts\/(runs|tui|run-plans)\/|scenario-public\.json$|scenario-private-checksum\.txt$|trajectory\.jsonl$|state-snapshots\.jsonl$|score-events\.jsonl$|score-report\.json$|live-artifacts\/|^scenario-packs\/(official-hidden|public-dev)\/|^\.pi\/|^docs\/goals\/|^docs\/|^\.env$|\.DS_Store$|^apps\/web\/\.env|^apps\/web\/\.convex\/|^apps\/web\/convex\/)/;

const forbiddenMatches = tracked.filter((path) => forbiddenPattern.test(path));
assert(forbiddenMatches.length === 0, `forbidden tracked paths: ${forbiddenMatches.join(', ')}`);

const trackedArtifacts = tracked.filter((path) => path.startsWith('artifacts/'));
assert(
	trackedArtifacts.length === 1 && trackedArtifacts[0] === 'artifacts/public-results/latest.json',
	`tracked artifacts must be only artifacts/public-results/latest.json; found ${trackedArtifacts.join(', ')}`
);

for (const required of ['LICENSE', 'README.md', 'package.json', 'pnpm-lock.yaml', 'artifacts/public-results/latest.json']) {
	assert(tracked.includes(required), `missing required public file: ${required}`);
}

const examplesDir = join(root, 'scenario-packs/examples/v1.0.0/scenarios');
assert(existsSync(examplesDir), 'missing examples scenario directory');
const exampleCount = readdirSync(examplesDir).filter((name) => name.endsWith('.json')).length;
assert(exampleCount >= 1 && exampleCount <= 3, `expected 1-3 example scenarios, got ${exampleCount}`);

for (const manifestPath of ['package.json', 'apps/web/package.json', 'packages/core/package.json', 'packages/runner/package.json', 'packages/scenario-tools/package.json']) {
	const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
	assert(manifest.license === 'MIT', `${manifestPath} must declare MIT license`);
}

console.log(
	`public release tree validator: ok tracked=${tracked.length} trackedArtifacts=${trackedArtifacts.join(',')} exampleScenarios=${exampleCount}`
);
