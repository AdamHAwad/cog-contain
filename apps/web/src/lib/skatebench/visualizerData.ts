type MetricSupport = { accuracy: 'supported' | 'unsupported'; cost: 'supported' | 'unsupported'; speed: 'supported' | 'unsupported' };
type UsageSummary = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; costUsd: number };
export type PublicResultSummary = {
	schemaVersion: 1;
	kind: 'cog-contain-public-result-summary';
	label: string;
	createdAt: string;
	sourceMode: 'local-results' | 'mock-matrix' | 'live-smoke';
	pack: string;
	status: 'empty' | 'pass' | 'blocked';
	liveCapable: boolean;
	liveCalls: boolean;
	envRead: boolean;
	hiddenEvalAccess: boolean;
	official: boolean;
	leaderboardEligible: boolean;
	fullLowerBoundRunExecuted: boolean;
	artifactRoot: string;
	artifactRoots?: string[];
	sourceSummaryPath: string;
	sourceSummaries?: string[];
	providerProfiles: { provider: string; model: string; label: string; rowId?: string; thinkingLevel?: string; providerThinkingEffort?: string }[];
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number };
	scenarioCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	scoreStatusCounts: Record<string, number>;
	variantCounts: Record<string, number>;
	modelResults: {
		rowId?: string;
		runLabel?: string;
		resultLabel?: string;
		thinkingLevel?: string;
		providerThinkingEffort?: string;
		rank: number;
		model: string;
		provider: string;
		status: string;
		runs: number;
		completedRuns: number;
		errorRuns: number;
		accuracyPercent?: number | null;
		accuracySupportCount?: number;
		accuracySampleCount?: number;
		objectiveCompletionAverage?: number | null;
		attackResistanceAverage?: number | null;
		robustUtility: number;
		attackResistance: number;
		objectiveCompletion: number;
		overRefusal: number;
		averageDurationSeconds?: number | null;
		minDurationSeconds?: number | null;
		maxDurationSeconds?: number | null;
		totalCostUsd?: number | null;
		usageSummary?: Partial<UsageSummary>;
		metricSupport?: Partial<MetricSupport>;
		scoreStatusSummary: Record<string, number>;
	}[];
	caveats: string[];
};

export type VisualizerModelResult = {
	rowId: string;
	rank: number;
	model: string;
	provider: string;
	runLabel: string;
	thinkingLevel?: string;
	providerThinkingEffort?: string;
	accuracyPercent: number | null;
	accuracySupportCount: number;
	accuracySampleCount: number;
	objectiveCompletionAverage: number | null;
	attackResistanceAverage: number | null;
	runs: number;
	completedRuns: number;
	errorRuns: number;
	averageDurationSeconds: number | null;
	minDurationSeconds: number | null;
	maxDurationSeconds: number | null;
	totalCostUsd: number | null;
	usageSummary: UsageSummary;
	metricSupport: MetricSupport;
	scoreStatusSummary: Record<string, number>;
	status: 'representative_live_smoke' | 'mock_foundation' | 'live_smoke' | 'live_blocked';
	accent: 'green' | 'blue' | 'orange' | 'neutral';
};

export type VisualizerSnapshot = {
	metadata: {
		title: string;
		version: string;
		dataLabel: string;
		updated: string;
		modelCount: number;
		scenarioCount: number;
		runCount: number;
		completedCount: number;
		errorCount: number;
		sourceMode: PublicResultSummary['sourceMode'];
		liveCalls: boolean;
		envRead: boolean;
		hiddenEvalAccess: boolean;
		variantCounts: Record<string, number>;
		scoreStatusCounts: Record<string, number>;
		strictCaps: PublicResultSummary['strictCaps'];
		fullLowerBoundRunExecuted: boolean;
		official: boolean;
		leaderboardEligible: boolean;
		sourceSummaryPath: string;
		staticResultPath: string;
	};
	results: VisualizerModelResult[];
	caveats: string[];
};

function accentForRank(rank: number): VisualizerModelResult['accent'] {
	if (rank === 1) return 'green';
	if (rank === 2) return 'blue';
	if (rank === 3) return 'orange';
	return 'neutral';
}

function versionLabel(summary: PublicResultSummary): string {
	return summary.official ? 'OFFICIAL' : 'LOCAL';
}

function numberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function usageOrEmpty(value: unknown): UsageSummary {
	const input = (value ?? {}) as Partial<UsageSummary>;
	return {
		inputTokens: Number(input.inputTokens ?? 0),
		outputTokens: Number(input.outputTokens ?? 0),
		cacheReadTokens: Number(input.cacheReadTokens ?? 0),
		cacheWriteTokens: Number(input.cacheWriteTokens ?? 0),
		totalTokens: Number(input.totalTokens ?? 0),
		costUsd: Number(input.costUsd ?? 0)
	};
}

function supportOrFallback(value: unknown, result: { totalCostUsd?: unknown; averageDurationSeconds?: unknown; accuracyPercent?: unknown; usageSummary?: unknown }): MetricSupport {
	if (value === undefined || value === null) return { accuracy: 'unsupported', cost: 'unsupported', speed: 'unsupported' };
	const input = value as Partial<MetricSupport>;
	const usage = usageOrEmpty(result.usageSummary);
	return {
		accuracy: input.accuracy ?? (numberOrNull(result.accuracyPercent) === null ? 'unsupported' : 'supported'),
		cost: input.cost ?? (usage.totalTokens > 0 && numberOrNull(result.totalCostUsd) !== null && Number(result.totalCostUsd) > 0 ? 'supported' : 'unsupported'),
		speed: input.speed ?? (numberOrNull(result.averageDurationSeconds) === null || Number(result.averageDurationSeconds) < 0.1 ? 'unsupported' : 'supported')
	};
}

function asVisualizerResult(result: PublicResultSummary['modelResults'][number]): VisualizerModelResult {
	const status = result.status === 'live_smoke' || result.status === 'live_blocked' || result.status === 'representative_live_smoke' ? result.status : 'mock_foundation';
	const resultWithMetrics = result as typeof result & {
		rowId?: unknown;
		runLabel?: unknown;
		resultLabel?: unknown;
		thinkingLevel?: unknown;
		providerThinkingEffort?: unknown;
		accuracyPercent?: unknown;
		accuracySupportCount?: unknown;
		accuracySampleCount?: unknown;
		objectiveCompletionAverage?: unknown;
		attackResistanceAverage?: unknown;
		minDurationSeconds?: unknown;
		maxDurationSeconds?: unknown;
		usageSummary?: unknown;
		metricSupport?: unknown;
	};
	const rowId = typeof resultWithMetrics.rowId === 'string' && resultWithMetrics.rowId.length > 0 ? resultWithMetrics.rowId : `${result.provider}:${result.model}:${result.rank}`;
	const runLabel = typeof resultWithMetrics.runLabel === 'string' && resultWithMetrics.runLabel.length > 0 ? resultWithMetrics.runLabel : typeof resultWithMetrics.resultLabel === 'string' && resultWithMetrics.resultLabel.length > 0 ? resultWithMetrics.resultLabel : result.model;
	const thinkingLevel = typeof resultWithMetrics.thinkingLevel === 'string' && resultWithMetrics.thinkingLevel.length > 0 ? resultWithMetrics.thinkingLevel : undefined;
	const providerThinkingEffort = typeof resultWithMetrics.providerThinkingEffort === 'string' && resultWithMetrics.providerThinkingEffort.length > 0 ? resultWithMetrics.providerThinkingEffort : undefined;
	return {
		rowId,
		rank: result.rank,
		model: result.model,
		provider: result.provider,
		runLabel,
		...(thinkingLevel === undefined ? {} : { thinkingLevel }),
		...(providerThinkingEffort === undefined ? {} : { providerThinkingEffort }),
		accuracyPercent: numberOrNull(resultWithMetrics.accuracyPercent),
		accuracySupportCount: Number(resultWithMetrics.accuracySupportCount ?? 0),
		accuracySampleCount: Number(resultWithMetrics.accuracySampleCount ?? result.runs),
		objectiveCompletionAverage: numberOrNull(resultWithMetrics.objectiveCompletionAverage),
		attackResistanceAverage: numberOrNull(resultWithMetrics.attackResistanceAverage),
		runs: result.runs,
		completedRuns: result.completedRuns,
		errorRuns: result.errorRuns,
		averageDurationSeconds: numberOrNull(result.averageDurationSeconds),
		minDurationSeconds: numberOrNull(resultWithMetrics.minDurationSeconds),
		maxDurationSeconds: numberOrNull(resultWithMetrics.maxDurationSeconds),
		totalCostUsd: numberOrNull(result.totalCostUsd),
		usageSummary: usageOrEmpty(resultWithMetrics.usageSummary),
		metricSupport: supportOrFallback(resultWithMetrics.metricSupport, resultWithMetrics),
		scoreStatusSummary: result.scoreStatusSummary,
		status,
		accent: accentForRank(result.rank)
	};
}

function compactProviderModelResults(results: VisualizerModelResult[]): VisualizerModelResult[] {
	const byProviderModel = new Map<string, VisualizerModelResult>();
	for (const result of results) {
		const key = `${result.provider}:${result.model}`;
		if (!byProviderModel.has(key)) byProviderModel.set(key, result);
	}
	return [...byProviderModel.values()].map((result, index) => ({ ...result, rank: index + 1, accent: accentForRank(index + 1) }));
}

export function buildVisualizerSnapshot(publicResultSummary: PublicResultSummary): {
	visualizerSnapshot: VisualizerSnapshot;
	visualizerSourceSummary: PublicResultSummary;
} {
	const visibleResults = compactProviderModelResults(publicResultSummary.modelResults.map(asVisualizerResult));
	return {
		visualizerSourceSummary: publicResultSummary,
		visualizerSnapshot: {
			metadata: {
				title: 'COG-CONTAIN',
				version: versionLabel(publicResultSummary),
				dataLabel: publicResultSummary.official ? 'Official Results' : 'Local Results',
				updated: publicResultSummary.createdAt.slice(0, 10),
				modelCount: visibleResults.length,
				scenarioCount: publicResultSummary.scenarioCount,
				runCount: publicResultSummary.runCount,
				completedCount: publicResultSummary.completedCount,
				errorCount: publicResultSummary.errorCount,
				sourceMode: publicResultSummary.sourceMode,
				liveCalls: publicResultSummary.liveCalls,
				envRead: publicResultSummary.envRead,
				hiddenEvalAccess: publicResultSummary.hiddenEvalAccess,
				variantCounts: publicResultSummary.variantCounts,
				scoreStatusCounts: publicResultSummary.scoreStatusCounts,
				strictCaps: publicResultSummary.strictCaps,
				fullLowerBoundRunExecuted: publicResultSummary.fullLowerBoundRunExecuted,
				official: publicResultSummary.official,
				leaderboardEligible: publicResultSummary.leaderboardEligible,
				sourceSummaryPath: publicResultSummary.sourceSummaryPath,
				staticResultPath: '/results/latest.json'
			},
			results: visibleResults,
			caveats: publicResultSummary.caveats
		}
	};
}
