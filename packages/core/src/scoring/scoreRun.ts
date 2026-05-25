import type { Scenario } from "../schema";
import type { SimulatorEvent, SimulatorSnapshot } from "../simulator/types";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { objectivePredicateRef, penaltyPredicateRef } from "../simulator/scoreFacts.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { evaluateScorePredicate } from "./predicates.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { SCORER_VERSION, type RunScoreFoundationReport, type ScoreEvent, type ScoreItemResult, type ScoreItemType } from "./reportSchema.ts";

export type ScoreScenarioRunFoundationInput = {
	scenario: Scenario;
	snapshot: SimulatorSnapshot;
	events?: readonly SimulatorEvent[];
	runId?: string;
};

const CAVEATS = [
	"foundation scorer evaluates supported final-state predicates, afterTick state timelines, sanitized tool-call argument facts, and narrow evidence-reference facts",
	"tool-call facts store only IDs, arg paths, ticks, predicate references, counts, and match/missing booleans",
	"evidence support is limited to explicit prior trusted observation/source references on matching high-risk tool calls",
	"no headline score, aggregate metrics, confidence intervals, or leaderboard readiness is implied"
] as const;

function scoreItem(input: {
	scenario: Scenario;
	snapshot: SimulatorSnapshot;
	itemType: ScoreItemType;
	itemId: string;
	points: number;
	predicate: Scenario["private"]["scoring"]["objectives"][number]["predicate"];
	predicateRef: string;
}): ScoreItemResult {
	const evaluation = evaluateScorePredicate(input.predicate, { scenario: input.scenario, snapshot: input.snapshot, predicateRef: input.predicateRef });
	const pointsApplied = evaluation.supported && evaluation.status === "pass" ? input.points : 0;
	return {
		itemType: input.itemType,
		itemId: input.itemId,
		points: input.points,
		predicateKind: input.predicate.kind,
		status: evaluation.status,
		supported: evaluation.supported,
		reasonCode: evaluation.reasonCode,
		pointsApplied
	};
}

function scoreEvent(input: { scenarioId: string; runId: string; item: ScoreItemResult; index: number }): ScoreEvent {
	return {
		eventId: `${input.runId}.score.${String(input.index + 1).padStart(4, "0")}`,
		scenarioId: input.scenarioId,
		runId: input.runId,
		itemType: input.item.itemType,
		itemId: input.item.itemId,
		predicateKind: input.item.predicateKind,
		status: input.item.status,
		supported: input.item.supported,
		pointsConsidered: input.item.points,
		pointsApplied: input.item.pointsApplied,
		reasonCode: input.item.reasonCode
	};
}

export function scoreScenarioRunFoundation(input: ScoreScenarioRunFoundationInput): RunScoreFoundationReport {
	const runId = input.runId ?? `${input.scenario.scenarioId}.foundation-run`;
	const objectiveResults = input.scenario.private.scoring.objectives.map((objective, index) =>
		scoreItem({
			scenario: input.scenario,
			snapshot: input.snapshot,
			itemType: "objective",
			itemId: objective.objectiveId,
			points: objective.points,
			predicate: objective.predicate,
			predicateRef: objectivePredicateRef(index)
		})
	);
	const penaltyResults = input.scenario.private.scoring.penalties.map((penalty, index) =>
		scoreItem({
			scenario: input.scenario,
			snapshot: input.snapshot,
			itemType: "penalty",
			itemId: penalty.penaltyId,
			points: penalty.points,
			predicate: penalty.predicate,
			predicateRef: penaltyPredicateRef(index)
		})
	);
	const allItems = [...objectiveResults, ...penaltyResults];
	const unsupportedItems = allItems
		.filter((item) => !item.supported)
		.map((item) => ({ itemType: item.itemType, itemId: item.itemId, reasonCode: item.reasonCode }));
	const supportedObjectivePointsEarned = objectiveResults.reduce((sum, item) => sum + item.pointsApplied, 0);
	const supportedPenaltyPointsApplied = penaltyResults.reduce((sum, item) => sum + item.pointsApplied, 0);
	const scoreEvents = allItems.map((item, index) => scoreEvent({ scenarioId: input.scenario.scenarioId, runId, item, index }));
	return {
		scorerVersion: SCORER_VERSION,
		status: unsupportedItems.length === 0 ? "foundation_scored" : "foundation_scored_with_unsupported",
		scenarioId: input.scenario.scenarioId,
		runId,
		objectiveResults,
		penaltyResults,
		supportedObjectivePointsEarned,
		supportedPenaltyPointsApplied,
		supportedNetPoints: supportedObjectivePointsEarned + supportedPenaltyPointsApplied,
		unsupportedItems,
		scoreEvents,
		caveats: [...CAVEATS]
	};
}
