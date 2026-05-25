import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { buildPublicSiteSnapshot } from '../src/lib/skatebench/visualizerData.ts';

const staticPath = new URL('../static/results/latest.json', import.meta.url);
const siteSnapshotModule = await import('../src/lib/skatebench/siteResultSnapshot.ts');

if (!existsSync(staticPath)) throw new Error('missing static/results/latest.json; run prepare-public-site first');

const artifact = JSON.parse(await readFile(staticPath, 'utf8')) as Parameters<typeof buildPublicSiteSnapshot>[0];
const expected = buildPublicSiteSnapshot(artifact);
const actual = siteSnapshotModule.publicSiteSnapshot;

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
	throw new Error('siteResultSnapshot.ts is stale; rerun pnpm --dir apps/web run prepare-public-site');
}

const twoRowRequiredModels = [
	{ provider: 'openai', model: 'gpt-5.5' },
	{ provider: 'openrouter', model: 'anthropic/claude-opus-4.7' }
] as const;

const fourRowRequiredModels = [
	...twoRowRequiredModels,
	{ provider: 'openai', model: 'gpt-5.4-mini' },
	{ provider: 'openai', model: 'gpt-5.4-nano' }
] as const;

const requiredModels =
	actual.results.length >= fourRowRequiredModels.length ? fourRowRequiredModels : twoRowRequiredModels;

for (const required of requiredModels) {
	const row = actual.results.find((result) => result.provider === required.provider && result.model === required.model);
	if (row === undefined) {
		throw new Error(`site snapshot missing required model row ${required.provider}:${required.model}`);
	}
	if (row.thinkingLevel !== 'xhigh' || row.providerThinkingEffort !== 'xhigh') {
		throw new Error(`${required.provider}:${required.model} must expose xhigh thinking metadata in site snapshot`);
	}
}

const gemini = actual.results.find(
	(result) => result.provider === 'openrouter' && result.model === 'google/gemini-3.5-flash'
);
if (gemini !== undefined && (gemini.thinkingLevel !== 'high' || gemini.providerThinkingEffort !== 'high')) {
	throw new Error('Gemini 3.5 Flash row must expose high thinking metadata in site snapshot');
}

console.log('site result snapshot validator: ok snapshotSynced=true requiredModelsPresent=true');
