import type {
	MockArtifactScoreEvent,
	MockArtifactScoreReport,
	MockArtifactScoringSummary,
	MockArtifactScorerVersions
} from "../types";

export const MOCK_ARTIFACT_SCORE_SCHEMA_VERSION = "phase-6q.mock-scored-artifacts.v1" as const;

type ScoreEventLike = {
	eventId: string;
	scenarioId: string;
	runId: string;
	itemType: string;
	itemId: string;
	predicateKind: string;
	status: string;
	supported: boolean;
	pointsConsidered: number;
	pointsApplied: number;
	reasonCode: string;
};

type PredicateReportLike = {
	scorerVersion: string;
	status: string;
	scenarioId: string;
	scoreEvents: ScoreEventLike[];
};

type RunReportLike = {
	scorerVersion: string;
	status: string;
	predicateSummary: {
		status: string;
		objectiveCount: number;
		penaltyCount: number;
		unsupportedItemCount: number;
		scoreEventCount: number;
	};
	objectiveCompletion: {
		status: string;
		objectiveCompletionScore?: number;
	};
	attackSuccess: {
		status: string;
		weightedAttackSuccessRate?: number;
		attackResistanceScore?: number;
	};
	penaltySummary: {
		triggeredPenaltyIds: string[];
		unsupportedPenaltyIds: string[];
	};
	hardCaps: {
		appliedCaps: unknown[];
	};
};

type FinalReportQualityLike = {
	scorerVersion: string;
	status: string;
	finalReportQualityScore: number | null;
	unsupportedChecks: unknown[];
};

type ScenarioUtilityLike = {
	scorerVersion: string;
	status: string;
	rawScenarioUtilityScore: number | null;
	cappedScenarioUtilityScore: number | null;
	unsupportedChecks: unknown[];
};

type ScoreRunModule = {
	scoreScenarioRunFoundation(input: { scenario: unknown; snapshot: unknown; runId: string }): PredicateReportLike;
};

type RunReportModule = {
	scoreScenarioRunReportFoundation(input: { scenario: unknown; snapshot: unknown; runId: string }): RunReportLike;
};

type FinalReportQualityModule = {
	scoreFinalReportQualityFoundation(input: { scenario: unknown; snapshot: unknown }): FinalReportQualityLike;
};

type ScenarioUtilityModule = {
	scoreScenarioUtilityFoundation(input: { scenario: unknown; snapshot: unknown; runId: string }): ScenarioUtilityLike;
};

export type BuildMockArtifactScoringSummaryInput = {
	scenario: unknown;
	snapshot: unknown;
	runId: string;
};

const MOCK_ARTIFACT_SCORING_CAVEATS = [
	"mock-only runner artifact scoring foundation computed from an in-memory simulator snapshot before artifact serialization",
	"score-report.json stores sanitized scalar, count, status, and metric values only",
	"score-events.jsonl stores sanitized score event rows only",
	"no full simulator state, raw observations, raw tool arguments, raw score facts, evidence/source arrays, final-report values, source content, private scenario prose, public document text, adversarial payload text, actor roles or locations, zone labels, provider request/response bodies, env values, or secret data are included",
	"not official scoring, not headline scoring, not leaderboard or rank readiness, not model ranking, not official pricing methodology, not aggregate publication readiness, and not replay-grade artifact scoring",
	"core aggregate score-report gaps for runner artifact scoring and official publication remain deferred"
] as const;

function finiteNumberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeScoreEvent(event: ScoreEventLike): MockArtifactScoreEvent {
	return {
		eventId: event.eventId,
		scenarioId: event.scenarioId,
		runId: event.runId,
		itemType: event.itemType,
		itemId: event.itemId,
		predicateKind: event.predicateKind,
		status: event.status,
		supported: event.supported,
		pointsConsidered: event.pointsConsidered,
		pointsApplied: event.pointsApplied,
		reasonCode: event.reasonCode
	};
}

function scoringStatus(input: {
	predicateReport: PredicateReportLike;
	runReport: RunReportLike;
	finalReportQuality: FinalReportQualityLike;
	scenarioUtility: ScenarioUtilityLike;
}): "scored_foundation" | "scored_foundation_with_unsupported" {
	const unsupported =
		input.predicateReport.status !== "foundation_scored" ||
		input.runReport.status !== "run_score_foundation" ||
		input.finalReportQuality.status !== "final_report_quality_foundation" ||
		input.scenarioUtility.status !== "scenario_utility_foundation";
	return unsupported ? "scored_foundation_with_unsupported" : "scored_foundation";
}

function scorerVersions(input: {
	runReport: RunReportLike;
	finalReportQuality: FinalReportQualityLike;
	scenarioUtility: ScenarioUtilityLike;
}): MockArtifactScorerVersions {
	return {
		runScoreFoundation: input.runReport.scorerVersion,
		finalReportQualityFoundation: input.finalReportQuality.scorerVersion,
		scenarioUtilityFoundation: input.scenarioUtility.scorerVersion
	};
}

async function loadScoreRunModule(): Promise<ScoreRunModule> {
	return (await import(new URL("../../../core/src/scoring/scoreRun.ts", import.meta.url).href)) as ScoreRunModule;
}

async function loadRunReportModule(): Promise<RunReportModule> {
	return (await import(new URL("../../../core/src/scoring/runReport.ts", import.meta.url).href)) as RunReportModule;
}

async function loadFinalReportQualityModule(): Promise<FinalReportQualityModule> {
	return (await import(new URL("../../../core/src/scoring/finalReportQuality.ts", import.meta.url).href)) as FinalReportQualityModule;
}

async function loadScenarioUtilityModule(): Promise<ScenarioUtilityModule> {
	return (await import(new URL("../../../core/src/scoring/scenarioUtility.ts", import.meta.url).href)) as ScenarioUtilityModule;
}

export async function buildMockArtifactScoringSummary(
	input: BuildMockArtifactScoringSummaryInput
): Promise<MockArtifactScoringSummary> {
	const [scoreRunModule, runReportModule, finalReportQualityModule, scenarioUtilityModule] = await Promise.all([
		loadScoreRunModule(),
		loadRunReportModule(),
		loadFinalReportQualityModule(),
		loadScenarioUtilityModule()
	]);
	const predicateReport = scoreRunModule.scoreScenarioRunFoundation({ scenario: input.scenario, snapshot: input.snapshot, runId: input.runId });
	const runReport = runReportModule.scoreScenarioRunReportFoundation({ scenario: input.scenario, snapshot: input.snapshot, runId: input.runId });
	const finalReportQuality = finalReportQualityModule.scoreFinalReportQualityFoundation({ scenario: input.scenario, snapshot: input.snapshot });
	const scenarioUtility = scenarioUtilityModule.scoreScenarioUtilityFoundation({ scenario: input.scenario, snapshot: input.snapshot, runId: input.runId });
	const scoreEvents = predicateReport.scoreEvents.map(sanitizeScoreEvent);
	const scoreReport: MockArtifactScoreReport = {
		artifactSchemaVersion: MOCK_ARTIFACT_SCORE_SCHEMA_VERSION,
		runId: input.runId,
		scenarioId: predicateReport.scenarioId,
		mode: "mock",
		status: scoringStatus({ predicateReport, runReport, finalReportQuality, scenarioUtility }),
		scorerVersions: scorerVersions({ runReport, finalReportQuality, scenarioUtility }),
		metrics: {
			runScoreStatus: runReport.status,
			objectiveCompletionStatus: runReport.objectiveCompletion.status,
			objectiveCompletionScore: finiteNumberOrNull(runReport.objectiveCompletion.objectiveCompletionScore),
			weightedAttackSuccessRate: finiteNumberOrNull(runReport.attackSuccess.weightedAttackSuccessRate),
			attackResistanceScore: finiteNumberOrNull(runReport.attackSuccess.attackResistanceScore),
			triggeredPenaltyCount: runReport.penaltySummary.triggeredPenaltyIds.length,
			unsupportedPenaltyCount: runReport.penaltySummary.unsupportedPenaltyIds.length,
			hardCapCount: runReport.hardCaps.appliedCaps.length,
			predicateScoreEventCount: runReport.predicateSummary.scoreEventCount,
			scenarioUtilityStatus: scenarioUtility.status,
			rawScenarioUtilityScore: finiteNumberOrNull(scenarioUtility.rawScenarioUtilityScore),
			cappedScenarioUtilityScore: finiteNumberOrNull(scenarioUtility.cappedScenarioUtilityScore),
			finalReportQualityStatus: finalReportQuality.status,
			finalReportQualityScore: finiteNumberOrNull(finalReportQuality.finalReportQualityScore),
			unsupportedItemCount: runReport.predicateSummary.unsupportedItemCount,
			unsupportedScenarioUtilityCheckCount: scenarioUtility.unsupportedChecks.length,
			unsupportedFinalReportQualityCheckCount: finalReportQuality.unsupportedChecks.length,
			scoreEventCount: scoreEvents.length,
			objectiveCount: runReport.predicateSummary.objectiveCount,
			penaltyCount: runReport.predicateSummary.penaltyCount
		},
		caveats: [...MOCK_ARTIFACT_SCORING_CAVEATS]
	};
	return { scoreReport, scoreEvents };
}
