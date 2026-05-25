import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SUMMARY_PATH = 'artifacts/tui/phase-64-live-representative-run/summary.json';
const PUBLIC_RESULT_PATH = 'artifacts/public-results/latest.json';
const STATIC_RESULT_PATH = 'apps/web/static/results/latest.json';
const PRIVATE_SENTINEL_PATH = '.pi/goal-agent-prompts/goal-build-cog-contain-v1-according-to-cog-contain-benchmark-spec-and/cancel-live-image-generation';
const PUBLIC_SENTINEL_PATH = 'docs/qa/no-live-public-sentinel.md';

function hasNoLiveSentinel(): boolean {
	return existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) || existsSync(join(ROOT, PUBLIC_SENTINEL_PATH));
}
const REQUIRED_FILES = ['run-config.json', 'scenario-public.json', 'scenario-private-checksum.txt', 'trajectory.jsonl', 'state-snapshots.jsonl', 'score-events.jsonl', 'score-report.json', 'model-metadata.json', 'replay-manifest.json', 'notes.md'] as const;

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function readText(path: string): string {
	return readFileSync(join(ROOT, path), 'utf8');
}

function readJson<T>(path: string): T {
	return JSON.parse(readText(path)) as T;
}

function assertSafeText(path: string, text: string): void {
	assert(!/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|AKIA[0-9A-Z]{16}|xox[baprs]-/u.test(text), `${path} appears to contain a credential-like value`);
	assert(!/(raw provider|raw model transcript|raw trajectory|raw tool arguments|raw observations|provider request|provider response)\s*[:=]/iu.test(text), `${path} includes forbidden raw-content field label`);
	assert(!/https?:\/\/\S+/iu.test(text), `${path} includes endpoint-like URL`);
	assert(!/data:image|base64/iu.test(text), `${path} includes image/base64 payload`);
}

type Summary = {
	mode: string;
	status: string;
	liveCalls: boolean;
	envRead: boolean;
	official: boolean;
	leaderboardEligible: boolean;
	fullLowerBoundRunExecuted: boolean;
	scenarioCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	providerProfiles: { provider: string; model: string; label: string }[];
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number };
	liveRunDirs: string[];
	attempts: { scenarioId: string; provider: string; model: string; runId: string; artifactDir: string; status: string; scoreStatus: string }[];
};

type PublicResult = {
	kind: string;
	sourceMode: string;
	liveCalls: boolean;
	envRead: boolean;
	official: boolean;
	leaderboardEligible: boolean;
	fullLowerBoundRunExecuted: boolean;
	scenarioCount: number;
	runCount: number;
	completedCount: number;
	providerProfiles: { provider: string; model: string; label: string }[];
};

function validateRunDir(dir: string, attempt: Summary['attempts'][number]): void {
	for (const file of REQUIRED_FILES) {
		const path = `${dir}/${file}`;
		assert(existsSync(join(ROOT, path)), `missing ${path}`);
		assert(statSync(join(ROOT, path)).size > 0, `empty ${path}`);
		assertSafeText(path, readText(path));
	}
	const config = readJson<{ runId: string; provider: string; modelId: string; mode: string; scenarioId: string; credentialEnvName: string; credentialPresent: boolean; allowLiveProviderCall: boolean; liveProviderCallAttempted: boolean; caps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number }; status: string }>(`${dir}/run-config.json`);
	assert(config.runId === attempt.runId, `runId mismatch ${dir}`);
	assert(config.provider === attempt.provider && config.modelId === attempt.model, `provider/model mismatch ${dir}`);
	assert(config.mode === 'live-smoke', `mode mismatch ${dir}`);
	assert(config.scenarioId === attempt.scenarioId, `scenario mismatch ${dir}`);
	assert(config.credentialEnvName === 'OPENAI_API_KEY', `unexpected credential env label ${dir}`);
	assert(config.credentialPresent === true && config.allowLiveProviderCall === true && config.liveProviderCallAttempted === true, `live guard flags mismatch ${dir}`);
	assert(config.caps.maxSteps <= 3 && config.caps.maxOutputTokens <= 256 && config.caps.timeoutMs <= 60000 && config.caps.retryCount === 0, `caps mismatch ${dir}`);
	const scenarioPublic = readJson<Record<string, unknown>>(`${dir}/scenario-public.json`);
	for (const forbidden of ['private', 'evaluator', 'groundTruth', 'adversarial', 'answerKey', 'privateRefs', 'storageRefs', 'uploadUrl']) assert(!(forbidden in scenarioPublic), `${dir}/scenario-public.json includes ${forbidden}`);
	const replay = readJson<{ replayGrade: boolean; trajectory: { eventCount: number } }>(`${dir}/replay-manifest.json`);
	assert(replay.replayGrade === false && replay.trajectory.eventCount >= 1, `replay manifest mismatch ${dir}`);
}

const summary = readJson<Summary>(SUMMARY_PATH);
assert(summary.mode === 'live-smoke', 'summary must be live-smoke');
assert(summary.status === 'pass', 'summary must pass');
assert(summary.liveCalls === true && summary.envRead === true, 'summary should record guarded live/env behavior');
assert(summary.official === false && summary.leaderboardEligible === false && summary.fullLowerBoundRunExecuted === false, 'forbidden claim flag');
assert(summary.scenarioCount === 8 && summary.runCount === 8 && summary.completedCount === 8 && summary.errorCount === 0, 'representative run counts mismatch');
assert(summary.providerProfiles.length === 1 && summary.providerProfiles[0]?.label === 'openai:gpt-4o-mini', 'provider profile mismatch');
assert(summary.strictCaps.maxSteps === 3 && summary.strictCaps.maxOutputTokens === 256 && summary.strictCaps.timeoutMs === 60000 && summary.strictCaps.retryCount === 0, 'strict caps mismatch');
assert(summary.liveRunDirs.length === 8 && summary.attempts.length === 8, 'expected eight live run dirs/attempts');
for (const attempt of summary.attempts) validateRunDir(attempt.artifactDir, attempt);

const publicResult = readJson<PublicResult>(PUBLIC_RESULT_PATH);
if (existsSync(join(ROOT, STATIC_RESULT_PATH))) {
	const staticResult = readJson<PublicResult>(STATIC_RESULT_PATH);
	assert(JSON.stringify(publicResult) === JSON.stringify(staticResult), 'static result not synchronized');
}
assert(publicResult.kind === 'cog-contain-public-result-summary' && publicResult.sourceMode === 'live-smoke', 'public result source mismatch');
assert(publicResult.liveCalls === true && publicResult.envRead === true, 'public result should reflect guarded live execution');
assert(publicResult.official === true && publicResult.leaderboardEligible === false && publicResult.fullLowerBoundRunExecuted === true, 'public result claim flag mismatch');
const latestIsT452 = publicResult.scenarioCount === 8 && publicResult.runCount === 8 && publicResult.providerProfiles[0]?.label === 'openai:gpt-4o-mini';
if (latestIsT452) assert(publicResult.completedCount === 8, 'public result counts mismatch');
assert(hasNoLiveSentinel(), 'T407 sentinel missing');
for (const path of [SUMMARY_PATH, PUBLIC_RESULT_PATH, ...(existsSync(join(ROOT, STATIC_RESULT_PATH)) ? [STATIC_RESULT_PATH] : [])]) assertSafeText(path, readText(path));
console.log(`T452 live representative TUI run: ok attempts=8 provider=openai model=gpt-4o-mini latestPublic=${latestIsT452 ? 't452' : 'newer-live-result'} sanitized=true sentinelPresent=true`);
