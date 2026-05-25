import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const summaryPath = 'artifacts/tui/phase-62-mock-run/summary.json';
const publicResultPath = 'artifacts/public-results/latest.json';
if (!existsSync(summaryPath)) throw new Error('missing TUI mock summary');
const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
if (summary.mode !== 'mock-matrix') throw new Error('expected mock-matrix mode');
if (summary.status !== 'pass') throw new Error('expected pass status');
if (!String(summary.pack).startsWith('examples@')) throw new Error(`expected example pack mock summary, got ${summary.pack}`);
if (summary.liveCalls !== false || summary.envRead !== false || summary.hiddenEvalAccess !== false) throw new Error('unsafe execution boundary flags');
if (summary.official !== false || summary.leaderboardEligible !== false || summary.fullLowerBoundRunExecuted !== false) throw new Error('forbidden claim flag');
if (summary.scenarioCount < 1 || summary.runCount !== summary.scenarioCount || summary.completedCount !== summary.runCount) throw new Error('run counts are inconsistent');
if (!Array.isArray(summary.modelResults) || summary.modelResults.length !== 1) throw new Error('expected one mock profile result');
if (summary.modelResults[0].provider !== 'mock' || summary.modelResults[0].metricSupport?.cost !== 'unsupported') throw new Error('mock result must be unsupported-cost mock provider');
if (existsSync(publicResultPath)) {
	const publicResult = JSON.parse(await readFile(publicResultPath, 'utf8'));
	if (publicResult.official !== true || publicResult.hiddenEvalAccess !== false) throw new Error('published public result must remain sanitized official aggregate data');
	if (publicResult.sourceMode === 'mock-matrix') throw new Error('example mock QA must not overwrite published official result data');
}
const text = JSON.stringify(summary);
for (const marker of ['raw transcript', 'provider payload', 'BEGIN PRIVATE KEY', 'data:image/', 'base64,']) {
	if (text.includes(marker)) throw new Error(`unsafe marker found: ${marker}`);
}
if (/sk-[A-Za-z0-9_-]{8,}/.test(text)) throw new Error('secret-like sk token found');
console.log(`TUI mock matrix summary: ok pack=${summary.pack} runs=${summary.runCount} model=${summary.modelResults[0].model} noLiveRegression=true`);
