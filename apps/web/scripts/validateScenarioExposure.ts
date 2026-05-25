import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function walkJsonFiles(dir: string, acc: string[] = []): string[] {
	if (!existsSync(dir)) return acc;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walkJsonFiles(path, acc);
		else if (entry.name.endsWith('.json')) acc.push(path);
	}
	return acc;
}

function trackedFiles(): string[] {
	return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

const publicDevJson = walkJsonFiles(`${root}/scenario-packs/public-dev`).filter((path) => path.includes('/scenarios/'));
assert(publicDevJson.length === 0, `public-dev must not expose scenario JSON files: ${publicDevJson.join(', ')}`);

const exampleJson = walkJsonFiles(`${root}/scenario-packs/examples`).filter((path) => path.includes('/scenarios/'));
assert(exampleJson.length >= 1 && exampleJson.length <= 3, `expected 1-3 example scenarios, got ${exampleJson.length}`);

for (const path of exampleJson) {
	const text = readFileSync(path, 'utf8');
	assert(!path.includes('cog_dev_'), `example scenario path must not use official cog_dev prefix: ${path}`);
	assert(text.includes('"visibility": "public_example"'), `example scenario must be marked public_example: ${path}`);
}

const hiddenDir = `${root}/scenario-packs/official-hidden/benchmark-v1/scenarios`;
if (existsSync(hiddenDir)) {
	const hiddenCount = readdirSync(hiddenDir).filter((name) => name.endsWith('.json')).length;
	assert(hiddenCount === 40, `local hidden suite should contain 40 scenarios when present, got ${hiddenCount}`);
}

const examplesManifest = JSON.parse(readFileSync(`${root}/scenario-packs/examples/v1.0.0/manifest.json`, 'utf8'));
assert(examplesManifest.id === 'examples', 'examples manifest id mismatch');
assert(examplesManifest.official === false, 'examples manifest must not be official');
assert(examplesManifest.hidden === false, 'examples manifest must not be hidden');

const tracked = trackedFiles();
const expectedTrackedArtifacts = ['artifacts/public-results/latest.json'];
const trackedArtifacts = tracked.filter((path) => path.startsWith('artifacts/'));
const unexpectedArtifacts = trackedArtifacts.filter((path) => !expectedTrackedArtifacts.includes(path));
assert(unexpectedArtifacts.length === 0, `tracked artifacts must be limited to ${expectedTrackedArtifacts.join(', ')}; found ${unexpectedArtifacts.join(', ')}`);
for (const expected of expectedTrackedArtifacts) assert(tracked.includes(expected), `missing expected tracked public artifact: ${expected}`);

const exposurePattern = /(^artifacts\/(runs|tui|run-plans)\/|scenario-public\.json$|scenario-private-checksum\.txt$|trajectory\.jsonl$|state-snapshots\.jsonl$|score-events\.jsonl$|score-report\.json$|live-artifacts\/|^scenario-packs\/public-dev\/.*\/scenarios\/|^scenario-packs\/official-hidden\/|^apps\/web\/src\/lib\/skatebench\/tuiExecutionSummary\.json$|\.DS_Store$)/;
const exposureMatches = tracked.filter((path) => exposurePattern.test(path));
assert(exposureMatches.length === 0, `tracked scenario/artifact exposure files found: ${exposureMatches.join(', ')}`);

console.log(`scenario exposure validator: ok trackedExamples=${exampleJson.length} publicDevScenarioJson=0 trackedArtifacts=${trackedArtifacts.join(',')}`);
