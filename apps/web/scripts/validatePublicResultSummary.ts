import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { buildVisualizerSnapshot } from '../src/lib/skatebench/visualizerData.ts';

const artifactPath = new URL('../../../artifacts/public-results/latest.json', import.meta.url);
const staticPath = new URL('../static/results/latest.json', import.meta.url);
for (const path of [artifactPath, staticPath]) if (!existsSync(path)) throw new Error(`missing public result copy ${path.pathname}`);
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
const staticCopy = JSON.parse(await readFile(staticPath, 'utf8'));
if (JSON.stringify(artifact) !== JSON.stringify(staticCopy)) throw new Error('static public result is not synchronized with published source');
if (artifact.kind !== 'cog-contain-public-result-summary') throw new Error('unexpected public result kind');
if (artifact.schemaVersion !== 1) throw new Error('unexpected public result schemaVersion');
if (!['mock-matrix', 'live-smoke'].includes(artifact.sourceMode)) throw new Error('public result sourceMode must be mock-matrix or live-smoke');
if (artifact.hiddenEvalAccess !== false || artifact.official !== true || artifact.leaderboardEligible !== false) throw new Error('published official result flags invalid');
if (!artifact.liveCapable) throw new Error('published result should advertise live-capable foundation');
if (!artifact.strictCaps || artifact.strictCaps.maxSteps > 3 || artifact.strictCaps.maxOutputTokens > 256 || artifact.strictCaps.timeoutMs > 60000 || artifact.strictCaps.retryCount !== 0) throw new Error('strict caps invalid');
if (!Array.isArray(artifact.modelResults) || artifact.modelResults.length < 1) throw new Error('public result requires modelResults');
if (!artifact.caveats?.some((caveat: string) => caveat.toLowerCase().includes('hidden'))) throw new Error('official public result must mention hidden scenarios');
if (!artifact.caveats?.some((caveat: string) => caveat.includes('metricSupport') || caveat.toLowerCase().includes('accuracy, cost, and speed'))) throw new Error('official public result must gate metrics appropriately');
const { visualizerSnapshot, visualizerSourceSummary } = buildVisualizerSnapshot(artifact);
if (visualizerSourceSummary.kind !== artifact.kind) throw new Error('visualizer source summary mismatch');
if (visualizerSnapshot.metadata.runCount !== artifact.runCount) throw new Error('visualizer run count mismatch');
if (visualizerSnapshot.metadata.official !== true) throw new Error('visualizer metadata must reflect official published results');
if (visualizerSnapshot.metadata.dataLabel !== 'Official Results') throw new Error('visualizer data label must be Official Results');
if (visualizerSnapshot.metadata.sourceSummaryPath !== artifact.sourceSummaryPath) throw new Error('visualizer source path mismatch');
const text = JSON.stringify(artifact);
for (const marker of ['raw transcript', 'provider payload', 'tool arguments', 'BEGIN PRIVATE KEY', 'data:image/', 'base64,']) {
	if (text.includes(marker)) throw new Error(`unsafe public result marker found: ${marker}`);
}
if (/sk-[A-Za-z0-9_-]{8,}/.test(text)) throw new Error('secret-like token found in public result');
console.log(`public result summary validator: ok sourceMode=${artifact.sourceMode} runs=${artifact.runCount} official=true staticSynced=true`);
