import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CANARY_SUMMARY_PATH = 'artifacts/tui/phase-66-gpt-5-4-nano-real-metrics-canary/summary.json';
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
};

type PublicResult = { label: string; sourceMode: string; runCount: number; modelResults: { metricSupport?: { cost?: string } }[] };

const summary = readJson<Summary>(CANARY_SUMMARY_PATH);
assert(summary.mode === 'live-smoke' && summary.status === 'pass', 'canary must be passing live-smoke');
assert(summary.scenarioCount === 1 && summary.runCount === 1 && summary.completedCount === 1 && summary.errorCount === 0, 'canary counts mismatch');
assert(summary.providerProfiles[0]?.label === 'openai:gpt-5.4-nano', 'provider/model mismatch');
assert(summary.strictCaps.maxSteps === 3 && summary.strictCaps.maxOutputTokens === 256 && summary.strictCaps.timeoutMs === 60000 && summary.strictCaps.retryCount === 0, 'strict caps mismatch');
const result = summary.modelResults[0];
assert(result?.provider === 'openai' && result.model === 'gpt-5.4-nano', 'model result mismatch');
assert(result.metricSupport.accuracy === 'supported' && typeof result.accuracyPercent === 'number', 'accuracy should be supported from score artifacts');
assert(result.metricSupport.speed === 'unsupported' && typeof result.averageDurationSeconds === 'number' && result.averageDurationSeconds > 0 && result.averageDurationSeconds < 0.1, 'near-zero canary duration should be recorded but rejected as unsupported provider roundtrip speed');
assert(result.metricSupport.cost === 'unsupported', 'cost should remain unsupported when provider usage is absent');
assert(result.usageSummary.totalTokens === 0 && result.usageSummary.costUsd === 0 && result.totalCostUsd === 0, 'canary should expose zero usage only as unsupported, not as real cost');
const publicResult = readJson<PublicResult>(PUBLIC_RESULT_PATH);
assert(!publicResult.label.includes('phase-66-t454-real-metrics-canary'), 'canary must not be public-synced');
assert(hasNoLiveSentinel(), 'T407 sentinel missing');
safeScan(CANARY_SUMMARY_PATH);
console.log('T454 real-metrics canary: blocked-for-public-sync costUsageUnsupported=true nearZeroSpeedUnsupported=true accuracySupported=true publicResultPreserved=true');
