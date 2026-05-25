#!/usr/bin/env node
export {};

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// @ts-expect-error Runtime TUI uses Node strip-types with explicit TypeScript extensions.
import { runGatedLiveSmoke } from '../live/liveSmoke.ts';

type ScenarioEntry = { scenarioId: string; path: string };
type Manifest = { id: string; version: string; scenarioCount: number; scenarios: ScenarioEntry[] };
type Plan = { allScenarioIds: string[] };
type ScenarioJson = { scenarioId: string; title?: string; packVersion?: string; tags?: string[]; public: { maxSteps: number; maxTokens?: number } };
type Scenario = { scenarioId: string; title: string; path: string; variant: 'clean' | 'attacked'; classes: string[]; maxSteps: number; maxTokens: number };
type UsageSummary = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; costUsd: number };
type AttemptMetrics = {
	runScoreStatus?: string;
	objectiveCompletionScore: number | null;
	weightedAttackSuccessRate: number | null;
	attackResistanceScore: number | null;
	rawScenarioUtilityScore: number | null;
	cappedScenarioUtilityScore: number | null;
	finalReportQualityScore: number | null;
	triggeredPenaltyCount: number;
	unsupportedPenaltyCount: number;
	hardCapCount: number;
	unsupportedItemCount: number;
	unsupportedScenarioUtilityCheckCount: number;
	unsupportedFinalReportQualityCheckCount: number;
};
type Attempt = {
	scenarioId: string;
	title: string;
	variant: 'clean' | 'attacked';
	classes: string[];
	repeatIndex: number;
	provider: string;
	model: string;
	runId?: string;
	artifactDir?: string;
	status: string;
	maxSteps: number;
	maxOutputTokens: number;
	timeoutMs: number;
	eventCount?: number;
	toolCallCount?: number;
	toolResultCount?: number;
	finalTick?: number;
	ended?: boolean;
	scoreStatus?: string;
	metrics?: AttemptMetrics;
	usageSummary?: UsageSummary;
	durationMs?: number;
};

type QualitySummary = {
	schemaVersion: 1;
	kind: 'cog-contain-quality-benchmark-summary';
	label: string;
	createdAt: string;
	mode: 'quality-benchmark';
	pack: string;
	provider: string;
	model: string;
	status: 'pass' | 'blocked' | 'completed_with_errors';
	liveCalls: boolean;
	envRead: boolean;
	hiddenEvalAccess: false;
	official: false;
	leaderboardEligible: false;
	fullLowerBoundRunExecuted: false;
	artifactRoot: string;
	scenarioCount: number;
	repeatCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	blockedCount: number;
	variantCounts: Record<string, number>;
	caps: { profile: 'scenario-native'; maxStepsRange: [number, number]; maxOutputTokensRange: [number, number]; timeoutMs: number; retryCount: 0 };
	qualityMetrics: {
		meanScenarioUtility: number | null;
		meanRawScenarioUtility: number | null;
		cleanUtility: number | null;
		utilityUnderAttack: number | null;
		supportedScenarioUtilityMean: number | null;
		scenarioUtilitySupportedCount: number;
		finalReportQualitySupportedCount: number;
		meanObjectiveCompletion: number | null;
		meanWeightedAttackSuccessRate: number | null;
		meanAttackResistance: number | null;
		meanFinalReportQuality: number | null;
		totalTriggeredPenaltyCount: number;
		totalHardCapCount: number;
		totalUnsupportedCheckCount: number;
	};
	reportMetrics: {
		accuracyPercent: number | null;
		totalCostUsd: number | null;
		averageDurationSeconds: number | null;
	};
	costSpeed: {
		totalTokens: number;
		inputTokens: number;
		outputTokens: number;
		totalCostUsd: number;
		averageDurationSeconds: number | null;
		minDurationSeconds: number | null;
		maxDurationSeconds: number | null;
	};
	repeatSummaries: { repeatIndex: number; runCount: number; meanScenarioUtility: number | null; cleanUtility: number | null; utilityUnderAttack: number | null; meanObjectiveCompletion: number | null; meanWeightedAttackSuccessRate: number | null; meanAttackResistance: number | null; meanFinalReportQuality: number | null; totalCostUsd: number; totalTokens: number; averageDurationSeconds: number | null }[];
	scenarioSummaries: { scenarioId: string; title: string; variant: 'clean' | 'attacked'; runCount: number; scenarioUtilitySupportedCount: number; meanScenarioUtility: number | null; meanObjectiveCompletion: number | null; meanWeightedAttackSuccessRate: number | null; meanAttackResistance: number | null; meanFinalReportQuality: number | null; triggeredPenaltyCount: number; hardCapCount: number }[];
	confidenceIntervals: Record<string, { n: number; mean: number | null; lower95: number | null; upper95: number | null }>;
	attempts: Attempt[];
	caveats: string[];
};

const lowerBoundPlanPath = 'artifacts/run-plans/phase-57-public-dev-lower-bound-live-qa-plan/plan.json';
const defaultManifestRoot = 'scenario-packs/public-dev';
const defaultOutDir = 'artifacts/tui/phase-79-gpt-5-4-mini-quality-benchmark-zero-repeat';
const defaultProvider = 'openai:gpt-5.4-mini';

function argValue(argv: string[], name: string): string | undefined { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; }
function hasFlag(argv: string[], name: string): boolean { return argv.includes(name); }
function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number { const parsed = Number(value ?? fallback); if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`); return parsed; }
function parseNonNegativeInteger(value: string | undefined, fallback: number, name: string): number { const parsed = Number(value ?? fallback); if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`); return parsed; }
function parseProfile(profile: string): { provider: string; model: string } { const splitAt = profile.indexOf(':'); if (splitAt <= 0 || splitAt === profile.length - 1) throw new Error(`provider profile must be provider:model, got ${profile}`); return { provider: profile.slice(0, splitAt), model: profile.slice(splitAt + 1) }; }
function safeSlug(input: string): string { return input.replace(/[^a-zA-Z0-9_.-]/g, '-'); }
async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }
async function writeJson(path: string, value: unknown): Promise<void> { const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.'; await mkdir(dir, { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function mean(values: (number | null | undefined)[]): number | null { const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)); return finite.length === 0 ? null : finite.reduce((sum, value) => sum + value, 0) / finite.length; }
function meanWithNullAsZero(values: (number | null | undefined)[]): number | null { if (values.length === 0) return null; let total = 0; for (const value of values) total += typeof value === 'number' && Number.isFinite(value) ? value : 0; return total / values.length; }
function attemptAccuracy(attempt: Attempt): number | null { return mean([attempt.metrics?.objectiveCompletionScore, attempt.metrics?.attackResistanceScore]); }
function minOrNull(values: number[]): number | null { return values.length === 0 ? null : Math.min(...values); }
function maxOrNull(values: number[]): number | null { return values.length === 0 ? null : Math.max(...values); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function countBy(items: string[]): Record<string, number> { return items.reduce((acc, item) => { acc[item] = (acc[item] ?? 0) + 1; return acc; }, {} as Record<string, number>); }
function numberOrZero(value: number | null | undefined): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> { const map = new Map<string, T[]>(); for (const item of items) { const key = keyFn(item); map.set(key, [...(map.get(key) ?? []), item]); } return map; }
function ci95(values: number[]): { n: number; mean: number | null; lower95: number | null; upper95: number | null } { const n = values.length; if (n === 0) return { n, mean: null, lower95: null, upper95: null }; const avg = values.reduce((total, value) => total + value, 0) / n; if (n === 1) return { n, mean: avg, lower95: avg, upper95: avg }; const variance = values.reduce((total, value) => total + (value - avg) ** 2, 0) / (n - 1); const margin = 1.96 * Math.sqrt(variance / n); return { n, mean: avg, lower95: avg - margin, upper95: avg + margin }; }

async function findScenarioPaths(): Promise<Map<string, string>> {
	const versions = (await readdir(defaultManifestRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
	const byId = new Map<string, string>();
	for (const version of versions) {
		const manifestPath = `${defaultManifestRoot}/${version}/manifest.json`;
		try {
			const manifest = await readJson<Manifest>(manifestPath);
			for (const entry of manifest.scenarios) byId.set(entry.scenarioId, `${defaultManifestRoot}/${version}/${entry.path}`);
		} catch (error) {
			if ((error as { code?: string }).code !== 'ENOENT') throw error;
		}
	}
	return byId;
}

async function loadScenarios(limit: number): Promise<Scenario[]> {
	const plan = await readJson<Plan>(lowerBoundPlanPath);
	const byId = await findScenarioPaths();
	const selectedIds = plan.allScenarioIds.slice(0, limit);
	const scenarios: Scenario[] = [];
	for (const scenarioId of selectedIds) {
		const path = byId.get(scenarioId);
		if (path === undefined) throw new Error(`scenario missing from source-local packs: ${scenarioId}`);
		const scenario = await readJson<ScenarioJson>(path);
		const tags = scenario.tags ?? [];
		const variant: 'clean' | 'attacked' = tags.some((tag) => tag === 'clean' || tag === 'clean-only') ? 'clean' : 'attacked';
		scenarios.push({
			scenarioId,
			title: scenario.title ?? scenarioId,
			path,
			variant,
			classes: tags.filter((tag) => !['public-dev', 'draft-expansion', 'clean', 'clean-only', 'attacked'].includes(tag)),
			maxSteps: scenario.public.maxSteps,
			maxTokens: scenario.public.maxTokens ?? 12000
		});
	}
	return scenarios;
}

async function readAttemptMetrics(dir: string): Promise<{ metrics: AttemptMetrics; usageSummary: UsageSummary; durationMs: number }> {
	const scoreReport = await readJson<{ metrics?: Partial<AttemptMetrics> }>(join(dir, 'score-report.json'));
	const liveMetrics = await readJson<{ timing?: { durationMs?: unknown }; usageSummary?: Partial<UsageSummary> }>(join(dir, 'live-metrics.json'));
	const metrics = scoreReport.metrics ?? {};
	const usage = liveMetrics.usageSummary ?? {};
	return {
		metrics: {
			...(typeof metrics.runScoreStatus === 'string' ? { runScoreStatus: metrics.runScoreStatus } : {}),
			objectiveCompletionScore: typeof metrics.objectiveCompletionScore === 'number' ? metrics.objectiveCompletionScore : null,
			weightedAttackSuccessRate: typeof metrics.weightedAttackSuccessRate === 'number' ? metrics.weightedAttackSuccessRate : null,
			attackResistanceScore: typeof metrics.attackResistanceScore === 'number' ? metrics.attackResistanceScore : null,
			rawScenarioUtilityScore: typeof metrics.rawScenarioUtilityScore === 'number' ? metrics.rawScenarioUtilityScore : null,
			cappedScenarioUtilityScore: typeof metrics.cappedScenarioUtilityScore === 'number' ? metrics.cappedScenarioUtilityScore : null,
			finalReportQualityScore: typeof metrics.finalReportQualityScore === 'number' ? metrics.finalReportQualityScore : null,
			triggeredPenaltyCount: Number(metrics.triggeredPenaltyCount ?? 0),
			unsupportedPenaltyCount: Number(metrics.unsupportedPenaltyCount ?? 0),
			hardCapCount: Number(metrics.hardCapCount ?? 0),
			unsupportedItemCount: Number(metrics.unsupportedItemCount ?? 0),
			unsupportedScenarioUtilityCheckCount: Number(metrics.unsupportedScenarioUtilityCheckCount ?? 0),
			unsupportedFinalReportQualityCheckCount: Number(metrics.unsupportedFinalReportQualityCheckCount ?? 0)
		},
		usageSummary: {
			inputTokens: Number(usage.inputTokens ?? 0),
			outputTokens: Number(usage.outputTokens ?? 0),
			cacheReadTokens: Number(usage.cacheReadTokens ?? 0),
			cacheWriteTokens: Number(usage.cacheWriteTokens ?? 0),
			totalTokens: Number(usage.totalTokens ?? 0),
			costUsd: Number(usage.costUsd ?? 0)
		},
		durationMs: typeof liveMetrics.timing?.durationMs === 'number' ? liveMetrics.timing.durationMs : 0
	};
}

function progressLine(done: number, total: number): string { const width = 34; const ratio = total > 0 ? done / total : 0; const filled = Math.round(width * ratio); return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${Math.round(ratio * 100)}% (${done}/${total})`; }

function buildSummary(input: { label: string; outDir: string; provider: string; model: string; scenarios: Scenario[]; repeats: number; timeoutMs: number; attempts: Attempt[] }): QualitySummary {
	const completed = input.attempts.filter((attempt) => attempt.status === 'completed');
	const blockedCount = input.attempts.filter((attempt) => attempt.status.startsWith('blocked:')).length;
	const durations = completed.map((attempt) => attempt.durationMs ?? 0).filter((value) => value > 0);
	const usage = completed.map((attempt) => attempt.usageSummary).filter((value): value is UsageSummary => value !== undefined);
	const utility = completed.map((attempt) => attempt.metrics?.cappedScenarioUtilityScore);
	const rawUtility = completed.map((attempt) => attempt.metrics?.rawScenarioUtilityScore);
	const cleanUtility = completed.filter((attempt) => attempt.variant === 'clean').map((attempt) => attempt.metrics?.cappedScenarioUtilityScore);
	const attackedUtility = completed.filter((attempt) => attempt.variant === 'attacked').map((attempt) => attempt.metrics?.cappedScenarioUtilityScore);
	const unsupportedChecks = completed.map((attempt) => (attempt.metrics?.unsupportedItemCount ?? 0) + (attempt.metrics?.unsupportedPenaltyCount ?? 0) + (attempt.metrics?.unsupportedScenarioUtilityCheckCount ?? 0) + (attempt.metrics?.unsupportedFinalReportQualityCheckCount ?? 0));
	const maxStepsValues = input.scenarios.map((scenario) => scenario.maxSteps);
	const maxTokenValues = input.scenarios.map((scenario) => scenario.maxTokens);
	const repeatSummaries = [...groupBy(completed, (attempt) => String(attempt.repeatIndex)).entries()].map(([repeatIndex, attempts]) => {
		const repeatUsage = attempts.map((attempt) => attempt.usageSummary).filter((value): value is UsageSummary => value !== undefined);
		const repeatDurations = attempts.map((attempt) => attempt.durationMs ?? 0).filter((value) => value > 0);
		return { repeatIndex: Number(repeatIndex), runCount: attempts.length, meanScenarioUtility: meanWithNullAsZero(attempts.map((attempt) => attempt.metrics?.cappedScenarioUtilityScore)), cleanUtility: meanWithNullAsZero(attempts.filter((attempt) => attempt.variant === 'clean').map((attempt) => attempt.metrics?.cappedScenarioUtilityScore)), utilityUnderAttack: meanWithNullAsZero(attempts.filter((attempt) => attempt.variant === 'attacked').map((attempt) => attempt.metrics?.cappedScenarioUtilityScore)), meanObjectiveCompletion: mean(attempts.map((attempt) => attempt.metrics?.objectiveCompletionScore)), meanWeightedAttackSuccessRate: mean(attempts.map((attempt) => attempt.metrics?.weightedAttackSuccessRate)), meanAttackResistance: mean(attempts.map((attempt) => attempt.metrics?.attackResistanceScore)), meanFinalReportQuality: mean(attempts.map((attempt) => attempt.metrics?.finalReportQualityScore)), totalCostUsd: repeatUsage.reduce((total, item) => total + item.costUsd, 0), totalTokens: sum(repeatUsage.map((item) => item.totalTokens)), averageDurationSeconds: mean(repeatDurations.map((value) => value / 1000)) };
	}).sort((left, right) => left.repeatIndex - right.repeatIndex);
	const scenarioSummaries = [...groupBy(completed, (attempt) => attempt.scenarioId).entries()].map(([scenarioId, attempts]) => ({ scenarioId, title: attempts[0]?.title ?? scenarioId, variant: attempts[0]?.variant ?? 'attacked', runCount: attempts.length, scenarioUtilitySupportedCount: attempts.filter((attempt) => typeof attempt.metrics?.cappedScenarioUtilityScore === 'number').length, meanScenarioUtility: meanWithNullAsZero(attempts.map((attempt) => attempt.metrics?.cappedScenarioUtilityScore)), meanObjectiveCompletion: mean(attempts.map((attempt) => attempt.metrics?.objectiveCompletionScore)), meanWeightedAttackSuccessRate: mean(attempts.map((attempt) => attempt.metrics?.weightedAttackSuccessRate)), meanAttackResistance: mean(attempts.map((attempt) => attempt.metrics?.attackResistanceScore)), meanFinalReportQuality: mean(attempts.map((attempt) => attempt.metrics?.finalReportQualityScore)), triggeredPenaltyCount: sum(attempts.map((attempt) => attempt.metrics?.triggeredPenaltyCount ?? 0)), hardCapCount: sum(attempts.map((attempt) => attempt.metrics?.hardCapCount ?? 0)) })).sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
	const confidenceIntervals = {
		meanScenarioUtility: ci95(completed.map((attempt) => numberOrZero(attempt.metrics?.cappedScenarioUtilityScore))),
		cleanUtility: ci95(completed.filter((attempt) => attempt.variant === 'clean').map((attempt) => numberOrZero(attempt.metrics?.cappedScenarioUtilityScore))),
		utilityUnderAttack: ci95(completed.filter((attempt) => attempt.variant === 'attacked').map((attempt) => numberOrZero(attempt.metrics?.cappedScenarioUtilityScore))),
		objectiveCompletion: ci95(completed.map((attempt) => numberOrZero(attempt.metrics?.objectiveCompletionScore))),
		weightedAttackSuccessRate: ci95(completed.filter((attempt) => attempt.variant === 'attacked').map((attempt) => numberOrZero(attempt.metrics?.weightedAttackSuccessRate))),
		attackResistance: ci95(completed.filter((attempt) => attempt.variant === 'attacked').map((attempt) => numberOrZero(attempt.metrics?.attackResistanceScore))),
		finalReportQuality: ci95(completed.map((attempt) => numberOrZero(attempt.metrics?.finalReportQualityScore)))
	};
	return {
		schemaVersion: 1,
		kind: 'cog-contain-quality-benchmark-summary',
		label: input.label,
		createdAt: new Date().toISOString(),
		mode: 'quality-benchmark',
		pack: 'public-dev-lower-bound@phase-57-source-local',
		provider: input.provider,
		model: input.model,
		status: blockedCount > 0 && completed.length === 0 ? 'blocked' : input.attempts.some((attempt) => attempt.status !== 'completed') ? 'completed_with_errors' : 'pass',
		liveCalls: completed.length > 0,
		envRead: completed.length > 0,
		hiddenEvalAccess: false,
		official: false,
		leaderboardEligible: false,
		fullLowerBoundRunExecuted: false,
		artifactRoot: input.outDir,
		scenarioCount: input.scenarios.length,
		repeatCount: input.repeats,
		runCount: input.attempts.length,
		completedCount: completed.length,
		errorCount: input.attempts.filter((attempt) => attempt.status !== 'completed' && !attempt.status.startsWith('blocked:')).length,
		blockedCount,
		variantCounts: countBy(input.attempts.map((attempt) => attempt.variant)),
		caps: { profile: 'scenario-native', maxStepsRange: [Math.min(...maxStepsValues), Math.max(...maxStepsValues)], maxOutputTokensRange: [Math.min(...maxTokenValues), Math.max(...maxTokenValues)], timeoutMs: input.timeoutMs, retryCount: 0 },
		qualityMetrics: {
			meanScenarioUtility: meanWithNullAsZero(utility),
			meanRawScenarioUtility: meanWithNullAsZero(rawUtility),
			cleanUtility: meanWithNullAsZero(cleanUtility),
			utilityUnderAttack: meanWithNullAsZero(attackedUtility),
			supportedScenarioUtilityMean: mean(utility),
			scenarioUtilitySupportedCount: utility.filter((value) => typeof value === 'number' && Number.isFinite(value)).length,
			finalReportQualitySupportedCount: completed.filter((attempt) => typeof attempt.metrics?.finalReportQualityScore === 'number').length,
			meanObjectiveCompletion: mean(completed.map((attempt) => attempt.metrics?.objectiveCompletionScore)),
			meanWeightedAttackSuccessRate: mean(completed.map((attempt) => attempt.metrics?.weightedAttackSuccessRate)),
			meanAttackResistance: mean(completed.map((attempt) => attempt.metrics?.attackResistanceScore)),
			meanFinalReportQuality: mean(completed.map((attempt) => attempt.metrics?.finalReportQualityScore)),
			totalTriggeredPenaltyCount: sum(completed.map((attempt) => attempt.metrics?.triggeredPenaltyCount ?? 0)),
			totalHardCapCount: sum(completed.map((attempt) => attempt.metrics?.hardCapCount ?? 0)),
			totalUnsupportedCheckCount: sum(unsupportedChecks)
		},
		reportMetrics: {
			accuracyPercent: mean(completed.map(attemptAccuracy)),
			totalCostUsd: usage.length > 0 ? usage.reduce((total, item) => total + item.costUsd, 0) : null,
			averageDurationSeconds: mean(durations.map((value) => value / 1000))
		},
		costSpeed: {
			totalTokens: sum(usage.map((item) => item.totalTokens)),
			inputTokens: sum(usage.map((item) => item.inputTokens)),
			outputTokens: sum(usage.map((item) => item.outputTokens)),
			totalCostUsd: usage.reduce((total, item) => total + item.costUsd, 0),
			averageDurationSeconds: mean(durations.map((value) => value / 1000)),
			minDurationSeconds: minOrNull(durations.map((value) => value / 1000)),
			maxDurationSeconds: maxOrNull(durations.map((value) => value / 1000))
		},
		repeatSummaries,
		scenarioSummaries,
		confidenceIntervals,
		attempts: input.attempts,
		caveats: [
			'Source-local public-dev quality benchmark over the existing scenario pack only; no hidden official eval access.',
			'Scenario-native maxSteps/maxTokens are used to avoid the prior 3-step/256-token live-smoke constraint.',
			'Artifacts are sanitized and omit raw provider payloads/text/IDs, raw tool arguments/observations, private scenario JSON, env values, and secrets.',
			'official=false, leaderboardEligible=false, fullLowerBoundRunExecuted=false; this is not final public-ready/deploy/signoff evidence.'
		]
	};
}

export async function runQualityBenchmark(argv: string[] = process.argv.slice(2)): Promise<QualitySummary> {
	const label = argValue(argv, '--label') ?? 'quality-benchmark';
	const outDir = argValue(argv, '--out') ?? defaultOutDir;
	const { provider, model } = parseProfile(argValue(argv, '--providers') ?? defaultProvider);
	const limit = parsePositiveInteger(argValue(argv, '--limit'), 40, 'limit');
	const repeats = parseNonNegativeInteger(argValue(argv, '--repeats'), 0, 'repeats');
	const timeoutMs = parsePositiveInteger(argValue(argv, '--timeout-ms'), 300000, 'timeoutMs');
	const allowLive = hasFlag(argv, '--allow-live-provider-call') && hasFlag(argv, '--confirm-quality-benchmark');
	if (!allowLive) throw new Error('quality benchmark requires both --allow-live-provider-call and --confirm-quality-benchmark');
	const scenarios = await loadScenarios(limit);
	const attempts: Attempt[] = [];
	const total = scenarios.length * (repeats + 1);
	let done = 0;
	console.log(`COG-CONTAIN quality benchmark`);
	console.log(`Label: ${label}`);
	console.log(`Provider/model: ${provider}/${model}`);
	console.log(`Plan: ${scenarios.length} scenarios, ${repeats} repeat(s), ${total} attempts`);
	console.log(`Caps: maxSteps=${Math.min(...scenarios.map((s) => s.maxSteps))}..${Math.max(...scenarios.map((s) => s.maxSteps))} maxOutputTokens=${Math.min(...scenarios.map((s) => s.maxTokens))}..${Math.max(...scenarios.map((s) => s.maxTokens))} timeoutMs=${timeoutMs} retryCount=0`);
	for (let repeatIndex = 0; repeatIndex <= repeats; repeatIndex += 1) {
		for (const scenario of scenarios) {
			const repeatSegment = repeatIndex === 0 ? 'base' : `repeat-${repeatIndex}`;
			const runId = `phase-79-quality-${repeatSegment}-${scenario.scenarioId}-${provider}-${safeSlug(model)}`;
			const artifactDir = join(outDir, 'live-artifacts', repeatSegment, `${scenario.scenarioId}-${provider}-${safeSlug(model)}`);
			const result = await runGatedLiveSmoke({
				provider,
				modelId: model,
				scenarioPath: scenario.path,
				outDir: artifactDir,
				runId,
				maxSteps: scenario.maxSteps,
				maxOutputTokens: scenario.maxTokens,
				timeoutMs,
				retryCount: 0,
				allowLiveProviderCall: true,
				overwrite: true,
				benchmarkMode: 'quality-benchmark'
			});
			if (result.status === 'blocked') {
				attempts.push({ scenarioId: scenario.scenarioId, title: scenario.title, variant: scenario.variant, classes: scenario.classes, repeatIndex, provider, model, status: `blocked:${result.category}`, maxSteps: scenario.maxSteps, maxOutputTokens: scenario.maxTokens, timeoutMs });
				done += 1;
				console.log(progressLine(done, total));
				continue;
			}
			let metrics: Awaited<ReturnType<typeof readAttemptMetrics>> | undefined;
			try { metrics = await readAttemptMetrics(result.outDir); } catch { metrics = undefined; }
			attempts.push({
				scenarioId: scenario.scenarioId,
				title: scenario.title,
				variant: scenario.variant,
				classes: scenario.classes,
				repeatIndex,
				provider,
				model,
				runId: result.runId,
				artifactDir: result.outDir,
				status: result.status,
				maxSteps: scenario.maxSteps,
				maxOutputTokens: scenario.maxTokens,
				timeoutMs,
				eventCount: result.eventCount,
				toolCallCount: result.toolCallCount,
				toolResultCount: result.toolResultCount,
				finalTick: result.finalTick,
				ended: result.ended,
				scoreStatus: result.scoreStatus,
				...(metrics === undefined ? {} : { metrics: metrics.metrics, usageSummary: metrics.usageSummary, durationMs: metrics.durationMs })
			});
			done += 1;
			console.log(progressLine(done, total));
		}
	}
	const summary = buildSummary({ label, outDir, provider, model, scenarios, repeats, timeoutMs, attempts });
	await writeJson(join(outDir, 'summary.json'), summary);
	return summary;
}

if (process.argv[1]?.endsWith('cogContainQualityBenchmark.ts')) {
	try { await runQualityBenchmark(); } catch (error) { console.error(`COG-CONTAIN quality benchmark failed: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
}
