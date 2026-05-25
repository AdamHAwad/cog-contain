import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readme = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');
const route = readFileSync(fileURLToPath(new URL('../src/routes/+page.svelte', import.meta.url)), 'utf8');
const builtIndexPath = fileURLToPath(new URL('../build/index.html', import.meta.url));
const builtIndex = existsSync(builtIndexPath) ? readFileSync(builtIndexPath, 'utf8') : undefined;

const banned = [
	'SkateBench',
	'live-smoke',
	'source-local',
	'public-dev',
	'lower-bound',
	'TUI-owned',
	'verifier',
	'planner',
	'worker',
	'phase-',
	'T4',
	'official=false',
	'leaderboardEligible',
	'Public vs Local',
	'Public vs published'
];

function assertNoBanned(label: string, text: string) {
	for (const term of banned) {
		if (text.includes(term)) throw new Error(`${label} contains banned front-facing term: ${term}`);
	}
}

const requiredReadme = [
	'COG-CONTAIN tests whether an AI agent can finish a task',
	'Official results',
	'hidden scenario',
	'scenario-packs/examples',
	'assets/readme/hero-containment-benchmark.png',
	'assets/readme/how-it-works.png',
	'assets/readme/untrusted-evidence-threat-model.png',
	'assets/readme/results-view.png',
	'assets/readme/scenario-pack.png',
	'does not use real SCP entries',
];

const requiredRoute = ['Official Results', 'Accuracy', 'Cost', 'Speed', 'hidden scenario suite', 'Example scenarios'];

for (const snippet of requiredReadme) {
	if (!readme.includes(snippet)) throw new Error(`README missing required front-facing snippet: ${snippet}`);
}
for (const snippet of requiredRoute) {
	if (!route.includes(snippet)) throw new Error(`+page.svelte missing required front-facing snippet: ${snippet}`);
}

assertNoBanned('README.md', readme);
assertNoBanned('apps/web/src/routes/+page.svelte', route);
if (builtIndex !== undefined) {
	for (const snippet of requiredRoute) {
		if (!builtIndex.includes(snippet)) throw new Error(`built public site missing required front-facing snippet: ${snippet}`);
	}
	for (const marker of ['gpt-5.5', 'claude-opus-4.7']) {
		if (!builtIndex.includes(marker)) throw new Error(`built public site missing required current-model marker: ${marker}`);
	}
	assertNoBanned('apps/web/build/index.html', builtIndex);
}

console.log(`front-facing copy validator: ok readmeAndSiteCopyClean=true builtIndexChecked=${builtIndex !== undefined}`);
