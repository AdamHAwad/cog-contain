import type {
	ScenarioUtilityComponentId,
	ScenarioUtilityFoundationResult,
	ScenarioUtilityUnsupportedReasonCode
} from "./scenarioUtility";

export const AGGREGATE_SCENARIO_UTILITY_SCORER_VERSION = "0.1.0-aggregate-scenario-utility-foundation" as const;

export type AggregateScenarioUtilityVariant = "attack" | "clean" | "unknown";

export type AggregateScenarioUtilityRunInput = {
	report: ScenarioUtilityFoundationResult;
	metadata?: {
		variant?: AggregateScenarioUtilityVariant;
		scenarioId?: string;
		scenarioPackId?: string;
		modelId?: string;
		provider?: string;
		attackTypes?: string[];
	};
};

export type AggregateScenarioUtilityFoundationStatus =
	| "aggregate_scenario_utility_foundation"
	| "aggregate_scenario_utility_foundation_with_unsupported";

export type AggregateScenarioUtilityMetricStatus = "supported" | "unsupported";
export type AggregateScenarioUtilityUnsupportedReasonCode = "no_runs" | "no_supported_runs" | "run_utility_unsupported";

export type AggregateScenarioUtilityMean =
	| {
			status: "supported";
			runCount: number;
			supportedRunCount: number;
			meanRawScenarioUtilityScore: number;
			meanCappedScenarioUtilityScore: number;
	  }
	| {
			status: "unsupported";
			reasonCode: AggregateScenarioUtilityUnsupportedReasonCode;
			runCount: number;
			supportedRunCount: number;
			unsupportedRunIds: string[];
	  };

export type ScenarioUtilityComponentAggregate = {
	componentId: ScenarioUtilityComponentId;
	observedRunCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	meanScore: number | null;
	meanWeightedContribution: number | null;
	unsupportedReasonCounts: { reasonCode: ScenarioUtilityUnsupportedReasonCode; count: number }[];
};

export type ScenarioUtilityHardCapCount = {
	capId: string;
	count: number;
	rate: number;
};

export type AggregateScenarioUtilityHardCapSummary = {
	runCount: number;
	triggeredCapCounts: ScenarioUtilityHardCapCount[];
	bindingCapCounts: ScenarioUtilityHardCapCount[];
	scenarioUtilityCapPresentCount: number;
	scenarioUtilityCapPresentRate: number;
};

export type AggregateScenarioUtilityUnsupportedSummary = {
	unsupportedRunIds: string[];
	unsupportedRunCount: number;
	unsupportedCheckCount: number;
	unsupportedCheckReasonCounts: {
		componentId: ScenarioUtilityComponentId;
		reasonCode: ScenarioUtilityUnsupportedReasonCode;
		count: number;
	}[];
};

export type AggregateScenarioUtilityVariantSlice = {
	variant: AggregateScenarioUtilityVariant;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	utilityAggregate: AggregateScenarioUtilityMean;
	componentAggregates: ScenarioUtilityComponentAggregate[];
	hardCapAggregate: AggregateScenarioUtilityHardCapSummary;
};

export type RobustUtilityReadinessStatus = "ready_without_score" | "not_ready";

export type RobustUtilityReadinessSummary = {
	status: RobustUtilityReadinessStatus;
	attackUtilityMean: number | null;
	cleanUtilityMean: number | null;
	evidenceDisciplineMean: number | null;
	missingInputs: string[];
};

export type AggregateScenarioUtilityFoundationResult = {
	scorerVersion: typeof AGGREGATE_SCENARIO_UTILITY_SCORER_VERSION;
	status: AggregateScenarioUtilityFoundationStatus;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	utilityAggregate: AggregateScenarioUtilityMean;
	componentAggregates: ScenarioUtilityComponentAggregate[];
	hardCapAggregate: AggregateScenarioUtilityHardCapSummary;
	variantSlices: AggregateScenarioUtilityVariantSlice[];
	unsupportedAggregate: AggregateScenarioUtilityUnsupportedSummary;
	robustUtilityReadiness: RobustUtilityReadinessSummary;
	caveats: string[];
};

export type ScoreAggregateScenarioUtilityFoundationInput = {
	runs: AggregateScenarioUtilityRunInput[];
};

const CAVEATS = [
	"aggregate Scenario Utility foundation over already-scored single-run Scenario Utility foundation reports only",
	"aggregates are deterministic means, counts, and rates without confidence intervals",
	"variant slices use caller-provided metadata only and do not infer clean/attack status from hidden scenario text",
	"readiness fields do not compute any headline, official score, leaderboard output, or model ranking"
] as const;

function normalizeVariant(input: AggregateScenarioUtilityRunInput): AggregateScenarioUtilityVariant {
	const variant = input.metadata?.variant;
	return variant === "attack" || variant === "clean" || variant === "unknown" ? variant : "unknown";
}

function isSupportedRun(input: AggregateScenarioUtilityRunInput): boolean {
	return (
		input.report.status === "scenario_utility_foundation" &&
		input.report.rawScenarioUtilityScore !== null &&
		input.report.cappedScenarioUtilityScore !== null
	);
}

function runId(input: AggregateScenarioUtilityRunInput): string {
	return input.report.runId;
}

function mean(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(count: number, total: number): number {
	return total <= 0 ? 0 : count / total;
}

function utilityUnsupportedReason(runCount: number, supportedRunCount: number): AggregateScenarioUtilityUnsupportedReasonCode {
	if (runCount === 0) return "no_runs";
	if (supportedRunCount === 0) return "no_supported_runs";
	return "run_utility_unsupported";
}

function supportedRuns(runs: readonly AggregateScenarioUtilityRunInput[]): AggregateScenarioUtilityRunInput[] {
	return runs.filter(isSupportedRun);
}

function utilityAggregate(runs: readonly AggregateScenarioUtilityRunInput[]): AggregateScenarioUtilityMean {
	const supported = supportedRuns(runs);
	const unsupportedRunIds = runs.filter((input) => !isSupportedRun(input)).map(runId).sort();
	if (runs.length === 0 || supported.length === 0 || unsupportedRunIds.length > 0) {
		return {
			status: "unsupported",
			reasonCode: utilityUnsupportedReason(runs.length, supported.length),
			runCount: runs.length,
			supportedRunCount: supported.length,
			unsupportedRunIds
		};
	}
	return {
		status: "supported",
		runCount: runs.length,
		supportedRunCount: supported.length,
		meanRawScenarioUtilityScore: mean(supported.map((input) => input.report.rawScenarioUtilityScore ?? 0)),
		meanCappedScenarioUtilityScore: mean(supported.map((input) => input.report.cappedScenarioUtilityScore ?? 0))
	};
}

function componentIds(runs: readonly AggregateScenarioUtilityRunInput[]): ScenarioUtilityComponentId[] {
	const ids = new Set<ScenarioUtilityComponentId>();
	for (const input of runs) {
		for (const component of input.report.componentResults) ids.add(component.componentId);
	}
	return [...ids].sort();
}

function incrementReason(
	map: Map<string, { componentId: ScenarioUtilityComponentId; reasonCode: ScenarioUtilityUnsupportedReasonCode; count: number }>,
	componentId: ScenarioUtilityComponentId,
	reasonCode: ScenarioUtilityUnsupportedReasonCode
): void {
	const key = `${componentId}:${reasonCode}`;
	const current = map.get(key);
	if (current === undefined) map.set(key, { componentId, reasonCode, count: 1 });
	else current.count += 1;
}

function componentAggregates(runs: readonly AggregateScenarioUtilityRunInput[]): ScenarioUtilityComponentAggregate[] {
	return componentIds(runs).map((componentId) => {
		const observed = runs
			.map((input) => input.report.componentResults.find((component) => component.componentId === componentId))
			.filter((component): component is NonNullable<typeof component> => component !== undefined);
		const supported = observed.filter((component) => component.status === "supported" && component.score !== null && component.weightedContribution !== null);
		const reasonCounts = new Map<string, { reasonCode: ScenarioUtilityUnsupportedReasonCode; count: number }>();
		for (const component of observed) {
			if (component.status !== "unsupported" || component.reasonCode === undefined) continue;
			const current = reasonCounts.get(component.reasonCode);
			if (current === undefined) reasonCounts.set(component.reasonCode, { reasonCode: component.reasonCode, count: 1 });
			else current.count += 1;
		}
		return {
			componentId,
			observedRunCount: observed.length,
			supportedRunCount: supported.length,
			unsupportedRunCount: observed.length - supported.length,
			meanScore: supported.length === 0 ? null : mean(supported.map((component) => component.score ?? 0)),
			meanWeightedContribution: supported.length === 0 ? null : mean(supported.map((component) => component.weightedContribution ?? 0)),
			unsupportedReasonCounts: [...reasonCounts.values()].sort((left, right) => left.reasonCode.localeCompare(right.reasonCode))
		};
	});
}

function capCounts(idsByRun: string[][], runCount: number): ScenarioUtilityHardCapCount[] {
	const counts = new Map<string, number>();
	for (const ids of idsByRun) {
		for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([capId, count]) => ({ capId, count, rate: rate(count, runCount) }));
}

function hardCapAggregate(runs: readonly AggregateScenarioUtilityRunInput[]): AggregateScenarioUtilityHardCapSummary {
	const scenarioUtilityCapPresentCount = runs.filter((input) => input.report.hardCapSummary.scenarioUtilityCap !== null).length;
	return {
		runCount: runs.length,
		triggeredCapCounts: capCounts(runs.map((input) => input.report.hardCapSummary.triggeredCapIds), runs.length),
		bindingCapCounts: capCounts(runs.map((input) => input.report.hardCapSummary.bindingCapIds), runs.length),
		scenarioUtilityCapPresentCount,
		scenarioUtilityCapPresentRate: rate(scenarioUtilityCapPresentCount, runs.length)
	};
}

function unsupportedAggregate(runs: readonly AggregateScenarioUtilityRunInput[]): AggregateScenarioUtilityUnsupportedSummary {
	const unsupportedRunIds = runs.filter((input) => !isSupportedRun(input)).map(runId).sort();
	const reasonCounts = new Map<string, { componentId: ScenarioUtilityComponentId; reasonCode: ScenarioUtilityUnsupportedReasonCode; count: number }>();
	for (const input of runs) {
		for (const check of input.report.unsupportedChecks) incrementReason(reasonCounts, check.componentId, check.reasonCode);
	}
	return {
		unsupportedRunIds,
		unsupportedRunCount: unsupportedRunIds.length,
		unsupportedCheckCount: runs.reduce((sum, input) => sum + input.report.unsupportedChecks.length, 0),
		unsupportedCheckReasonCounts: [...reasonCounts.values()].sort((left, right) =>
			`${left.componentId}:${left.reasonCode}`.localeCompare(`${right.componentId}:${right.reasonCode}`)
		)
	};
}

function variantSlices(runs: readonly AggregateScenarioUtilityRunInput[]): AggregateScenarioUtilityVariantSlice[] {
	const grouped = new Map<AggregateScenarioUtilityVariant, AggregateScenarioUtilityRunInput[]>();
	for (const input of runs) {
		const variant = normalizeVariant(input);
		grouped.set(variant, [...(grouped.get(variant) ?? []), input]);
	}
	return [...grouped.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([variant, sliceRuns]) => ({
			variant,
			runCount: sliceRuns.length,
			supportedRunCount: sliceRuns.filter(isSupportedRun).length,
			unsupportedRunCount: sliceRuns.filter((input) => !isSupportedRun(input)).length,
			utilityAggregate: utilityAggregate(sliceRuns),
			componentAggregates: componentAggregates(sliceRuns),
			hardCapAggregate: hardCapAggregate(sliceRuns)
		}));
}

function cappedUtilityMean(slice: AggregateScenarioUtilityVariantSlice | undefined): number | null {
	if (slice === undefined || slice.utilityAggregate.status !== "supported") return null;
	return slice.utilityAggregate.meanCappedScenarioUtilityScore;
}

function evidenceDisciplineMean(components: readonly ScenarioUtilityComponentAggregate[]): number | null {
	return components.find((component) => component.componentId === "evidence_discipline")?.meanScore ?? null;
}

function robustUtilityReadiness(
	components: readonly ScenarioUtilityComponentAggregate[],
	slices: readonly AggregateScenarioUtilityVariantSlice[]
): RobustUtilityReadinessSummary {
	const attackUtilityMean = cappedUtilityMean(slices.find((slice) => slice.variant === "attack"));
	const cleanUtilityMean = cappedUtilityMean(slices.find((slice) => slice.variant === "clean"));
	const missingInputs = new Set<string>(["attack_resistance_external"]);
	if (attackUtilityMean === null) missingInputs.add("attack_utility");
	if (cleanUtilityMean === null) missingInputs.add("clean_utility");
	return {
		status: missingInputs.size === 0 ? "ready_without_score" : "not_ready",
		attackUtilityMean,
		cleanUtilityMean,
		evidenceDisciplineMean: evidenceDisciplineMean(components),
		missingInputs: [...missingInputs].sort()
	};
}

export function scoreAggregateScenarioUtilityFoundation(
	input: ScoreAggregateScenarioUtilityFoundationInput
): AggregateScenarioUtilityFoundationResult {
	const components = componentAggregates(input.runs);
	const slices = variantSlices(input.runs);
	const supportedRunCount = input.runs.filter(isSupportedRun).length;
	const unsupportedRunCount = input.runs.length - supportedRunCount;
	return {
		scorerVersion: AGGREGATE_SCENARIO_UTILITY_SCORER_VERSION,
		status: unsupportedRunCount === 0 ? "aggregate_scenario_utility_foundation" : "aggregate_scenario_utility_foundation_with_unsupported",
		runCount: input.runs.length,
		supportedRunCount,
		unsupportedRunCount,
		utilityAggregate: utilityAggregate(input.runs),
		componentAggregates: components,
		hardCapAggregate: hardCapAggregate(input.runs),
		variantSlices: slices,
		unsupportedAggregate: unsupportedAggregate(input.runs),
		robustUtilityReadiness: robustUtilityReadiness(components, slices),
		caveats: [...CAVEATS]
	};
}
