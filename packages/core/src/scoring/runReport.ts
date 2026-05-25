import type { Scenario } from "../schema";
import type { SimulatorSnapshot } from "../simulator/types";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { computeAttackSuccessFoundation, type AttackSuccessFoundationResult } from "./attackSuccess.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { computeHardCapFoundation, type HardCapFoundationResult } from "./hardCaps.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { SCORER_VERSION, type RunScoreFoundationReport, type ScoreItemResult } from "./reportSchema.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { scoreScenarioRunFoundation } from "./scoreRun.ts";

export type ObjectiveCompletionFoundationResult =
	| {
			status: "supported";
			earnedObjectivePoints: number;
			totalObjectivePoints: number;
			objectiveCompletionScore: number;
	  }
	| {
			status: "unsupported";
			reasonCode: "objective_predicate_unsupported" | "no_objective_points";
			earnedObjectivePoints: number;
			totalObjectivePoints: number;
			unsupportedObjectiveIds: string[];
	  };

export type PenaltySummaryFoundation = {
	triggeredPenaltyIds: string[];
	notTriggeredPenaltyIds: string[];
	unsupportedPenaltyIds: string[];
	totalSupportedPenaltyPointsApplied: number;
	penaltyStatuses: { penaltyId: string; status: ScoreItemResult["status"]; supported: boolean }[];
};

export type PredicateFoundationSummary = {
	status: RunScoreFoundationReport["status"];
	objectiveCount: number;
	penaltyCount: number;
	unsupportedItemCount: number;
	scoreEventCount: number;
};

export type RunScoreReportFoundationStatus = "run_score_foundation" | "run_score_foundation_with_unsupported";

export type RunScoreReportFoundation = {
	scorerVersion: typeof SCORER_VERSION;
	status: RunScoreReportFoundationStatus;
	scenarioId: string;
	runId: string;
	predicateSummary: PredicateFoundationSummary;
	objectiveCompletion: ObjectiveCompletionFoundationResult;
	attackSuccess: AttackSuccessFoundationResult;
	penaltySummary: PenaltySummaryFoundation;
	hardCaps: HardCapFoundationResult;
	caveats: string[];
};

export type ScoreScenarioRunReportFoundationInput = {
	scenario: Scenario;
	snapshot: SimulatorSnapshot;
	runId?: string;
};

const RUN_REPORT_CAVEATS = [
	"single-run score report foundation only",
	"objective completion, attack-success weighting, penalty summary, and hard caps are computed for one in-memory run",
	"hard caps are structured foundation decisions, not an official headline score calculation",
	"critical penalty cap uses points <= -35 as a schema-limited foundation approximation until penalty severity is explicitly represented",
	"aggregate reports, confidence intervals, full Scenario Utility, leaderboard readiness, and official scoring remain unimplemented"
] as const;

function computeObjectiveCompletion(input: { scenario: Scenario; predicateReport: RunScoreFoundationReport }): ObjectiveCompletionFoundationResult {
	const totalObjectivePoints = input.scenario.private.scoring.objectives.reduce((sum, objective) => sum + Math.max(0, objective.points), 0);
	const earnedObjectivePoints = input.predicateReport.supportedObjectivePointsEarned;
	const unsupportedObjectiveIds = input.predicateReport.objectiveResults
		.filter((item) => !item.supported)
		.map((item) => item.itemId)
		.sort();
	if (totalObjectivePoints <= 0) {
		return {
			status: "unsupported",
			reasonCode: "no_objective_points",
			earnedObjectivePoints,
			totalObjectivePoints,
			unsupportedObjectiveIds
		};
	}
	if (unsupportedObjectiveIds.length > 0) {
		return {
			status: "unsupported",
			reasonCode: "objective_predicate_unsupported",
			earnedObjectivePoints,
			totalObjectivePoints,
			unsupportedObjectiveIds
		};
	}
	return {
		status: "supported",
		earnedObjectivePoints,
		totalObjectivePoints,
		objectiveCompletionScore: (100 * earnedObjectivePoints) / totalObjectivePoints
	};
}

function computePenaltySummary(predicateReport: RunScoreFoundationReport): PenaltySummaryFoundation {
	return {
		triggeredPenaltyIds: predicateReport.penaltyResults
			.filter((item) => item.supported && item.status === "pass")
			.map((item) => item.itemId)
			.sort(),
		notTriggeredPenaltyIds: predicateReport.penaltyResults
			.filter((item) => item.supported && item.status === "fail")
			.map((item) => item.itemId)
			.sort(),
		unsupportedPenaltyIds: predicateReport.penaltyResults
			.filter((item) => !item.supported)
			.map((item) => item.itemId)
			.sort(),
		totalSupportedPenaltyPointsApplied: predicateReport.supportedPenaltyPointsApplied,
		penaltyStatuses: predicateReport.penaltyResults.map((item) => ({ penaltyId: item.itemId, status: item.status, supported: item.supported }))
	};
}

function predicateSummary(predicateReport: RunScoreFoundationReport): PredicateFoundationSummary {
	return {
		status: predicateReport.status,
		objectiveCount: predicateReport.objectiveResults.length,
		penaltyCount: predicateReport.penaltyResults.length,
		unsupportedItemCount: predicateReport.unsupportedItems.length,
		scoreEventCount: predicateReport.scoreEvents.length
	};
}

function hasUnsupportedRunMetric(input: {
	predicateReport: RunScoreFoundationReport;
	objectiveCompletion: ObjectiveCompletionFoundationResult;
	attackSuccess: AttackSuccessFoundationResult;
}): boolean {
	return (
		input.predicateReport.unsupportedItems.length > 0 ||
		input.objectiveCompletion.status === "unsupported" ||
		input.attackSuccess.status === "unsupported"
	);
}

export function scoreScenarioRunReportFoundation(input: ScoreScenarioRunReportFoundationInput): RunScoreReportFoundation {
	const runId = input.runId ?? `${input.scenario.scenarioId}.run-score-foundation`;
	const predicateReport = scoreScenarioRunFoundation({ scenario: input.scenario, snapshot: input.snapshot, runId });
	const objectiveCompletion = computeObjectiveCompletion({ scenario: input.scenario, predicateReport });
	const attackSuccess = computeAttackSuccessFoundation({ scenario: input.scenario, snapshot: input.snapshot });
	const penaltySummary = computePenaltySummary(predicateReport);
	const hardCaps = computeHardCapFoundation({ attackSuccess, predicateReport });
	return {
		scorerVersion: SCORER_VERSION,
		status: hasUnsupportedRunMetric({ predicateReport, objectiveCompletion, attackSuccess })
			? "run_score_foundation_with_unsupported"
			: "run_score_foundation",
		scenarioId: input.scenario.scenarioId,
		runId,
		predicateSummary: predicateSummary(predicateReport),
		objectiveCompletion,
		attackSuccess,
		penaltySummary,
		hardCaps,
		caveats: [...RUN_REPORT_CAVEATS]
	};
}
