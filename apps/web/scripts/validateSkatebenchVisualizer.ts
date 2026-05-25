import { readFile } from 'node:fs/promises';
import { buildVisualizerSnapshot } from '../src/lib/skatebench/visualizerData.ts';

const route = await readFile(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
const layout = await readFile(new URL('../src/routes/+layout.svelte', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/routes/layout.css', import.meta.url), 'utf8');
const visualizerData = await readFile(new URL('../src/lib/skatebench/visualizerData.ts', import.meta.url), 'utf8');
const pageLoader = await readFile(new URL('../src/routes/+page.ts', import.meta.url), 'utf8');
const staticResult = JSON.parse(await readFile(new URL('../static/results/latest.json', import.meta.url), 'utf8'));
const { visualizerSnapshot, visualizerSourceSummary } = buildVisualizerSnapshot(staticResult);

const retiredRouteMarkers = ['/admin/runs', '/reports/', '/leaderboard', 'Convex', 'Start official run', 'Publish report'];
const forbiddenPositiveClaims = ['official leaderboard evidence', 'publication-ready', 'Phase 12 completion', 'full V1 readiness', 'model-quality evidence', 'defense-effectiveness evidence'];
const rawMarkers = ['raw transcript', 'provider payload', 'tool arguments', 'BEGIN PRIVATE KEY', 'data:image/', 'base64,'];
const forbiddenFakeMetrics = ['$0.00', '0.0s', '0.00s', 'Utility distribution', 'Cost efficiency', 'Response latency', 'Robust utility summary', 'Total public-safe summary cost', 'Average response time'];

const bannedFrontFacing = ['SkateBench', 'live-smoke', 'source-local', 'public-dev', 'lower-bound', 'TUI', 'phase-', 'verifier', 'planner', 'worker', 'Public vs Local', 'not official'];

if (visualizerSnapshot.metadata.official !== true) throw new Error('visualizer metadata must reflect official published results');
if (visualizerSnapshot.metadata.dataLabel !== 'Official Results') throw new Error('visualizer data label must be Official Results');
if (visualizerSnapshot.metadata.leaderboardEligible !== false) throw new Error('visualizer metadata must remain ranking-ineligible');
if (visualizerSnapshot.metadata.fullLowerBoundRunExecuted !== true) throw new Error('official published results should reflect full hidden-suite execution');
if (!['mock-matrix', 'live-smoke'].includes(visualizerSourceSummary.sourceMode)) throw new Error('public visualizer validator expects published mock-matrix or live-smoke summary');
const providerModelCount = new Set(visualizerSourceSummary.modelResults.map((result) => `${result.provider}:${result.model}`)).size;
if (visualizerSnapshot.results.length !== providerModelCount) throw new Error('visualizer must show one row per provider/model');
if (visualizerSnapshot.metadata.runCount !== visualizerSourceSummary.runCount) throw new Error('visualizer run count must match public result summary');
if (visualizerSnapshot.metadata.completedCount !== visualizerSourceSummary.completedCount) throw new Error('visualizer completed count must match public result summary');
if (visualizerSnapshot.metadata.errorCount !== visualizerSourceSummary.errorCount) throw new Error('visualizer error count must match public result summary');
if (visualizerSnapshot.metadata.sourceMode !== visualizerSourceSummary.sourceMode) throw new Error('visualizer source mode must match public result summary');
if (JSON.stringify(visualizerSnapshot.metadata.variantCounts) !== JSON.stringify(visualizerSourceSummary.variantCounts)) throw new Error('visualizer variant counts must match public result summary');
if (JSON.stringify(visualizerSnapshot.metadata.scoreStatusCounts) !== JSON.stringify(visualizerSourceSummary.scoreStatusCounts)) throw new Error('visualizer score status counts must match public result summary');
if (visualizerSnapshot.results.length < 1) throw new Error('visualizer needs at least one executed TUI result row');

for (const tab of ['Accuracy', 'Cost', 'Speed']) if (!route.includes(`label: '${tab}'`)) throw new Error(`${tab} tab missing`);
for (const removed of [`label: 'Matrix'`, 'Matrix</h2>', 'Foundation live-smoke', 'source-local public-dev', 'TUI live-smoke', 'model-quality claim', 'official leaderboard claim', 'modelTitle(result)', 'result.runLabel', 'labelize(result.status)']) {
	if (route.includes(removed)) throw new Error(`unclear frontend jargon remained: ${removed}`);
}
if (!route.includes('Official Results')) throw new Error('route must present Official Results framing');
if (!route.includes('Percent score from the recorded benchmark artifacts')) throw new Error('Accuracy tab must use plain source copy');
for (const term of bannedFrontFacing) if (route.includes(term)) throw new Error(`banned front-facing term in route: ${term}`);
if (!route.includes('Total provider cost for the recorded run')) throw new Error('Cost tab must use plain source copy');
if (!route.includes('Average time per scenario')) throw new Error('Speed tab must use plain source copy');
if (!route.includes('<strong>{repeatCount}</strong><span>repeats</span>')) throw new Error('summary must report zero repeats');
if (visualizerSnapshot.metadata.modelCount !== providerModelCount) throw new Error('metadata model count must match visible provider/model rows');
if (visualizerData.includes('T450 PUBLIC RESULT SYNC') || route.includes('T450 PUBLIC RESULT SYNC')) throw new Error('stale T450 public-result sync label found');
if (!visualizerData.includes('buildVisualizerSnapshot')) throw new Error('visualizer must build from fetched/static result JSON');
if (!pageLoader.includes("from '$lib/skatebench/siteResultSnapshot'")) throw new Error('page loader must import the sanitized site snapshot without serializing the full public result response into HTML');
if (visualizerSourceSummary.sourceMode === 'live-smoke') {
	for (const marker of forbiddenFakeMetrics) if (route.includes(marker)) throw new Error(`misleading/fake metric copy found for live-smoke summary: ${marker}`);
	for (const result of visualizerSnapshot.results) {
		if (result.metricSupport.cost === 'supported' && (!(typeof result.totalCostUsd === 'number') || result.totalCostUsd <= 0 || result.usageSummary.totalTokens <= 0)) throw new Error('supported cost requires positive real cost and tokens');
		if (result.metricSupport.speed === 'supported' && (!(typeof result.averageDurationSeconds === 'number') || result.averageDurationSeconds < 0.1)) throw new Error('supported speed requires believable measured provider/agent-call duration');
		if (result.metricSupport.accuracy === 'supported' && (!(typeof result.accuracyPercent === 'number') || result.accuracySupportCount < 1)) throw new Error('supported accuracy requires artifact-derived score support');
	}
}
for (const marker of retiredRouteMarkers) if (route.includes(marker) || layout.includes(marker)) throw new Error(`retired live-app marker remained in route/layout: ${marker}`);
for (const claim of forbiddenPositiveClaims) {
	const positivePattern = new RegExp(`(?<!not |No |no )${claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
	if (positivePattern.test(route)) throw new Error(`positive claim found in route: ${claim}`);
}
for (const marker of rawMarkers) if (`${route}\n${css}`.includes(marker)) throw new Error(`raw/secret/generated marker found: ${marker}`);
if (/sk-[A-Za-z0-9_-]{8,}/.test(`${route}\n${css}`)) throw new Error('secret-like sk token marker found');

if (process.env.COG_CONTAIN_STATIC_BUILD === 'true') {
	const builtIndexPath = new URL('../build/index.html', import.meta.url);
	let builtIndex = '';
	try {
		builtIndex = await readFile(builtIndexPath, 'utf8');
	} catch {
		throw new Error('built public site missing apps/web/build/index.html; run build:public-site first');
	}
	for (const marker of ['gpt-5.5', 'claude-opus-4.7', 'xhigh']) {
		if (!builtIndex.includes(marker)) throw new Error(`built public site missing required current-model marker: ${marker}`);
	}
}

console.log(`skatebench visualizer validator: ok rows=${visualizerSnapshot.results.length} sourceMode=${visualizerSourceSummary.sourceMode}`);
