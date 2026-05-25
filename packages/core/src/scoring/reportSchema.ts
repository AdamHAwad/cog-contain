import type { ScorePredicate } from "../schema";

export const SCORER_VERSION = "0.1.0-run-score-foundation" as const;

export type PredicateEvaluationStatus = "pass" | "fail" | "unsupported" | "approximated";

export type PredicateReasonCode =
	| "matched_final_state"
	| "did_not_match_final_state"
	| "missing_state_path"
	| "missing_door"
	| "missing_actor"
	| "after_tick_unsupported"
	| "after_tick_not_reached"
	| "matched_timeline_state"
	| "did_not_match_timeline_state"
	| "timeline_reconstruction_warning"
	| "matched_tool_call_arg_fact"
	| "did_not_match_tool_call_arg_fact"
	| "needs_tool_arg_facts"
	| "matched_missing_evidence_fact"
	| "all_high_risk_calls_had_evidence"
	| "no_matching_high_risk_tool_call"
	| "needs_evidence_facts"
	| "attacker_goal_not_found"
	| "attacker_goal_nested_unsupported"
	| "attacker_goal_nested_failed";

export type ScorePredicateEvaluation = {
	predicateKind: ScorePredicate["kind"];
	status: PredicateEvaluationStatus;
	supported: boolean;
	reasonCode: PredicateReasonCode;
	nestedPredicateKinds?: ScorePredicate["kind"][];
};

export type ScoreItemType = "objective" | "penalty";

export type ScoreItemResult = {
	itemType: ScoreItemType;
	itemId: string;
	points: number;
	predicateKind: ScorePredicate["kind"];
	status: PredicateEvaluationStatus;
	supported: boolean;
	reasonCode: PredicateReasonCode;
	pointsApplied: number;
};

export type ScoreEvent = {
	eventId: string;
	scenarioId: string;
	runId: string;
	itemType: ScoreItemType;
	itemId: string;
	predicateKind: ScorePredicate["kind"];
	status: PredicateEvaluationStatus;
	supported: boolean;
	pointsConsidered: number;
	pointsApplied: number;
	reasonCode: PredicateReasonCode;
};

export type RunScoreFoundationStatus = "foundation_scored" | "foundation_scored_with_unsupported";

export type RunScoreFoundationReport = {
	scorerVersion: typeof SCORER_VERSION;
	status: RunScoreFoundationStatus;
	scenarioId: string;
	runId: string;
	objectiveResults: ScoreItemResult[];
	penaltyResults: ScoreItemResult[];
	supportedObjectivePointsEarned: number;
	supportedPenaltyPointsApplied: number;
	supportedNetPoints: number;
	unsupportedItems: { itemType: ScoreItemType; itemId: string; reasonCode: PredicateReasonCode }[];
	scoreEvents: ScoreEvent[];
	caveats: string[];
};
