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

const requiredModels = [
	{ provider: 'openai', model: 'gpt-5.5' },
	{ provider: 'openrouter', model: 'anthropic/claude-opus-4.7' }
];

for (const required of requiredModels) {
	const row = actual.results.find((result) => result.provider === required.provider && result.model === required.model);
	if (row === undefined) {
		throw new Error(`site snapshot missing required model row ${required.provider}:${required.model}`);
	}
}

const gpt = actual.results.find((result) => result.provider === 'openai' && result.model === 'gpt-5.5');
if (gpt?.thinkingLevel !== 'xhigh' || gpt?.providerThinkingEffort !== 'xhigh') {
	throw new Error('GPT 5.5 row must expose xhigh thinking metadata in site snapshot');
}

const opus = actual.results.find((result) => result.provider === 'openrouter' && result.model === 'anthropic/claude-opus-4.7');
if (opus?.thinkingLevel !== 'xhigh' || opus?.providerThinkingEffort !== 'xhigh') {
	throw new Error('Opus 4.7 row must expose max-tier xhigh thinking metadata in site snapshot');
}

console.log('site result snapshot validator: ok snapshotSynced=true requiredModelsPresent=true');
