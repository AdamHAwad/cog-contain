import { mkdir, readFile, writeFile } from 'node:fs/promises';

const localResultUrl = new URL('../../../artifacts/local-results/latest.json', import.meta.url);
const staticResultUrl = new URL('../static/results/latest.json', import.meta.url);

function emptyLocalSummary() {
	return {
		schemaVersion: 1,
		kind: 'cog-contain-public-result-summary',
		label: 'local-results-empty',
		createdAt: '1970-01-01T00:00:00.000Z',
		sourceMode: 'local-results',
		pack: 'local-only',
		status: 'empty',
		liveCapable: true,
		liveCalls: false,
		envRead: false,
		hiddenEvalAccess: false,
		official: false,
		leaderboardEligible: false,
		fullLowerBoundRunExecuted: false,
		artifactRoot: 'artifacts/local-results',
		sourceSummaryPath: 'artifacts/local-results/latest.json',
		providerProfiles: [],
		strictCaps: { maxSteps: 3, maxOutputTokens: 256, timeoutMs: 60000, retryCount: 0 },
		scenarioCount: 0,
		runCount: 0,
		completedCount: 0,
		errorCount: 0,
		scoreStatusCounts: {},
		variantCounts: {},
		modelResults: [],
		caveats: ['No local results yet. Run a local benchmark to populate this view.']
	};
}

async function readLocalSummary(): Promise<unknown> {
	try {
		return JSON.parse(await readFile(localResultUrl, 'utf8'));
	} catch (error) {
		if ((error as { code?: string }).code === 'ENOENT') return emptyLocalSummary();
		throw error;
	}
}

const summary = await readLocalSummary();
const artifact = summary as { kind?: unknown; official?: unknown; leaderboardEligible?: unknown };
if (artifact.kind !== 'cog-contain-public-result-summary') throw new Error('invalid local result kind');
if (artifact.official !== false || artifact.leaderboardEligible !== false) throw new Error('local result must remain non-official');
await mkdir(new URL('../static/results', import.meta.url), { recursive: true });
await writeFile(staticResultUrl, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log('prepare local site: ok copied local-only results into static/results/latest.json');
