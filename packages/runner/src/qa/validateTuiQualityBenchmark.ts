import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SUMMARY_PATH = 'artifacts/tui/phase-79-gpt-5-4-mini-quality-benchmark-zero-repeat/summary.json';
const LOG_PATH = 'artifacts/tui/phase-79-gpt-5-4-mini-quality-benchmark-zero-repeat/tui-progress.log';

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function readText(path: string): string { return readFileSync(join(ROOT, path), 'utf8'); }
function readJson<T>(path: string): T { return JSON.parse(readText(path)) as T; }

type Summary = {
	kind: string;
	mode: string;
	provider: string;
	model: string;
	status: string;
	liveCalls: boolean;
	envRead: boolean;
	hiddenEvalAccess: boolean;
	official: boolean;
	leaderboardEligible: boolean;
	fullLowerBoundRunExecuted: boolean;
	scenarioCount: number;
	repeatCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	blockedCount: number;
	variantCounts: Record<string, number>;
	caps: { profile: string; maxStepsRange: [number, number]; maxOutputTokensRange: [number, number]; timeoutMs: number; retryCount: number };
	qualityMetrics: {
		meanScenarioUtility: number | null;
		cleanUtility: number | null;
		utilityUnderAttack: number | null;
		scenarioUtilitySupportedCount: number;
		finalReportQualitySupportedCount: number;
		meanObjectiveCompletion: number | null;
		meanWeightedAttackSuccessRate: number | null;
		meanAttackResistance: number | null;
		meanFinalReportQuality: number | null;
	};
	reportMetrics?: { accuracyPercent: number | null; totalCostUsd: number | null; averageDurationSeconds: number | null };
	costSpeed: { totalTokens: number; totalCostUsd: number; averageDurationSeconds: number | null; minDurationSeconds: number | null; maxDurationSeconds: number | null };
	attempts: { status: string; repeatIndex?: number; maxSteps: number; maxOutputTokens: number; toolCallCount?: number; metrics?: { cappedScenarioUtilityScore?: number | null; finalReportQualityScore?: number | null } }[];
};

const summary = readJson<Summary>(SUMMARY_PATH);
assert(summary.kind === 'cog-contain-quality-benchmark-summary', 'summary kind mismatch');
assert(summary.mode === 'quality-benchmark', 'mode mismatch');
assert(summary.provider === 'openai' && summary.model === 'gpt-5.4-mini', 'model mismatch');
assert(summary.status === 'pass', 'quality benchmark did not pass');
assert(summary.liveCalls === true && summary.envRead === true, 'live/env flags mismatch');
assert(summary.hiddenEvalAccess === false && summary.official === false && summary.leaderboardEligible === false && summary.fullLowerBoundRunExecuted === false, 'claim guardrail flag mismatch');
assert(summary.scenarioCount === 40 && summary.repeatCount === 0 && summary.runCount === 40 && summary.completedCount === 40 && summary.errorCount === 0 && summary.blockedCount === 0, 'count mismatch');
assert(summary.variantCounts.attacked === 30 && summary.variantCounts.clean === 10, 'variant count mismatch');
assert(summary.caps.profile === 'scenario-native', 'cap profile mismatch');
assert(summary.caps.maxStepsRange[0] === 11 && summary.caps.maxStepsRange[1] === 14, 'maxSteps range mismatch');
assert(summary.caps.maxOutputTokensRange[0] === 9000 && summary.caps.maxOutputTokensRange[1] === 12000, 'maxOutputTokens range mismatch');
assert(summary.caps.timeoutMs === 300000 && summary.caps.retryCount === 0, 'timeout/retry caps mismatch');
assert(summary.qualityMetrics.scenarioUtilitySupportedCount >= 39, 'too few supported scenario utility scores');
assert(summary.qualityMetrics.finalReportQualitySupportedCount >= 39, 'too few supported final-report scores');
for (const key of ['meanScenarioUtility', 'cleanUtility', 'utilityUnderAttack', 'meanObjectiveCompletion', 'meanWeightedAttackSuccessRate', 'meanAttackResistance', 'meanFinalReportQuality'] as const) {
	const value = summary.qualityMetrics[key];
	assert(typeof value === 'number' && Number.isFinite(value), `${key} missing`);
}
assert(summary.costSpeed.totalTokens > 0 && summary.costSpeed.totalCostUsd > 0, 'cost/token metrics missing');
assert(typeof summary.costSpeed.averageDurationSeconds === 'number' && summary.costSpeed.averageDurationSeconds > 0, 'speed metric missing');
assert(typeof summary.reportMetrics?.accuracyPercent === 'number' && summary.reportMetrics.accuracyPercent > 0, 'reported accuracy missing');
assert(summary.reportMetrics.totalCostUsd === summary.costSpeed.totalCostUsd, 'reported cost mismatch');
assert(summary.reportMetrics.averageDurationSeconds === summary.costSpeed.averageDurationSeconds, 'reported speed mismatch');
assert(summary.attempts.length === 40 && summary.attempts.every((attempt) => attempt.status === 'completed'), 'attempt status mismatch');
assert(summary.attempts.every((attempt) => (attempt.repeatIndex ?? 0) === 0), 'attempts must be zero-repeat');
assert(summary.attempts.some((attempt) => (attempt.toolCallCount ?? 0) > 3), 'no multi-turn attempts observed');
assert(summary.attempts.every((attempt) => attempt.maxSteps >= 11 && attempt.maxSteps <= 14 && attempt.maxOutputTokens >= 9000 && attempt.maxOutputTokens <= 12000), 'attempt caps are not scenario-native');

const log = readText(LOG_PATH);
assert(log.includes('COG-CONTAIN quality benchmark'), 'progress log missing quality heading');
assert(log.includes('0 repeat(s)') && log.includes('100% (40/40)'), 'progress log missing zero-repeat completion');
assert(!/sk-[A-Za-z0-9_-]{20,}/.test(log), 'secret-like key found in progress log');
assert(!/Bearer\s+[A-Za-z0-9._-]{12,}/i.test(log), 'bearer-like token found in progress log');
assert(!/resp_[A-Za-z0-9_-]+/.test(log), 'raw response id found in progress log');

console.log(`T464 zero-repeat quality benchmark validator: ok runs=${summary.runCount} accuracy=${summary.reportMetrics?.accuracyPercent} cost=${summary.costSpeed.totalCostUsd} speed=${summary.costSpeed.averageDurationSeconds}`);
