import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { buildVisualizerSnapshot } from '../src/lib/skatebench/visualizerData.ts';

const artifactPath = new URL('../../../artifacts/public-results/latest.json', import.meta.url);
const staticPath = new URL('../static/results/latest.json', import.meta.url);
const tuiPath = new URL('../../../packages/runner/src/tui/cogContainTui.ts', import.meta.url);
const webPackagePath = new URL('../package.json', import.meta.url);
const runnerPackagePath = new URL('../../../packages/runner/package.json', import.meta.url);
const rootPackagePath = new URL('../../../package.json', import.meta.url);
const deployWorkflowPath = new URL('../../../.github/workflows/deploy-pages.yml', import.meta.url);
const gitignorePath = new URL('../../../.gitignore', import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function readText(url: URL): string {
	return readFileSync(url, 'utf8');
}

const webPkg = JSON.parse(readText(webPackagePath)) as { scripts?: Record<string, string> };
const runnerPkg = JSON.parse(readText(runnerPackagePath)) as { scripts?: Record<string, string> };
const rootPkg = JSON.parse(readText(rootPackagePath)) as { scripts?: Record<string, string> };
const tuiSource = readText(tuiPath);
const gitignore = readText(gitignorePath);

assert(webPkg.scripts?.dev?.includes('prepare-local-site'), 'dev must run prepare-local-site');
assert(webPkg.scripts?.build?.includes('prepare-local-site'), 'build must run prepare-local-site');
assert(webPkg.scripts?.['build:public-site']?.includes('prepare-public-site'), 'build:public-site must run prepare-public-site');
assert(!webPkg.scripts?.dev?.includes('prepare-public-site'), 'dev must not run prepare-public-site');
assert(!webPkg.scripts?.build?.includes('prepare-public-site'), 'default build must not run prepare-public-site');

assert(tuiSource.includes('artifacts/local-results/latest.json'), 'runner must write local results by default');
assert(tuiSource.includes('--sync-published-results'), 'runner must expose publish flag');
assert(tuiSource.includes('--confirm-publish-results'), 'runner must expose publish confirmation flag');
assert(tuiSource.includes('shouldSyncPublishedResults'), 'runner must gate published sync behind explicit flags');
assert(!tuiSource.includes('syncPublic = true'), 'runner must not default to public sync');

assert(gitignore.includes('artifacts/local-results/'), 'local results path must be gitignored');
assert(gitignore.includes('apps/web/static/results/latest.json'), 'generated static result must be gitignored');

for (const [label, pkg] of [
	['apps/web/package.json', webPkg],
	['packages/runner/package.json', runnerPkg],
	['package.json', rootPkg]
] as const) {
	for (const [scriptName, script] of Object.entries(pkg.scripts ?? {})) {
		assert(!script.includes('--allow-live-provider-call'), `${label} script ${scriptName} must not include live allow flag`);
		assert(!script.includes('--confirm-live-smoke'), `${label} script ${scriptName} must not include live confirm flag`);
		assert(!script.includes('--confirm-publish-results'), `${label} script ${scriptName} must not include publish confirm flag by default`);
		assert(!script.includes('--sync-published-results'), `${label} script ${scriptName} must not include publish sync flag by default`);
	}
}

if (existsSync(deployWorkflowPath)) {
	const workflow = readText(deployWorkflowPath);
	assert(workflow.includes('build:public-site'), 'deploy workflow must build public site');
	assert(!workflow.includes('prepare-local-site'), 'deploy workflow must not use local prepare');
	assert(!workflow.includes('--allow-live-provider-call'), 'deploy workflow must not include live allow flag');
	assert(!workflow.includes('--confirm-live-smoke'), 'deploy workflow must not include live confirm flag');
	assert(!workflow.includes('OPENAI_API_KEY'), 'deploy workflow must not reference provider secrets');
}

if (existsSync(staticPath)) {
	const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
	const staticCopy = JSON.parse(await readFile(staticPath, 'utf8'));
	if (JSON.stringify(artifact) === JSON.stringify(staticCopy)) {
		const { visualizerSnapshot } = buildVisualizerSnapshot(staticCopy);
		assert(visualizerSnapshot.metadata.staticResultPath === '/results/latest.json', 'visualizer must reference static result path');
	}
}

console.log('result isolation validator: ok local/public separation enforced publishFlagsRequired=true');
