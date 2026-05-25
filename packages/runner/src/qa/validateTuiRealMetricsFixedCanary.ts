import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CANARY_SUMMARY_PATH = 'artifacts/tui/phase-68-gpt-5-4-nano-proof-fixed-canary/summary.json';
const PUBLIC_RESULT_PATH = 'artifacts/public-results/latest.json';
const PRIVATE_SENTINEL_PATH = '.pi/goal-agent-prompts/goal-build-cog-contain-v1-according-to-cog-contain-benchmark-spec-and/cancel-live-image-generation';
const PUBLIC_SENTINEL_PATH = 'docs/qa/no-live-public-sentinel.md';

function hasNoLiveSentinel(): boolean {
	return existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) || existsSync(join(ROOT, PUBLIC_SENTINEL_PATH));
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;
}
function safeScan(path: string): void {
	const text = readFileSync(join(ROOT, path), 'utf8');
	assert(!/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|BEGIN (RSA|OPENSSH|PRIVATE) KEY|data:image|base64/iu.test(text), `${path} has secret/generated marker`);
	assert(!/(raw provider|raw model transcript|raw tool arguments|provider request|provider response)\s*[:=]/iu.test(text), `${path} has raw-content marker`);
}

type Summary = {
	mode: string;
	status: string;
	label: string;
	scenarioCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	liveCalls: boolean;
	envRead: boolean;
	providerProfiles: { label: string }[];
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number };
	modelResults: {
		model: string;
		provider: string;
		accuracyPercent: number | null;
		averageDurationSeconds: number | null;
		totalCostUsd: number | null;
		usageSummary: { totalTokens: number; costUsd: number };
		metricSupport: { accuracy: string; cost: string; speed: string };
	}[];
	attempts?: { durationMs?: number; usageSummary?: { totalTokens: number; costUsd: number }; status?: string; artifactDir?: string }[];
};

type LiveMetrics = {
	assistantProof?: {
		requestedProvider?: string;
		requestedModel?: string;
		finalProvider?: string;
		finalModel?: string;
		responseModel?: string;
		responseIdPresent?: boolean;
		responseIdHash?: string;
		finalStopReason?: string;
		usageSupported?: boolean;
		costSupported?: boolean;
		usageTotalTokens?: number;
		computedCostUsd?: number;
	};
	providerBoundaryProof?: {
		payloadHookCalled?: boolean;
		responseHookCalled?: boolean;
		payloadHookAt?: string;
		responseHookAt?: string;
		httpStatusClass?: string;
		providerResponseHeaderLatencyMs?: number;
		agentPromptDurationMs?: number;
	};
};

type PublicResult = { label: string; sourceMode: string; runCount: number; modelResults: { metricSupport?: { cost?: string } }[] };

const summary = readJson<Summary>(CANARY_SUMMARY_PATH);
assert(summary.mode === 'live-smoke' && summary.status === 'pass', 'fixed canary must be passing live-smoke');
assert(summary.scenarioCount === 1 && summary.runCount === 1 && summary.completedCount === 1 && summary.errorCount === 0, 'fixed canary counts mismatch');
assert(summary.liveCalls === true && summary.envRead === true, 'fixed canary should execute through guarded live path');
assert(summary.providerProfiles[0]?.label === 'openai:gpt-5.4-nano', 'provider/model mismatch');
assert(summary.strictCaps.maxSteps === 3 && summary.strictCaps.maxOutputTokens === 256 && summary.strictCaps.timeoutMs === 60000 && summary.strictCaps.retryCount === 0, 'strict caps mismatch');
const result = summary.modelResults[0];
assert(result?.provider === 'openai' && result.model === 'gpt-5.4-nano', 'model result mismatch');
assert(result.metricSupport.accuracy === 'supported' && typeof result.accuracyPercent === 'number', 'accuracy should be supported from score artifacts');
assert(result.metricSupport.speed === 'supported' && typeof result.averageDurationSeconds === 'number' && result.averageDurationSeconds >= 0.1, 'speed should be supported with believable provider roundtrip timing');
assert(result.metricSupport.cost === 'supported', 'cost should be supported when provider usage is present');
assert(result.usageSummary.totalTokens > 0 && result.usageSummary.costUsd > 0 && result.totalCostUsd !== null && result.totalCostUsd > 0, 'fixed canary should expose positive usage and positive real cost');
const attempt = summary.attempts?.[0];
assert(attempt?.status === 'completed' && typeof attempt.durationMs === 'number' && attempt.durationMs >= 100, 'attempt should record completed believable duration');
assert((attempt.usageSummary?.totalTokens ?? 0) > 0 && (attempt.usageSummary?.costUsd ?? 0) > 0, 'attempt should record positive usage/cost');
assert(typeof attempt.artifactDir === 'string', 'attempt artifactDir required');
const liveMetrics = readJson<LiveMetrics>(`${attempt.artifactDir}/live-metrics.json`);
const assistantProof = liveMetrics.assistantProof;
assert(assistantProof?.requestedProvider === 'openai' && assistantProof.requestedModel === 'gpt-5.4-nano', 'assistant proof requested provider/model mismatch');
assert(assistantProof.finalProvider === 'openai' && assistantProof.finalModel === 'gpt-5.4-nano', 'assistant proof final provider/model mismatch');
assert(assistantProof.finalStopReason === 'stop' || assistantProof.finalStopReason === 'length' || assistantProof.finalStopReason === 'toolUse', 'assistant proof must have successful final stop reason');
assert(assistantProof.responseIdPresent === true && typeof assistantProof.responseIdHash === 'string' && /^[a-f0-9]{16}$/u.test(assistantProof.responseIdHash), 'assistant proof must include response id presence and safe hash');
assert(assistantProof.usageSupported === true && assistantProof.costSupported === true && (assistantProof.usageTotalTokens ?? 0) > 0 && (assistantProof.computedCostUsd ?? 0) > 0, 'assistant proof must support usage and cost');
const boundaryProof = liveMetrics.providerBoundaryProof;
assert(boundaryProof?.payloadHookCalled === true && boundaryProof.responseHookCalled === true, 'provider boundary hooks must fire');
assert(boundaryProof.httpStatusClass === '2xx', 'provider boundary status class must be 2xx');
assert(typeof boundaryProof.payloadHookAt === 'string' && typeof boundaryProof.responseHookAt === 'string', 'provider boundary timestamps missing');
assert((boundaryProof.providerResponseHeaderLatencyMs ?? 0) >= 0 && (boundaryProof.agentPromptDurationMs ?? 0) >= 100, 'provider boundary latency/duration missing or implausible');
const liveSmokeSource = readFileSync(join(ROOT, 'packages/runner/src/live/liveSmoke.ts'), 'utf8');
assert(liveSmokeSource.includes('assistantProof.finalStopReason === "error" || assistantProof.finalStopReason === "aborted"'), 'liveSmoke must classify assistant error/aborted stopReason as provider/runtime error');
const publicResult = readJson<PublicResult>(PUBLIC_RESULT_PATH);
assert(!publicResult.label.includes('phase-68-t455-proof-fixed-canary'), 'fixed canary must not be public-synced');
assert(hasNoLiveSentinel(), 'T407 sentinel missing');
safeScan(CANARY_SUMMARY_PATH);
console.log('T455 real-metrics fixed canary: accuracySupported=true costSupported=true speedSupported=true publicResultPreserved=true');
