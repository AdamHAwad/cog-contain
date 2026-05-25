import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PLAN_PATH = 'artifacts/run-plans/phase-57-public-dev-lower-bound-live-qa-plan/plan.json';
const SUMMARY_PATH = 'artifacts/tui/phase-65-gpt-5-4-nano-full-40-live-run/summary.json';
const PUBLIC_RESULT_PATH = 'artifacts/public-results/latest.json';
const STATIC_RESULT_PATH = 'apps/web/static/results/latest.json';
const PRIVATE_SENTINEL_PATH = '.pi/goal-agent-prompts/goal-build-cog-contain-v1-according-to-cog-contain-benchmark-spec-and/cancel-live-image-generation';
const PUBLIC_SENTINEL_PATH = 'docs/qa/no-live-public-sentinel.md';

function hasNoLiveSentinel(): boolean {
	return existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) || existsSync(join(ROOT, PUBLIC_SENTINEL_PATH));
}
const RETIRED_PATHS = ['apps/web/src/routes/admin', 'apps/web/src/routes/reports', 'apps/web/src/routes/leaderboard', 'apps/web/src/routes/scenarios', 'apps/web/src/lib/convex', 'apps/web/convex'] as const;
const REQUIRED_FILES = ['run-config.json', 'scenario-public.json', 'scenario-private-checksum.txt', 'trajectory.jsonl', 'state-snapshots.jsonl', 'score-events.jsonl', 'score-report.json', 'model-metadata.json', 'replay-manifest.json', 'notes.md'] as const;
const MODEL_LABEL = 'openai:gpt-5.4-nano';
const PROVIDER = 'openai';
const MODEL = 'gpt-5.4-nano';

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

type Plan = { allScenarioIds: string[]; sourceLocalScenarioCount: number; sourceLocalCleanCount: number; sourceLocalAttackedCount: number };
type Summary = {
	mode: string;
	status: string;
	liveCalls: boolean;
	envRead: boolean;
	hiddenEvalAccess: boolean;
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
	variantCounts: Record<string, number>;
	scoreStatusCounts: Record<string, number>;
	attempts: { scenarioId: string; provider: string; model: string; runId: string; artifactDir: string; status: string; scoreStatus: string; variant: string }[];
};
type PublicResult = {
	kind: string;
	sourceMode: string;
	liveCalls: boolean;
	envRead: boolean;
	hiddenEvalAccess: boolean;
	official: boolean;
	leaderboardEligible: boolean;
	fullLowerBoundRunExecuted: boolean;
	scenarioCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	providerProfiles: { provider: string; model: string; label: string }[];
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number };
	variantCounts: Record<string, number>;
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
	assert(config.provider === PROVIDER && config.modelId === MODEL, `provider/model mismatch ${dir}`);
	assert(config.provider === attempt.provider && config.modelId === attempt.model, `attempt provider/model mismatch ${dir}`);
	assert(config.mode === 'live-smoke', `mode mismatch ${dir}`);
	assert(config.scenarioId === attempt.scenarioId, `scenario mismatch ${dir}`);
	assert(config.credentialEnvName === 'OPENAI_API_KEY', `unexpected credential env label ${dir}`);
	assert(config.credentialPresent === true && config.allowLiveProviderCall === true && config.liveProviderCallAttempted === true, `live guard flags mismatch ${dir}`);
	assert(config.caps.maxSteps === 3 && config.caps.maxOutputTokens === 256 && config.caps.timeoutMs === 60000 && config.caps.retryCount === 0, `caps mismatch ${dir}`);
	const scenarioPublic = readJson<Record<string, unknown>>(`${dir}/scenario-public.json`);
	for (const forbidden of ['private', 'evaluator', 'groundTruth', 'adversarial', 'answerKey', 'privateRefs', 'storageRefs', 'uploadUrl']) assert(!(forbidden in scenarioPublic), `${dir}/scenario-public.json includes ${forbidden}`);
	const replay = readJson<{ replayGrade: boolean; trajectory: { eventCount: number } }>(`${dir}/replay-manifest.json`);
	assert(replay.replayGrade === false && replay.trajectory.eventCount >= 1, `replay manifest mismatch ${dir}`);
}

const plan = readJson<Plan>(PLAN_PATH);
assert(plan.sourceLocalScenarioCount === 40 && plan.sourceLocalCleanCount === 10 && plan.sourceLocalAttackedCount === 30, 'source-local plan counts mismatch');
assert(Array.isArray(plan.allScenarioIds) && plan.allScenarioIds.length === 40, 'expected 40 allScenarioIds');

const summary = readJson<Summary>(SUMMARY_PATH);
assert(summary.mode === 'live-smoke', 'summary must be live-smoke');
assert(summary.status === 'pass', 'summary must pass');
assert(summary.liveCalls === true && summary.envRead === true, 'summary should record guarded live/env behavior');
assert(summary.hiddenEvalAccess === false && summary.official === false && summary.leaderboardEligible === false && summary.fullLowerBoundRunExecuted === false, 'forbidden claim flag');
assert(summary.scenarioCount === 40 && summary.runCount === 40 && summary.completedCount === 40 && summary.errorCount === 0, 'full-40 run counts mismatch');
assert(summary.providerProfiles.length === 1 && summary.providerProfiles[0]?.label === MODEL_LABEL, 'provider profile mismatch');
assert(summary.strictCaps.maxSteps === 3 && summary.strictCaps.maxOutputTokens === 256 && summary.strictCaps.timeoutMs === 60000 && summary.strictCaps.retryCount === 0, 'strict caps mismatch');
assert(summary.liveRunDirs.length === 40 && summary.attempts.length === 40, 'expected forty live run dirs/attempts');
assert(summary.variantCounts.attacked === 30 && summary.variantCounts.clean === 10, 'variant counts mismatch');
assert(summary.scoreStatusCounts.scored_foundation_with_unsupported === 40, 'score status count mismatch');
assert(JSON.stringify(summary.attempts.map((attempt) => attempt.scenarioId)) === JSON.stringify(plan.allScenarioIds), 'attempt scenario ids do not match allScenarioIds order');
for (const attempt of summary.attempts) {
	assert(attempt.provider === PROVIDER && attempt.model === MODEL && attempt.status === 'completed', `attempt mismatch ${attempt.scenarioId}`);
	validateRunDir(attempt.artifactDir, attempt);
}

const publicResult = readJson<PublicResult>(PUBLIC_RESULT_PATH);
if (existsSync(join(ROOT, STATIC_RESULT_PATH))) {
	const staticResult = readJson<PublicResult>(STATIC_RESULT_PATH);
	assert(JSON.stringify(publicResult) === JSON.stringify(staticResult), 'static result not synchronized');
}
assert(publicResult.kind === 'cog-contain-public-result-summary' && publicResult.sourceMode === 'live-smoke', 'public result source mismatch');
const latestPublicLabels = publicResult.providerProfiles.map((profile) => profile.label);
const latestPublicContainsThisNanoRun = latestPublicLabels.some((label) => label.includes(MODEL_LABEL));
assert(publicResult.providerProfiles.length >= 1 && latestPublicLabels.every((label) => typeof label === 'string' && label.length > 0), 'public result provider missing');
assert(publicResult.liveCalls === true && publicResult.envRead === true, 'public result should reflect guarded live execution');
assert(publicResult.hiddenEvalAccess === false && publicResult.official === true && publicResult.leaderboardEligible === false, 'public result claim flag mismatch');
assert(publicResult.scenarioCount === 40 && publicResult.runCount >= 40 && publicResult.completedCount >= 40 && publicResult.errorCount === 0, 'public result counts mismatch');
assert(publicResult.strictCaps.maxSteps === 3 && publicResult.strictCaps.maxOutputTokens === 256 && publicResult.strictCaps.timeoutMs === 60000 && publicResult.strictCaps.retryCount === 0, 'public result caps mismatch');
assert((publicResult.variantCounts.attacked ?? 0) >= 30 && (publicResult.variantCounts.clean ?? 0) >= 10, 'public result variant counts mismatch');
assert(latestPublicContainsThisNanoRun, 'public result no longer contains expected Nano row');

for (const path of [SUMMARY_PATH, PUBLIC_RESULT_PATH, ...(existsSync(join(ROOT, STATIC_RESULT_PATH)) ? [STATIC_RESULT_PATH] : [])]) assertSafeText(path, readText(path));
assert(hasNoLiveSentinel(), 'T407 sentinel missing');
for (const retiredPath of RETIRED_PATHS) assert(!existsSync(join(ROOT, retiredPath)), `retired path restored: ${retiredPath}`);

for (const packagePath of ['package.json', 'packages/runner/package.json', 'apps/web/package.json']) {
	const pkg = readJson<{ scripts?: Record<string, string> }>(packagePath);
	for (const [scriptName, script] of Object.entries(pkg.scripts ?? {})) {
		assert(!script.includes('--allow-live-provider-call') && !script.includes('--confirm-live-smoke'), `${packagePath} script ${scriptName} must not perform live calls by default`);
	}
}

console.log(`T454 GPT 5.4 Nano full-40 TUI run: ok attempts=40 provider=openai model=gpt-5.4-nano latestPublic=${latestPublicContainsThisNanoRun ? 'contains-gpt-5.4-nano' : 'missing-gpt-5.4-nano'} sanitized=true sentinelPresent=true`);
