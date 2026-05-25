#!/usr/bin/env node
export {};

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// @ts-expect-error Runtime TUI uses Node strip-types with explicit TypeScript extensions.
import { parseThinkingLevel, type ThinkingLevel } from '../adapters/thinkingLevel.ts';
// @ts-expect-error Runtime TUI uses Node strip-types with explicit TypeScript extensions.
import { runGatedLiveSmoke } from '../live/liveSmoke.ts';
// @ts-expect-error Runtime TUI uses Node strip-types with explicit TypeScript extensions.
import { buildLeaderboardModelRow, type LeaderboardAttemptRecord } from '../scoring/leaderboardAggregate.ts';
import type { LeaderboardScoreBundle } from '../scoring/leaderboardScoreBundle.ts';

type ScenarioEntry = { scenarioId: string; path: string };
type Manifest = { id: string; version: string; scenarioCount: number; scenarios: ScenarioEntry[] };
type Plan = { allScenarioIds: string[] };
type ScenarioJson = {
	scenarioId: string;
	title?: string;
	packVersion?: string;
	tags?: string[];
	public: { maxSteps: number; maxTokens?: number };
};
type Scenario = {
	scenarioId: string;
	title: string;
	path: string;
	variant: 'clean' | 'attacked';
	classes: string[];
	maxSteps: number;
	maxTokens: number;
};
type UsageSummary = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; costUsd: number };

export type OfficialLeaderboardSummary = {
	schemaVersion: 1;
	kind: 'cog-contain-official-leaderboard-summary';
	label: string;
	createdAt: string;
	mode: 'official-leaderboard';
	runProtocol: 'official-leaderboard-v1';
	scoreKind: 'leaderboard-score-v1';
	pack: string;
	suiteVersion: string;
	provider: string;
	model: string;
	thinkingLevel?: ThinkingLevel;
	status: 'pass' | 'blocked' | 'completed_with_errors';
	liveCalls: boolean;
	envRead: boolean;
	hiddenEvalAccess: false;
	official: false;
	leaderboardEligible: false;
	fullLowerBoundRunExecuted: boolean;
	artifactRoot: string;
	scenarioCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number };
	variantCounts: Record<string, number>;
	modelResults: ReturnType<typeof buildLeaderboardModelRow>[];
	attempts: {
		scenarioId: string;
		title: string;
		variant: 'clean' | 'attacked';
		provider: string;
		model: string;
		runId?: string;
		artifactDir?: string;
		status: string;
		toolCallCount?: number;
		leaderboardScorePercent?: number;
	}[];
	caveats: string[];
};

const hiddenManifestPath = 'scenario-packs/official-hidden/benchmark-v1/manifest.json';
const lowerBoundPlanPath = 'artifacts/run-plans/phase-57-public-dev-lower-bound-live-qa-plan/plan.json';
const defaultOutDir = 'artifacts/tui/bench-publish-leaderboard/official-leaderboard-run';

function argValue(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(name);
	return index >= 0 ? argv[index + 1] : undefined;
}
function hasFlag(argv: string[], name: string): boolean {
	return argv.includes(name);
}
function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
	const parsed = Number(value ?? fallback);
	if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
	return parsed;
}
function parseProfile(profile: string): { provider: string; model: string } {
	const splitAt = profile.indexOf(':');
	if (splitAt <= 0 || splitAt === profile.length - 1) throw new Error(`provider profile must be provider:model, got ${profile}`);
	return { provider: profile.slice(0, splitAt), model: profile.slice(splitAt + 1) };
}
function safeSlug(input: string): string {
	return input.replace(/[^a-zA-Z0-9_.-]/g, '-');
}
async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf8')) as T;
}
async function writeJson(path: string, value: unknown): Promise<void> {
	const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
	await mkdir(dir, { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function countBy(items: string[]): Record<string, number> {
	return items.reduce((acc, item) => {
		acc[item] = (acc[item] ?? 0) + 1;
		return acc;
	}, {} as Record<string, number>);
}
function progressLine(done: number, total: number): string {
	const width = 34;
	const ratio = total > 0 ? done / total : 0;
	const filled = Math.round(width * ratio);
	return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${Math.round(ratio * 100)}% (${done}/${total})`;
}

async function loadHiddenScenarios(limit: number): Promise<{ scenarios: Scenario[]; suiteVersion: string }> {
	const manifest = await readJson<Manifest>(hiddenManifestPath);
	const plan = await readJson<Plan>(lowerBoundPlanPath);
	if (!Array.isArray(plan.allScenarioIds) || plan.allScenarioIds.length !== 40) {
		throw new Error('lower-bound plan allScenarioIds must contain 40 scenarios');
	}
	const selectedIds = plan.allScenarioIds.slice(0, limit);
	const scenarios: Scenario[] = [];
	for (const scenarioId of selectedIds) {
		const entry = manifest.scenarios.find((item) => item.scenarioId === scenarioId);
		if (entry === undefined) throw new Error(`hidden scenario missing from manifest: ${scenarioId}`);
		const path = `scenario-packs/official-hidden/benchmark-v1/${entry.path}`;
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
	return { scenarios, suiteVersion: manifest.version };
}

async function readAttemptRecord(dir: string, scenario: Scenario, provider: string, model: string, status: string): Promise<LeaderboardAttemptRecord> {
	const bundle = await readJson<LeaderboardScoreBundle>(join(dir, 'leaderboard-score.json'));
	const liveMetrics = await readJson<{ timing?: { durationMs?: unknown }; usageSummary?: Partial<UsageSummary> }>(join(dir, 'live-metrics.json'));
	const usage = liveMetrics.usageSummary ?? {};
	const attemptStatus =
		status === 'completed'
			? 'completed'
			: status.startsWith('blocked:')
				? 'blocked'
				: 'provider_or_runtime_error';
	return {
		scenarioId: scenario.scenarioId,
		runId: bundle.runId,
		attemptStatus,
		bundle,
		durationMs: typeof liveMetrics.timing?.durationMs === 'number' ? liveMetrics.timing.durationMs : 0,
		usageSummary: {
			inputTokens: Number(usage.inputTokens ?? 0),
			outputTokens: Number(usage.outputTokens ?? 0),
			cacheReadTokens: Number(usage.cacheReadTokens ?? 0),
			cacheWriteTokens: Number(usage.cacheWriteTokens ?? 0),
			totalTokens: Number(usage.totalTokens ?? 0),
			costUsd: Number(usage.costUsd ?? 0)
		}
	};
}

export async function runOfficialLeaderboard(argv: string[] = process.argv.slice(2)): Promise<OfficialLeaderboardSummary> {
	const label = argValue(argv, '--label') ?? 'official-leaderboard';
	const outDir = argValue(argv, '--out') ?? defaultOutDir;
	const { provider, model } = parseProfile(argValue(argv, '--providers') ?? 'openai:gpt-5.4-mini');
	const limit = parsePositiveInteger(argValue(argv, '--limit'), 40, 'limit');
	const timeoutMs = parsePositiveInteger(argValue(argv, '--timeout-ms'), 300000, 'timeoutMs');
	const thinkingLevel = parseThinkingLevel(argValue(argv, '--thinking-level'), 'off');
	const allowLive =
		hasFlag(argv, '--allow-live-provider-call') &&
		(hasFlag(argv, '--confirm-official-leaderboard') || hasFlag(argv, '--confirm-official-benchmark'));
	if (!allowLive) {
		throw new Error('official leaderboard requires --allow-live-provider-call and --confirm-official-leaderboard');
	}
	const { scenarios, suiteVersion } = await loadHiddenScenarios(limit);
	const attemptRecords: LeaderboardAttemptRecord[] = [];
	const attempts: OfficialLeaderboardSummary['attempts'] = [];
	let done = 0;
	console.log(`COG-CONTAIN official leaderboard quality benchmark`);
	console.log(`Label: ${label}`);
	console.log(`Provider/model: ${provider}/${model}`);
	console.log(`Scenarios: ${scenarios.length}, suite=${suiteVersion}, thinking=${thinkingLevel}`);
	for (const scenario of scenarios) {
		const runId = `${label}-${scenario.scenarioId}-${provider}-${safeSlug(model)}`;
		const artifactDir = join(outDir, 'live-artifacts', `${scenario.scenarioId}-${provider}-${safeSlug(model)}`);
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
			benchmarkMode: 'quality-benchmark',
			thinkingLevel
		});
		if (result.status === 'blocked') {
			attempts.push({
				scenarioId: scenario.scenarioId,
				title: scenario.title,
				variant: scenario.variant,
				provider,
				model,
				status: `blocked:${result.category}`
			});
		} else {
			const record = await readAttemptRecord(result.outDir, scenario, provider, model, result.status);
			attemptRecords.push(record);
			attempts.push({
				scenarioId: scenario.scenarioId,
				title: scenario.title,
				variant: scenario.variant,
				provider,
				model,
				runId: result.runId,
				artifactDir: result.outDir,
				status: result.status,
				toolCallCount: result.toolCallCount,
				leaderboardScorePercent: record.bundle.policyScenarioScore
			});
		}
		done += 1;
		console.log(progressLine(done, scenarios.length));
	}
	const maxSteps = Math.max(...scenarios.map((scenario) => scenario.maxSteps));
	const maxTokens = Math.max(...scenarios.map((scenario) => scenario.maxTokens));
	const row = buildLeaderboardModelRow({
		provider,
		model,
		runLabel: label,
		rowId: `official-leaderboard-${provider}-${safeSlug(model)}-${safeSlug(label)}`,
		thinkingLevel,
		attempts: attemptRecords,
		expectedScenarioCount: scenarios.length,
		expectedScenarioIds: scenarios.map((scenario) => scenario.scenarioId),
		sourceArtifactRoot: `private-official-artifacts/${safeSlug(label)}`,
		sourceSummary: `private-official-artifacts/${safeSlug(label)}/summary.json`
	});
	const summary: OfficialLeaderboardSummary = {
		schemaVersion: 1,
		kind: 'cog-contain-official-leaderboard-summary',
		label,
		createdAt: new Date().toISOString(),
		mode: 'official-leaderboard',
		runProtocol: 'official-leaderboard-v1',
		scoreKind: 'leaderboard-score-v1',
		pack: 'official-hidden-benchmark',
		suiteVersion,
		provider,
		model,
		...(thinkingLevel === 'off' ? {} : { thinkingLevel }),
		status:
			attemptRecords.length === 0
				? 'blocked'
				: attempts.some((attempt) => attempt.status !== 'completed')
					? 'completed_with_errors'
					: 'pass',
		liveCalls: attemptRecords.length > 0,
		envRead: attemptRecords.length > 0,
		hiddenEvalAccess: false,
		official: false,
		leaderboardEligible: false,
		fullLowerBoundRunExecuted: attemptRecords.length === 40,
		artifactRoot: outDir,
		scenarioCount: scenarios.length,
		runCount: attempts.length,
		completedCount: attempts.filter((attempt) => attempt.status === 'completed').length,
		errorCount: attempts.filter((attempt) => attempt.status !== 'completed' && !attempt.status.startsWith('blocked:')).length,
		strictCaps: { maxSteps, maxOutputTokens: maxTokens, timeoutMs, retryCount: 0 },
		variantCounts: countBy(attempts.map((attempt) => attempt.variant)),
		modelResults: [row],
		attempts,
		caveats: [
			'Private official hidden-suite quality benchmark summary; not public until sanitized aggregate is published.',
			'Primary score uses leaderboard-score-v1 scenario utility protocol, not live-smoke accuracy.',
			'Raw artifacts remain private; only sanitized aggregate may be published.'
		]
	};
	await writeJson(join(outDir, 'summary.json'), summary);
	return summary;
}

if (process.argv[1]?.endsWith('cogContainOfficialLeaderboard.ts')) {
	try {
		await runOfficialLeaderboard();
	} catch (error) {
		console.error(`COG-CONTAIN official leaderboard failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
