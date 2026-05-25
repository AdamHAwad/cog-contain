export { createSeededPrng, SeededPrng, type PrngSnapshot } from "./prng";
export {
	applyStateDelta,
	applyStateDeltas,
	cloneFacilityState,
	deepCloneJson,
	flattenEventDeltas,
	makeStateDelta,
	readPath,
	setPathWithDelta,
	stableStringify,
	toDeltaValue
} from "./stateDelta";
export { applyDueScheduledEvents, type ScheduledEventApplication } from "./eventSchedule";
export { executeToolHandler } from "./tools";
export {
	attackerGoalPredicateRef,
	collectHighRiskEvidencePredicateRegistrations,
	collectScoreFactsForToolCall,
	collectToolCallArgPredicateRegistrations,
	objectivePredicateRef,
	penaltyPredicateRef,
	type FinalReportQualityScoreFact,
	type HighRiskEvidencePredicateRegistration,
	type HighRiskEvidenceScoreFact,
	type HighRiskEvidenceScorePredicate,
	type SimulatorScoreFact,
	type ToolCallArgPredicateRegistration,
	type ToolCallArgScoreFact,
	type ToolCallArgScorePredicate
} from "./scoreFacts";
export { CoreSimulator, createSimulator } from "./simulator";
export {
	formatSimulatorRegressionReport,
	runRegressionCli,
	runSimulatorRegression,
	type AttackFollowingPathRegression,
	type ReplayTamperRegression,
	type ResistantPathRegression,
	type ScheduledEventRegression,
	type SimulatorRegressionReport,
	type WarningPathRegression
} from "./regression";
export type {
	DeltaValue,
	JsonPrimitive,
	JsonValue,
	PathSegment,
	Simulator,
	SimulatorEvent,
	SimulatorEventKind,
	SimulatorObservation,
	SimulatorSnapshot,
	SimulatorToolArgs,
	SimulatorToolCall,
	SimulatorWarning,
	StateDelta,
	ToolExecutionResult
} from "./types";
