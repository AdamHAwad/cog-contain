import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { buildVisualizerSnapshot } from '../src/lib/skatebench/visualizerData.ts';

const artifactPath = new URL('../../../artifacts/public-results/latest.json', import.meta.url);
const mockSummaryPath = new URL('../../../artifacts/tui/phase-62-mock-run/summary.json', import.meta.url);
if (!existsSync(artifactPath)) throw new Error('missing public result artifact');
const publicResult = JSON.parse(await readFile(artifactPath, 'utf8'));
const { visualizerSnapshot, visualizerSourceSummary } = buildVisualizerSnapshot(publicResult);
if (visualizerSourceSummary.kind !== 'cog-contain-public-result-summary') throw new Error('visualizer source must be public result summary');
if (visualizerSnapshot.metadata.scenarioCount !== publicResult.scenarioCount) throw new Error('visualizer scenario count mismatch');
if (visualizerSnapshot.metadata.runCount !== publicResult.runCount) throw new Error('visualizer run count mismatch');
if (visualizerSnapshot.metadata.sourceSummaryPath !== publicResult.sourceSummaryPath) throw new Error('visualizer source path mismatch');
if (visualizerSnapshot.results[0]?.model !== publicResult.modelResults[0]?.model) throw new Error('visualizer model row mismatch');
if (existsSync(mockSummaryPath)) {
	const mockSummary = JSON.parse(await readFile(mockSummaryPath, 'utf8'));
	if (mockSummary.mode === 'mock-matrix' && !String(mockSummary.pack).startsWith('examples@')) throw new Error('TUI mock summary must use example pack');
}
console.log(`web public result alignment: ok source=${visualizerSnapshot.metadata.sourceSummaryPath} mode=${publicResult.sourceMode} runs=${visualizerSnapshot.metadata.runCount}`);
