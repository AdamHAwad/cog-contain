import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

export const REQUIRED_LIVE_SMOKE_ARTIFACT_FILES = [
	"run-config.json",
	"scenario-public.json",
	"scenario-private-checksum.txt",
	"trajectory.jsonl",
	"state-snapshots.jsonl",
	"score-events.jsonl",
	"score-report.json",
	"model-metadata.json",
	"replay-manifest.json",
	"notes.md"
] as const;

export type LiveSmokeArtifactRunSpec = {
	provider: string;
	modelId: string;
	runId: string;
	dir: string;
	credentialEnvName: string;
	expectedScenarioId: string;
	expectedMode?: string;
	expectedScoreStatus?: string;
	expectedScoreEventCount?: number;
	expectedReplayGrade?: boolean;
	maxSteps?: number;
	maxOutputTokens?: number;
	timeoutMs?: number;
	retryCount?: number;
};

export type LiveSmokeReportSpec = {
	path: string;
	requiredIncludes: string[];
};

export type LiveSmokeArtifactValidationResult = {
	runCount: number;
	providers: string[];
	models: string[];
	summary: string;
};

export type LiveSmokeArtifactValidationParams = {
	runs: readonly LiveSmokeArtifactRunSpec[];
	report?: LiveSmokeReportSpec;
	sentinelPath?: string;
	label: string;
};

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

function readText(path: string): string {
	return readFileSync(join(ROOT, path), "utf8");
}

function assertSafeText(path: string, text: string): void {
	assert(!/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+/u.test(text), `${path} appears to contain a credential`);
	assert(!/(^|[^a-z])raw provider response\s*[:=]|raw model transcript\s*[:=]|raw tool arguments\s*[:=]|raw observations\s*[:=]/iu.test(text), `${path} includes forbidden raw-content label`);
	assert(!/OPENROUTER_API_KEY\s*=|OPENAI_API_KEY\s*=|\.env/u.test(text), `${path} includes env assignment/reference`);
}

function validateRun(run: LiveSmokeArtifactRunSpec): void {
	for (const file of REQUIRED_LIVE_SMOKE_ARTIFACT_FILES) {
		const path = `${run.dir}/${file}`;
		assert(existsSync(join(ROOT, path)), `missing ${path}`);
		assert(statSync(join(ROOT, path)).size > 0, `empty ${path}`);
	}
	const config = readJson<{
		runId: string;
		provider: string;
		modelId: string;
		mode: string;
		scenarioId: string;
		credentialEnvName: string;
		credentialPresent: boolean;
		allowLiveProviderCall: boolean;
		liveProviderCallAttempted: boolean;
		caps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number };
		status: string;
	}>(`${run.dir}/run-config.json`);
	assert(config.runId === run.runId, `run id mismatch ${run.dir}`);
	assert(config.provider === run.provider, `provider mismatch ${run.dir}`);
	assert(config.modelId === run.modelId, `model mismatch ${run.dir}`);
	assert(config.mode === (run.expectedMode ?? "live-smoke"), `mode mismatch ${run.dir}`);
	assert(config.scenarioId === run.expectedScenarioId, `scenario mismatch ${run.dir}`);
	assert(config.credentialEnvName === run.credentialEnvName, `credential env label mismatch ${run.dir}`);
	assert(config.credentialPresent === true && config.allowLiveProviderCall === true && config.liveProviderCallAttempted === true, `live guard flags mismatch ${run.dir}`);
	assert(config.caps.maxSteps <= (run.maxSteps ?? 3), `max steps cap mismatch ${run.dir}`);
	assert(config.caps.maxOutputTokens <= (run.maxOutputTokens ?? 256), `max output cap mismatch ${run.dir}`);
	assert(config.caps.timeoutMs <= (run.timeoutMs ?? 60000), `timeout cap mismatch ${run.dir}`);
	assert(config.caps.retryCount === (run.retryCount ?? 0), `retry cap mismatch ${run.dir}`);
	const manifest = readJson<{ replayGrade: boolean; trajectory: { eventCount: number } }>(`${run.dir}/replay-manifest.json`);
	assert(manifest.replayGrade === (run.expectedReplayGrade ?? false), `replay grade mismatch ${run.dir}`);
	assert(manifest.trajectory.eventCount >= 1, `trajectory event count missing ${run.dir}`);
	const score = readJson<{ status: string; metrics: { scoreEventCount: number } }>(`${run.dir}/score-report.json`);
	assert(score.status === (run.expectedScoreStatus ?? "scored_foundation_with_unsupported"), `score status mismatch ${run.dir}`);
	if (run.expectedScoreEventCount !== undefined) assert(score.metrics.scoreEventCount === run.expectedScoreEventCount, `score event count mismatch ${run.dir}`);
	for (const file of REQUIRED_LIVE_SMOKE_ARTIFACT_FILES) assertSafeText(`${run.dir}/${file}`, readText(`${run.dir}/${file}`));
}

export function validateLiveSmokeArtifacts(params: LiveSmokeArtifactValidationParams): LiveSmokeArtifactValidationResult {
	for (const run of params.runs) validateRun(run);
	if (params.report) {
		const report = readText(params.report.path);
		for (const required of params.report.requiredIncludes) assert(report.includes(required), `${params.report.path} missing ${required}`);
		assertSafeText(params.report.path, report);
	}
	if (params.sentinelPath) {
		assert(existsSync(join(ROOT, params.sentinelPath)), `${params.label} requires cancellation sentinel ${params.sentinelPath}`);
	}
	return {
		runCount: params.runs.length,
		providers: [...new Set(params.runs.map((run) => run.provider))],
		models: [...new Set(params.runs.map((run) => run.modelId))],
		summary: `providers=${params.runs.length} bounded=true sanitized=true sentinelPresent=${params.sentinelPath ? "true" : "not_checked"}`
	};
}
