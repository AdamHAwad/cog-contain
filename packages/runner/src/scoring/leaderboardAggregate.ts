import type { ThinkingLevel } from "../adapters/thinkingLevel.ts";
import {
	aggregateLeaderboardRow,
	assessLeaderboardEligibility,
	LEADERBOARD_SCORE_KIND,
	LEADERBOARD_SCORE_VERSION,
	OFFICIAL_LEADERBOARD_RUN_PROTOCOL,
	scoreLeaderboardAttempt,
	type LeaderboardAttemptScore,
	type LeaderboardAttemptStatus,
	type LeaderboardRowAggregate
} from "@cog-contain/core/scoring/leaderboardScore";
import type { LeaderboardScoreBundle } from "./leaderboardScoreBundle.ts";

export type LeaderboardAttemptRecord = {
	scenarioId: string;
	runId: string;
	attemptStatus: LeaderboardAttemptStatus;
	bundle: LeaderboardScoreBundle;
	durationMs: number;
	usageSummary: {
		inputTokens: number;
		outputTokens: number;
		cacheReadTokens: number;
		cacheWriteTokens: number;
		totalTokens: number;
		costUsd: number;
	};
};

export type LeaderboardModelRow = {
	rowId: string;
	runLabel: string;
	resultLabel: string;
	thinkingLevel?: ThinkingLevel;
	providerThinkingEffort?: string;
	rank: number;
	provider: string;
	model: string;
	status: "official_leaderboard";
	runs: number;
	completedRuns: number;
	errorRuns: number;
	scoreKind: typeof LEADERBOARD_SCORE_KIND;
	runProtocol: typeof OFFICIAL_LEADERBOARD_RUN_PROTOCOL;
	scoreVersion: typeof LEADERBOARD_SCORE_VERSION;
	leaderboardScorePercent: number;
	leaderboardEligible: boolean;
	eligibilityReasons: string[];
	completionRate: number;
	failedAttemptCount: number;
	unsupportedPrimaryScoreCount: number;
	componentMeans: LeaderboardRowAggregate["componentMeans"];
	confidenceInterval: LeaderboardRowAggregate["confidenceInterval"];
	hardCapSummary: LeaderboardRowAggregate["hardCapSummary"];
	accuracyPercent: null;
	accuracySupportCount: 0;
	accuracySampleCount: number;
	objectiveCompletionAverage: number | null;
	attackResistanceAverage: null;
	robustUtility: number;
	attackResistance: number;
	objectiveCompletion: number;
	overRefusal: number;
	averageDurationSeconds: number | null;
	minDurationSeconds?: number;
	maxDurationSeconds?: number;
	totalCostUsd: number | null;
	usageSummary: LeaderboardAttemptRecord["usageSummary"];
	metricSupport: { accuracy: "unsupported"; cost: "supported" | "unsupported"; speed: "supported" | "unsupported" };
	scoreStatusSummary: Record<string, number>;
	sourceArtifactRoot?: string;
	sourceSummary?: string;
};

export type OfficialLeaderboardPublicSummary = {
	schemaVersion: 1;
	kind: "cog-contain-public-result-summary";
	label: string;
	createdAt: string;
	sourceMode: "official-leaderboard";
	scoreKind: typeof LEADERBOARD_SCORE_KIND;
	runProtocol: typeof OFFICIAL_LEADERBOARD_RUN_PROTOCOL;
	scoreVersion: typeof LEADERBOARD_SCORE_VERSION;
	suiteVersion: string;
	pack: string;
	status: "pass" | "blocked";
	liveCapable: true;
	liveCalls: boolean;
	envRead: boolean;
	hiddenEvalAccess: false;
	official: true;
	leaderboardEligible: boolean;
	fullLowerBoundRunExecuted: boolean;
	artifactRoot: string;
	artifactRoots?: string[];
	sourceSummaryPath: string;
	sourceSummaries?: string[];
	providerProfiles: {
		provider: string;
		model: string;
		label: string;
		rowId?: string;
		thinkingLevel?: ThinkingLevel;
		providerThinkingEffort?: string;
	}[];
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number };
	scenarioCount: number;
	runCount: number;
	completedCount: number;
	errorCount: number;
	scoreStatusCounts: Record<string, number>;
	variantCounts: Record<string, number>;
	modelResults: LeaderboardModelRow[];
	caveats: string[];
};

function mean(values: number[]): number | null {
	return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function attemptScores(records: readonly LeaderboardAttemptRecord[]): LeaderboardAttemptScore[] {
	return records.map((record) =>
		scoreLeaderboardAttempt({
			scenarioId: record.scenarioId,
			runId: record.runId,
			attemptStatus: record.attemptStatus,
			scenarioUtility:
				record.bundle.cappedScenarioUtilityScore === null && record.bundle.rawScenarioUtilityScore === null
					? null
					: {
							scorerVersion: record.bundle.scorerVersions.scenarioUtilityFoundation as "0.1.0-scenario-utility-foundation",
							status: record.bundle.primaryScoreSupported ? "scenario_utility_foundation" : "scenario_utility_foundation_with_unsupported",
							scenarioId: record.scenarioId,
							runId: record.runId,
							componentResults: record.bundle.componentResults,
							rawScenarioUtilityScore: record.bundle.rawScenarioUtilityScore,
							cappedScenarioUtilityScore: record.bundle.cappedScenarioUtilityScore,
							hardCapSummary: record.bundle.hardCapSummary,
							unsupportedChecks: [],
							caveats: []
						}
		})
	);
}

export function buildLeaderboardModelRow(input: {
	provider: string;
	model: string;
	runLabel: string;
	rowId: string;
	thinkingLevel?: ThinkingLevel;
	providerThinkingEffort?: string;
	attempts: LeaderboardAttemptRecord[];
	expectedScenarioCount: number;
	expectedScenarioIds?: readonly string[];
	sourceArtifactRoot?: string;
	sourceSummary?: string;
}): LeaderboardModelRow {
	const aggregate = aggregateLeaderboardRow(attemptScores(input.attempts));
	const eligibility = assessLeaderboardEligibility(aggregate, {
		expectedScenarioCount: input.expectedScenarioCount,
		attemptScenarioIds: input.attempts.map((attempt) => attempt.scenarioId),
		...(input.expectedScenarioIds === undefined ? {} : { expectedScenarioIds: input.expectedScenarioIds })
	});
	const durations = input.attempts.map((attempt) => attempt.durationMs).filter((value) => value > 0);
	const usage = input.attempts.map((attempt) => attempt.usageSummary);
	const totalCostUsd = usage.reduce((sum, item) => sum + item.costUsd, 0);
	const totalTokens = usage.reduce((sum, item) => sum + item.totalTokens, 0);
	const objectiveMean = aggregate.componentMeans.objective_completion;
	return {
		rowId: input.rowId,
		runLabel: input.model,
		resultLabel: input.runLabel,
		...(input.thinkingLevel === undefined ? {} : { thinkingLevel: input.thinkingLevel }),
		...(input.providerThinkingEffort === undefined ? {} : { providerThinkingEffort: input.providerThinkingEffort }),
		rank: 1,
		provider: input.provider,
		model: input.model,
		status: "official_leaderboard",
		runs: input.attempts.length,
		completedRuns: input.attempts.filter((attempt) => attempt.attemptStatus === "completed").length,
		errorRuns: input.attempts.filter((attempt) => attempt.attemptStatus !== "completed").length,
		scoreKind: LEADERBOARD_SCORE_KIND,
		runProtocol: OFFICIAL_LEADERBOARD_RUN_PROTOCOL,
		scoreVersion: LEADERBOARD_SCORE_VERSION,
		leaderboardScorePercent: aggregate.leaderboardScorePercent,
		leaderboardEligible: eligibility.eligible,
		eligibilityReasons: eligibility.reasons,
		completionRate: aggregate.completionRate,
		failedAttemptCount: aggregate.failedAttemptCount,
		unsupportedPrimaryScoreCount: aggregate.unsupportedPrimaryScoreCount,
		componentMeans: aggregate.componentMeans,
		confidenceInterval: aggregate.confidenceInterval,
		hardCapSummary: aggregate.hardCapSummary,
		accuracyPercent: null,
		accuracySupportCount: 0,
		accuracySampleCount: input.attempts.length,
		objectiveCompletionAverage: objectiveMean,
		attackResistanceAverage: null,
		robustUtility: Math.round(aggregate.leaderboardScorePercent),
		attackResistance: 0,
		objectiveCompletion: Math.round(objectiveMean ?? 0),
		overRefusal: 0,
		averageDurationSeconds: mean(durations) === null ? null : Number(((mean(durations) ?? 0) / 1000).toFixed(3)),
		...(durations.length > 0
			? {
					minDurationSeconds: Number((Math.min(...durations) / 1000).toFixed(3)),
					maxDurationSeconds: Number((Math.max(...durations) / 1000).toFixed(3))
				}
			: {}),
		totalCostUsd: totalCostUsd > 0 ? totalCostUsd : null,
		usageSummary: {
			inputTokens: usage.reduce((sum, item) => sum + item.inputTokens, 0),
			outputTokens: usage.reduce((sum, item) => sum + item.outputTokens, 0),
			cacheReadTokens: usage.reduce((sum, item) => sum + item.cacheReadTokens, 0),
			cacheWriteTokens: usage.reduce((sum, item) => sum + item.cacheWriteTokens, 0),
			totalTokens,
			costUsd: totalCostUsd
		},
		metricSupport: {
			accuracy: "unsupported",
			cost: totalTokens > 0 && totalCostUsd > 0 ? "supported" : "unsupported",
			speed: durations.length > 0 ? "supported" : "unsupported"
		},
		scoreStatusSummary: input.attempts.reduce(
			(acc, attempt) => {
				const key = attempt.bundle.primaryScoreSupported ? "leaderboard_primary_supported" : "leaderboard_primary_unsupported";
				acc[key] = (acc[key] ?? 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		),
		...(input.sourceArtifactRoot === undefined ? {} : { sourceArtifactRoot: input.sourceArtifactRoot }),
		...(input.sourceSummary === undefined ? {} : { sourceSummary: input.sourceSummary })
	};
}

export function buildOfficialLeaderboardPublicSummary(input: {
	rows: LeaderboardModelRow[];
	suiteVersion: string;
	strictCaps: OfficialLeaderboardPublicSummary["strictCaps"];
	variantCounts: Record<string, number>;
	caveats?: string[];
}): OfficialLeaderboardPublicSummary {
	const rankedRows = [...input.rows]
		.sort((left, right) => right.leaderboardScorePercent - left.leaderboardScorePercent)
		.map((row, index) => ({ ...row, rank: index + 1 }));
	const runCount = rankedRows.reduce((sum, row) => sum + row.runs, 0);
	const completedCount = rankedRows.reduce((sum, row) => sum + row.completedRuns, 0);
	const errorCount = rankedRows.reduce((sum, row) => sum + row.errorRuns, 0);
	const allEligible = rankedRows.every((row) => row.leaderboardEligible);
	return {
		schemaVersion: 1,
		kind: "cog-contain-public-result-summary",
		label: "official-leaderboard-results",
		createdAt: new Date().toISOString(),
		sourceMode: "official-leaderboard",
		scoreKind: LEADERBOARD_SCORE_KIND,
		runProtocol: OFFICIAL_LEADERBOARD_RUN_PROTOCOL,
		scoreVersion: LEADERBOARD_SCORE_VERSION,
		suiteVersion: input.suiteVersion,
		pack: "official-hidden-benchmark",
		status: rankedRows.some((row) => row.errorRuns > 0) ? "blocked" : "pass",
		liveCapable: true,
		liveCalls: rankedRows.some((row) => row.completedRuns > 0),
		envRead: rankedRows.some((row) => row.completedRuns > 0),
		hiddenEvalAccess: false,
		official: true,
		leaderboardEligible: allEligible,
		fullLowerBoundRunExecuted: rankedRows.every((row) => row.runs === 40),
		artifactRoot: rankedRows[0]?.sourceArtifactRoot ?? "private-official-artifacts/unknown",
		artifactRoots: [...new Set(rankedRows.map((row) => row.sourceArtifactRoot).filter((value): value is string => typeof value === "string"))],
		sourceSummaryPath: "artifacts/public-results/latest.json",
		sourceSummaries: [...new Set(rankedRows.map((row) => row.sourceSummary).filter((value): value is string => typeof value === "string"))],
		providerProfiles: rankedRows.map((row) => ({
			provider: row.provider,
			model: row.model,
			label: `${row.provider}:${row.model}`,
			rowId: row.rowId,
			...(row.thinkingLevel === undefined ? {} : { thinkingLevel: row.thinkingLevel }),
			...(row.providerThinkingEffort === undefined ? {} : { providerThinkingEffort: row.providerThinkingEffort })
		})),
		strictCaps: input.strictCaps,
		scenarioCount: 40,
		runCount,
		completedCount,
		errorCount,
		scoreStatusCounts: rankedRows.reduce(
			(acc, row) => {
				for (const [key, value] of Object.entries(row.scoreStatusSummary)) acc[key] = (acc[key] ?? 0) + value;
				return acc;
			},
			{} as Record<string, number>
		),
		variantCounts: input.variantCounts,
		modelResults: rankedRows,
		caveats: input.caveats ?? [
			"Official COG-CONTAIN leaderboard results from the hidden scenario suite quality benchmark protocol.",
			"Primary score uses versioned scenario utility (leaderboard-score-v1), not live-smoke accuracy.",
			"Benchmark scenarios are hidden to protect integrity; example scenarios are available for local development only.",
			"All scenario content is original COG-CONTAIN fiction inspired by containment-style settings, not real SCP entries."
		]
	};
}

export function mergeLeaderboardPublicSummaries(
	existing: OfficialLeaderboardPublicSummary | undefined,
	incomingRows: LeaderboardModelRow[],
	options: { replaceModelRows: boolean; suiteVersion: string; strictCaps: OfficialLeaderboardPublicSummary["strictCaps"]; variantCounts: Record<string, number> }
): OfficialLeaderboardPublicSummary {
	let rows = [...(existing?.modelResults ?? [])];
	if (options.replaceModelRows) {
		for (const incoming of incomingRows) {
			rows = rows.filter((row) => !(row.provider === incoming.provider && row.model === incoming.model && row.thinkingLevel === incoming.thinkingLevel));
		}
	}
	for (const incoming of incomingRows) {
		rows = rows.filter((row) => row.rowId !== incoming.rowId);
		rows.unshift(incoming);
	}
	rows = rows.filter((row) => row.status === "official_leaderboard");
	return buildOfficialLeaderboardPublicSummary({
		rows,
		suiteVersion: options.suiteVersion,
		strictCaps: options.strictCaps,
		variantCounts: options.variantCounts
	});
}
