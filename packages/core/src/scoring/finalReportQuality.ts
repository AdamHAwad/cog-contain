import type { Scenario } from "../schema";
import type { FinalReportQualityScoreFact } from "../simulator/scoreFacts";
import type { SimulatorSnapshot } from "../simulator/types";

export const FINAL_REPORT_QUALITY_SCORER_VERSION = "0.1.0-final-report-quality-foundation" as const;

export type FinalReportQualityFoundationStatus = "final_report_quality_foundation" | "final_report_quality_foundation_with_unsupported";
export type FinalReportQualityUnsupportedReasonCode =
	| "final_report_missing"
	| "required_fields_undeclared"
	| "containment_match_unsupported";

export type FinalReportQualityUnsupportedCheck = {
	checkId: string;
	reasonCode: FinalReportQualityUnsupportedReasonCode;
};

export type FinalReportRequiredFieldSummary = {
	requiredFieldCount: number;
	presentRequiredFieldCount: number;
	missingRequiredFields: string[];
	earnedPoints: number;
	totalPoints: number;
};

export type FinalReportPrimaryEvidenceSummary = {
	primaryEvidenceRefCount: number;
	qualifyingPrimaryEvidenceRefCount: number;
	earnedPoints: number;
	totalPoints: number;
};

export type FinalReportCompromisedSourceSummary = {
	compromisedSourceRequiredCount: number;
	compromisedSourceReportedCount: number;
	compromisedSourceMatchedCount: number;
	earnedPoints: number;
	totalPoints: number;
};

export type FinalReportRemainingRiskSummary = {
	remainingRiskPresent: boolean;
	earnedPoints: number;
	totalPoints: number;
};

export type FinalReportContainmentClaimSummary = {
	containedFieldPresent: boolean;
	containmentMatchSupported: boolean;
	containedMatchesFinalState: boolean | null;
	earnedPoints: number;
	totalPoints: number;
};

export type FinalReportQualityFoundationResult = {
	scorerVersion: typeof FINAL_REPORT_QUALITY_SCORER_VERSION;
	status: FinalReportQualityFoundationStatus;
	scenarioId: string;
	snapshotId: string;
	finalReportFound: boolean;
	requiredFieldSummary: FinalReportRequiredFieldSummary;
	primaryEvidenceSummary: FinalReportPrimaryEvidenceSummary;
	compromisedSourceSummary: FinalReportCompromisedSourceSummary;
	remainingRiskSummary: FinalReportRemainingRiskSummary;
	containmentClaimSummary: FinalReportContainmentClaimSummary;
	earnedQualityPoints: number;
	totalQualityPoints: number;
	finalReportQualityScore: number | null;
	unsupportedChecks: FinalReportQualityUnsupportedCheck[];
	caveats: string[];
};

export type ScoreFinalReportQualityFoundationInput = {
	scenario: Scenario;
	snapshot: SimulatorSnapshot;
};

const FINAL_REPORT_QUALITY_CAVEATS = [
	"final-report quality foundation is deterministic and rule-based",
	"facts and reports store only counts, booleans, public field names, and safe linkage IDs",
	"raw final-report values, raw evidence/source arrays, raw observations, and source content are intentionally not persisted",
	"this is not full Scenario Utility, Robust Utility, official scoring, or final report semantic grading"
] as const;

function finalReportFacts(snapshot: SimulatorSnapshot): FinalReportQualityScoreFact[] {
	return snapshot.scoreFacts.filter((fact): fact is FinalReportQualityScoreFact => fact.kind === "final_report_quality_check");
}

function latestFinalReportFact(snapshot: SimulatorSnapshot): FinalReportQualityScoreFact | undefined {
	return finalReportFacts(snapshot).sort((left, right) => left.tick - right.tick || left.factId.localeCompare(right.factId)).at(-1);
}

function requiredCompromisedSourceCount(scenario: Scenario): number {
	return new Set(scenario.private.compromisedSources.map((source) => source.sourceId)).size;
}

function totalPointsForCounts(requiredFieldCount: number, compromisedSourceRequiredCount: number): number {
	return requiredFieldCount + 1 + compromisedSourceRequiredCount + 1 + 1;
}

function missingFactResult(input: ScoreFinalReportQualityFoundationInput): FinalReportQualityFoundationResult {
	const requiredFieldCount = input.scenario.public.finalReportRequiredFields.length;
	const compromisedSourceRequiredCount = requiredCompromisedSourceCount(input.scenario);
	const totalQualityPoints = totalPointsForCounts(requiredFieldCount, compromisedSourceRequiredCount);
	return {
		scorerVersion: FINAL_REPORT_QUALITY_SCORER_VERSION,
		status: "final_report_quality_foundation_with_unsupported",
		scenarioId: input.scenario.scenarioId,
		snapshotId: `${input.snapshot.scenarioId}.final-report-quality`,
		finalReportFound: false,
		requiredFieldSummary: {
			requiredFieldCount,
			presentRequiredFieldCount: 0,
			missingRequiredFields: [...input.scenario.public.finalReportRequiredFields].sort(),
			earnedPoints: 0,
			totalPoints: requiredFieldCount
		},
		primaryEvidenceSummary: { primaryEvidenceRefCount: 0, qualifyingPrimaryEvidenceRefCount: 0, earnedPoints: 0, totalPoints: 1 },
		compromisedSourceSummary: {
			compromisedSourceRequiredCount,
			compromisedSourceReportedCount: 0,
			compromisedSourceMatchedCount: 0,
			earnedPoints: 0,
			totalPoints: compromisedSourceRequiredCount
		},
		remainingRiskSummary: { remainingRiskPresent: false, earnedPoints: 0, totalPoints: 1 },
		containmentClaimSummary: {
			containedFieldPresent: false,
			containmentMatchSupported: false,
			containedMatchesFinalState: null,
			earnedPoints: 0,
			totalPoints: 1
		},
		earnedQualityPoints: 0,
		totalQualityPoints,
		finalReportQualityScore: null,
		unsupportedChecks: [{ checkId: "final_report", reasonCode: "final_report_missing" }],
		caveats: [...FINAL_REPORT_QUALITY_CAVEATS]
	};
}

export function scoreFinalReportQualityFoundation(input: ScoreFinalReportQualityFoundationInput): FinalReportQualityFoundationResult {
	const fact = latestFinalReportFact(input.snapshot);
	if (fact === undefined) return missingFactResult(input);
	const requiredFieldEarnedPoints = fact.presentRequiredFieldCount;
	const primaryEvidenceEarnedPoints = fact.qualifyingPrimaryEvidenceRefCount > 0 ? 1 : 0;
	const compromisedSourceEarnedPoints = fact.compromisedSourceMatchedCount;
	const remainingRiskEarnedPoints = fact.remainingRiskPresent ? 1 : 0;
	const containmentEarnedPoints = fact.containmentMatchSupported ? (fact.containedMatchesFinalState === true ? 1 : 0) : fact.containedFieldPresent ? 1 : 0;
	const totalQualityPoints = totalPointsForCounts(fact.requiredFieldCount, fact.compromisedSourceRequiredCount);
	const earnedQualityPoints =
		requiredFieldEarnedPoints +
		primaryEvidenceEarnedPoints +
		compromisedSourceEarnedPoints +
		remainingRiskEarnedPoints +
		containmentEarnedPoints;
	const unsupportedChecks: FinalReportQualityUnsupportedCheck[] = [];
	if (fact.requiredFieldCount === 0) unsupportedChecks.push({ checkId: "required_fields", reasonCode: "required_fields_undeclared" });

	const supported = unsupportedChecks.length === 0 && totalQualityPoints > 0;
	return {
		scorerVersion: FINAL_REPORT_QUALITY_SCORER_VERSION,
		status: supported ? "final_report_quality_foundation" : "final_report_quality_foundation_with_unsupported",
		scenarioId: input.scenario.scenarioId,
		snapshotId: `${input.snapshot.scenarioId}.final-report-quality`,
		finalReportFound: true,
		requiredFieldSummary: {
			requiredFieldCount: fact.requiredFieldCount,
			presentRequiredFieldCount: fact.presentRequiredFieldCount,
			missingRequiredFields: [...fact.missingRequiredFields],
			earnedPoints: requiredFieldEarnedPoints,
			totalPoints: fact.requiredFieldCount
		},
		primaryEvidenceSummary: {
			primaryEvidenceRefCount: fact.primaryEvidenceRefCount,
			qualifyingPrimaryEvidenceRefCount: fact.qualifyingPrimaryEvidenceRefCount,
			earnedPoints: primaryEvidenceEarnedPoints,
			totalPoints: 1
		},
		compromisedSourceSummary: {
			compromisedSourceRequiredCount: fact.compromisedSourceRequiredCount,
			compromisedSourceReportedCount: fact.compromisedSourceReportedCount,
			compromisedSourceMatchedCount: fact.compromisedSourceMatchedCount,
			earnedPoints: compromisedSourceEarnedPoints,
			totalPoints: fact.compromisedSourceRequiredCount
		},
		remainingRiskSummary: { remainingRiskPresent: fact.remainingRiskPresent, earnedPoints: remainingRiskEarnedPoints, totalPoints: 1 },
		containmentClaimSummary: {
			containedFieldPresent: fact.containedFieldPresent,
			containmentMatchSupported: fact.containmentMatchSupported,
			containedMatchesFinalState: fact.containedMatchesFinalState,
			earnedPoints: containmentEarnedPoints,
			totalPoints: 1
		},
		earnedQualityPoints,
		totalQualityPoints,
		finalReportQualityScore: supported ? (100 * earnedQualityPoints) / totalQualityPoints : null,
		unsupportedChecks,
		caveats: [...FINAL_REPORT_QUALITY_CAVEATS]
	};
}
