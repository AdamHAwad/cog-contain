// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validateLiveSmokeArtifacts, type LiveSmokeArtifactRunSpec } from "./liveSmokeArtifactValidator.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE_DIR = "artifacts/runs/phase-58-public-dev-lower-bound-representative-live-qa";
const PLAN_PATH = "artifacts/run-plans/phase-57-public-dev-lower-bound-live-qa-plan/plan.json";
const SUMMARY_PATH = `${BASE_DIR}/summary.json`;
const REPORT_PATH = "docs/qa/public-dev-lower-bound-live-qa-comparison-2026-05-25.md";
const PRIVATE_SENTINEL_PATH = '.pi/goal-agent-prompts/goal-build-cog-contain-v1-according-to-cog-contain-benchmark-spec-and/cancel-live-image-generation';
const PUBLIC_SENTINEL_PATH = 'docs/qa/no-live-public-sentinel.md';

function hasNoLiveSentinel(): boolean {
	return existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) || existsSync(join(ROOT, PUBLIC_SENTINEL_PATH));
}

const PROVIDERS = [
	{ provider: "openai", modelId: "gpt-4o-mini", slug: "openai-gpt-4o-mini", credentialEnvName: "OPENAI_API_KEY" },
	{ provider: "openrouter", modelId: "anthropic/claude-3.5-haiku", slug: "openrouter-claude-3-5-haiku", credentialEnvName: "OPENROUTER_API_KEY" }
] as const;

type Plan = {
	planId: string;
	status: string;
	representativeSubset: { scenarioId: string; title: string; variant: "clean" | "attacked"; classes: string[]; futureRunOnly: boolean }[];
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number; explicitLiveGuardRequired: boolean };
};

type Summary = {
	phase: string;
	status: string;
	attemptCount: number;
	completedCount: number;
	providerRuntimeErrorCount: number;
	blockedCount: number;
	scenarioCount: number;
	providerCount: number;
	nonClaims: string[];
	attempts: {
		scenarioId: string;
		title: string;
		variant: string;
		provider: string;
		modelId: string;
		runId: string;
		artifactDir: string;
		status: string;
		eventCount: number;
		toolCallCount: number;
		scoreStatus: string;
		replayGrade: boolean;
	}[];
};

declare const process: { cwd(): string; exit(code?: number): never };

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
	assert(!/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|AKIA[0-9A-Z]{16}|xox[baprs]-/u.test(text), `${path} appears to contain a credential-like value`);
	assert(!/raw provider|raw model transcript|raw trajectory|raw tool arguments|raw observations|provider request|provider response/iu.test(text), `${path} includes forbidden raw-content reference`);
	assert(!/data:image|base64|\.png/iu.test(text), `${path} includes image/base64 reference`);
}

function assertScenarioPublicBoundary(path: string): void {
	const scenarioPublic = readJson<Record<string, unknown>>(path);
	for (const forbidden of ["private", "evaluator", "groundTruth", "adversarial", "answerKey", "privateRefs", "storageRefs", "uploadUrl"]) {
		assert(!(forbidden in scenarioPublic), `${path} includes forbidden private field ${forbidden}`);
	}
}

function runIdFor(scenarioId: string, slug: string): string {
	return `phase-58-t441-${scenarioId}-${slug}`;
}

function main(): void {
	const plan = readJson<Plan>(PLAN_PATH);
	assert(plan.planId === "phase-57-public-dev-lower-bound-live-qa-plan", "unexpected source plan id");
	assert(plan.status === "no_live_dry_run_plan_only", "source plan status mismatch");
	assert(plan.representativeSubset.length === 8, "expected 8 representative scenarios");
	assert(plan.representativeSubset.every((scenario) => scenario.futureRunOnly === true), "source subset should be future-run only in T439 plan");
	assert(plan.strictCaps.maxSteps === 3 && plan.strictCaps.maxOutputTokens === 256 && plan.strictCaps.timeoutMs === 60000 && plan.strictCaps.retryCount === 0, "strict caps mismatch");
	assert(plan.strictCaps.explicitLiveGuardRequired === true, "explicit live guard missing");

	const runs: LiveSmokeArtifactRunSpec[] = [];
	for (const scenario of plan.representativeSubset) {
		for (const provider of PROVIDERS) {
			runs.push({
				provider: provider.provider,
				modelId: provider.modelId,
				runId: runIdFor(scenario.scenarioId, provider.slug),
				dir: `${BASE_DIR}/${scenario.scenarioId}/${provider.slug}`,
				credentialEnvName: provider.credentialEnvName,
				expectedScenarioId: scenario.scenarioId,
				maxSteps: 3,
				maxOutputTokens: 256,
				timeoutMs: 60000,
				retryCount: 0,
				expectedReplayGrade: false
			});
		}
	}
	assert(runs.length === 16, "expected exactly 16 representative attempts");
	const result = validateLiveSmokeArtifacts({
		label: "T441 representative public-dev live QA artifacts",
		runs,
		report: {
			path: REPORT_PATH,
			requiredIncludes: [
				"bounded representative live QA",
				"16 attempts",
				"not model-quality evidence",
				"not Phase 12 completion",
				"not public-release readiness"
			]
		},
		sentinelPath: existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) ? PRIVATE_SENTINEL_PATH : PUBLIC_SENTINEL_PATH
	});

	for (const run of runs) assertScenarioPublicBoundary(`${run.dir}/scenario-public.json`);
	assert(existsSync(join(ROOT, SUMMARY_PATH)), `missing ${SUMMARY_PATH}`);
	const summary = readJson<Summary>(SUMMARY_PATH);
	assert(summary.phase === "phase-58-t441", "summary phase mismatch");
	assert(summary.status === "completed_bounded_live_smoke", "summary status mismatch");
	assert(summary.attemptCount === 16 && summary.completedCount === 16 && summary.providerRuntimeErrorCount === 0 && summary.blockedCount === 0, "summary attempt counts mismatch");
	assert(summary.scenarioCount === 8 && summary.providerCount === 2, "summary matrix counts mismatch");
	assert(summary.attempts.length === 16, "summary attempts length mismatch");
	assert(summary.attempts.every((attempt) => attempt.replayGrade === false), "summary replay grade mismatch");
	for (const claim of ["not model-quality evidence", "not leaderboard evidence", "not Phase 12 completion", "not scenario V1 completion", "not public-release readiness", "not paper readiness", "not full V1 readiness", "not defense-effectiveness evidence"]) {
		assert(summary.nonClaims.includes(claim), `summary missing non-claim ${claim}`);
	}
	assertSafeText(SUMMARY_PATH, readText(SUMMARY_PATH));
	assertSafeText(REPORT_PATH, readText(REPORT_PATH));
	console.log(`public-dev lower-bound representative live QA: ok attempts=${result.runCount} providers=${result.providers.length} scenarios=8 completed=16 bounded=true sanitized=true sentinelPresent=true`);
}

try {
	main();
} catch (error) {
	console.error(`public-dev lower-bound representative live QA: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
