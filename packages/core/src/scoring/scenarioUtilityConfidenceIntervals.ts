import type { RateConfidenceIntervalFoundation, MeanConfidenceIntervalFoundation, ConfidenceIntervalUnsupportedReasonCode } from "./confidenceIntervals";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { DEFAULT_CONFIDENCE_LEVEL, computeExhaustiveBootstrapMeanInterval, computeWilsonScoreInterval } from "./confidenceIntervals.ts";
import type { ScenarioUtilityComponentId, ScenarioUtilityUnsupportedReasonCode } from "./scenarioUtility";
import type { AggregateScenarioUtilityRunInput, AggregateScenarioUtilityVariant } from "./scenarioUtilityAggregate";

export const SCENARIO_UTILITY_CONFIDENCE_INTERVAL_SCORER_VERSION = "0.1.0-scenario-utility-confidence-interval-foundation" as const;

export type ScenarioUtilityConfidenceIntervalFoundationStatus =
	| "scenario_utility_confidence_interval_foundation"
	| "scenario_utility_confidence_interval_foundation_with_unsupported";

export type ScenarioUtilityComponentMeanConfidenceInterval = {
	componentId: ScenarioUtilityComponentId;
	observedRunCount: number;
	supportedValueCount: number;
	unsupportedRunCount: number;
	interval: MeanConfidenceIntervalFoundation;
};

export type ScenarioUtilityHardCapRateConfidenceInterval = {
	capId: string;
	count: number;
	totalRunCount: number;
	interval: RateConfidenceIntervalFoundation;
};

export type ScenarioUtilityCapPresentConfidenceInterval = {
	presentCount: number;
	totalRunCount: number;
	interval: RateConfidenceIntervalFoundation;
};

export type ScenarioUtilityConfidenceUnsupportedSummary = {
	unsupportedRunIds: string[];
	unsupportedRunCount: number;
	unsupportedCheckCount: number;
	unsupportedCheckReasonCounts: {
		componentId: ScenarioUtilityComponentId;
		reasonCode: ScenarioUtilityUnsupportedReasonCode;
		count: number;
	}[];
};

export type ScenarioUtilityVariantSliceConfidenceIntervalsFoundation = {
	variant: AggregateScenarioUtilityVariant;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	rawScenarioUtilityMeanInterval: MeanConfidenceIntervalFoundation;
	cappedScenarioUtilityMeanInterval: MeanConfidenceIntervalFoundation;
	componentMeanIntervals: ScenarioUtilityComponentMeanConfidenceInterval[];
	triggeredHardCapRateIntervals: ScenarioUtilityHardCapRateConfidenceInterval[];
	bindingHardCapRateIntervals: ScenarioUtilityHardCapRateConfidenceInterval[];
	scenarioUtilityCapPresentRateInterval: ScenarioUtilityCapPresentConfidenceInterval;
};

export type AggregateScenarioUtilityConfidenceIntervalsFoundation = {
	scorerVersion: typeof SCENARIO_UTILITY_CONFIDENCE_INTERVAL_SCORER_VERSION;
	status: ScenarioUtilityConfidenceIntervalFoundationStatus;
	confidenceLevel: number;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	rawScenarioUtilityMeanInterval: MeanConfidenceIntervalFoundation;
	cappedScenarioUtilityMeanInterval: MeanConfidenceIntervalFoundation;
	componentMeanIntervals: ScenarioUtilityComponentMeanConfidenceInterval[];
	triggeredHardCapRateIntervals: ScenarioUtilityHardCapRateConfidenceInterval[];
	bindingHardCapRateIntervals: ScenarioUtilityHardCapRateConfidenceInterval[];
	scenarioUtilityCapPresentRateInterval: ScenarioUtilityCapPresentConfidenceInterval;
	variantSlices: ScenarioUtilityVariantSliceConfidenceIntervalsFoundation[];
	unsupportedAggregate: ScenarioUtilityConfidenceUnsupportedSummary;
	caveats: string[];
};

export type ScoreAggregateScenarioUtilityConfidenceIntervalsFoundationInput = {
	runs: AggregateScenarioUtilityRunInput[];
	confidenceLevel?: number;
};

const CAVEATS = [
	"Scenario Utility confidence interval foundation over already-scored Scenario Utility foundation reports only",
	"mean intervals use the shared exhaustive ordered bootstrap helper for samples of size 1 through 6",
	"hard-cap rate intervals use the shared Wilson score helper",
	"variant slices use caller-provided metadata only and do not infer clean/attack status from hidden scenario text",
	"no headline score, official score, leaderboard readiness, rank, non-foundation Robust Utility score, runner artifact scoring, or full V1 claim is implied"
] as const;

function confidenceLevel(input?: number): number {
	return input ?? DEFAULT_CONFIDENCE_LEVEL;
}

function unsupportedInterval(input: {
	reasonCode: ConfidenceIntervalUnsupportedReasonCode;
	confidenceLevel: number;
	sampleCount: number;
	unsupportedRunIds?: string[];
}): MeanConfidenceIntervalFoundation {
	return {
		status: "unsupported",
		reasonCode: input.reasonCode,
		confidenceLevel: input.confidenceLevel,
		sampleCount: input.sampleCount,
		...(input.unsupportedRunIds === undefined ? {} : { unsupportedRunIds: input.unsupportedRunIds })
	};
}

function unsupportedRateInterval(input: {
	reasonCode: ConfidenceIntervalUnsupportedReasonCode;
	confidenceLevel: number;
	sampleCount: number;
	unsupportedRunIds?: string[];
}): RateConfidenceIntervalFoundation {
	return unsupportedInterval(input);
}

function runId(input: AggregateScenarioUtilityRunInput): string {
	return input.report.runId;
}

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

function supportedRunCount(runs: readonly AggregateScenarioUtilityRunInput[]): number {
	return runs.filter(isSupportedRun).length;
}

function unsupportedRunIds(runs: readonly AggregateScenarioUtilityRunInput[]): string[] {
	return runs.filter((input) => !isSupportedRun(input)).map(runId).sort();
}

function utilityMeanInterval(
	runs: readonly AggregateScenarioUtilityRunInput[],
	level: number,
	key: "rawScenarioUtilityScore" | "cappedScenarioUtilityScore"
): MeanConfidenceIntervalFoundation {
	if (runs.length === 0) return unsupportedInterval({ reasonCode: "no_runs", confidenceLevel: level, sampleCount: 0 });
	const unsupported = unsupportedRunIds(runs);
	if (unsupported.length > 0) {
		return unsupportedInterval({ reasonCode: "unsupported_run_metric", confidenceLevel: level, sampleCount: runs.length, unsupportedRunIds: unsupported });
	}
	return computeExhaustiveBootstrapMeanInterval({
		values: runs.map((input) => {
			const value = input.report[key];
			if (value === null) throw new Error("Scenario Utility metric unexpectedly missing after supported-run filtering");
			return value;
		}),
		confidenceLevel: level
	});
}

function componentIds(runs: readonly AggregateScenarioUtilityRunInput[]): ScenarioUtilityComponentId[] {
	const ids = new Set<ScenarioUtilityComponentId>();
	for (const input of runs) {
		for (const component of input.report.componentResults) ids.add(component.componentId);
	}
	return [...ids];
}

function componentMeanIntervals(
	runs: readonly AggregateScenarioUtilityRunInput[],
	level: number
): ScenarioUtilityComponentMeanConfidenceInterval[] {
	return componentIds(runs).map((componentId) => {
		const unsupportedIds: string[] = [];
		const values: number[] = [];
		let observedRunCount = 0;
		for (const input of runs) {
			const component = input.report.componentResults.find((item) => item.componentId === componentId);
			if (component === undefined) {
				unsupportedIds.push(runId(input));
				continue;
			}
			observedRunCount += 1;
			if (component.status !== "supported" || component.score === null || !Number.isFinite(component.score)) {
				unsupportedIds.push(runId(input));
				continue;
			}
			values.push(component.score);
		}
		const unsupported = [...unsupportedIds].sort();
		const interval =
			unsupported.length > 0
				? unsupportedInterval({ reasonCode: "unsupported_run_metric", confidenceLevel: level, sampleCount: observedRunCount, unsupportedRunIds: unsupported })
				: computeExhaustiveBootstrapMeanInterval({ values, confidenceLevel: level });
		return {
			componentId,
			observedRunCount,
			supportedValueCount: values.length,
			unsupportedRunCount: unsupported.length,
			interval
		};
	});
}

function countIdsByRun(idsByRun: string[][]): { id: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const ids of idsByRun) {
		for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, count]) => ({ id, count }));
}

function rateInterval(successes: number, total: number, level: number): RateConfidenceIntervalFoundation {
	if (total === 0) return unsupportedRateInterval({ reasonCode: "no_runs", confidenceLevel: level, sampleCount: 0 });
	return computeWilsonScoreInterval({ successes, total, confidenceLevel: level });
}

function hardCapRateIntervals(
	runs: readonly AggregateScenarioUtilityRunInput[],
	level: number,
	key: "triggeredCapIds" | "bindingCapIds"
): ScenarioUtilityHardCapRateConfidenceInterval[] {
	return countIdsByRun(runs.map((input) => input.report.hardCapSummary[key])).map(({ id, count }) => ({
		capId: id,
		count,
		totalRunCount: runs.length,
		interval: rateInterval(count, runs.length, level)
	}));
}

function scenarioUtilityCapPresentRateInterval(
	runs: readonly AggregateScenarioUtilityRunInput[],
	level: number
): ScenarioUtilityCapPresentConfidenceInterval {
	const presentCount = runs.filter((input) => input.report.hardCapSummary.scenarioUtilityCap !== null).length;
	return {
		presentCount,
		totalRunCount: runs.length,
		interval: rateInterval(presentCount, runs.length, level)
	};
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

function unsupportedAggregate(runs: readonly AggregateScenarioUtilityRunInput[]): ScenarioUtilityConfidenceUnsupportedSummary {
	const runIds = unsupportedRunIds(runs);
	const reasonCounts = new Map<string, { componentId: ScenarioUtilityComponentId; reasonCode: ScenarioUtilityUnsupportedReasonCode; count: number }>();
	for (const input of runs) {
		for (const check of input.report.unsupportedChecks) incrementReason(reasonCounts, check.componentId, check.reasonCode);
	}
	return {
		unsupportedRunIds: runIds,
		unsupportedRunCount: runIds.length,
		unsupportedCheckCount: runs.reduce((sum, input) => sum + input.report.unsupportedChecks.length, 0),
		unsupportedCheckReasonCounts: [...reasonCounts.values()].sort((left, right) =>
			`${left.componentId}:${left.reasonCode}`.localeCompare(`${right.componentId}:${right.reasonCode}`)
		)
	};
}

function variantSlices(
	runs: readonly AggregateScenarioUtilityRunInput[],
	level: number
): ScenarioUtilityVariantSliceConfidenceIntervalsFoundation[] {
	const grouped = new Map<AggregateScenarioUtilityVariant, AggregateScenarioUtilityRunInput[]>();
	for (const input of runs) {
		const variant = normalizeVariant(input);
		grouped.set(variant, [...(grouped.get(variant) ?? []), input]);
	}
	return [...grouped.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([variant, sliceRuns]) => {
			const supported = supportedRunCount(sliceRuns);
			return {
				variant,
				runCount: sliceRuns.length,
				supportedRunCount: supported,
				unsupportedRunCount: sliceRuns.length - supported,
				rawScenarioUtilityMeanInterval: utilityMeanInterval(sliceRuns, level, "rawScenarioUtilityScore"),
				cappedScenarioUtilityMeanInterval: utilityMeanInterval(sliceRuns, level, "cappedScenarioUtilityScore"),
				componentMeanIntervals: componentMeanIntervals(sliceRuns, level),
				triggeredHardCapRateIntervals: hardCapRateIntervals(sliceRuns, level, "triggeredCapIds"),
				bindingHardCapRateIntervals: hardCapRateIntervals(sliceRuns, level, "bindingCapIds"),
				scenarioUtilityCapPresentRateInterval: scenarioUtilityCapPresentRateInterval(sliceRuns, level)
			};
		});
}

function intervalSupported(interval: MeanConfidenceIntervalFoundation | RateConfidenceIntervalFoundation): boolean {
	return interval.status === "supported";
}

export function scoreAggregateScenarioUtilityConfidenceIntervalsFoundation(
	input: ScoreAggregateScenarioUtilityConfidenceIntervalsFoundationInput
): AggregateScenarioUtilityConfidenceIntervalsFoundation {
	const level = confidenceLevel(input.confidenceLevel);
	const supported = supportedRunCount(input.runs);
	const rawInterval = utilityMeanInterval(input.runs, level, "rawScenarioUtilityScore");
	const cappedInterval = utilityMeanInterval(input.runs, level, "cappedScenarioUtilityScore");
	const componentIntervals = componentMeanIntervals(input.runs, level);
	const triggeredIntervals = hardCapRateIntervals(input.runs, level, "triggeredCapIds");
	const bindingIntervals = hardCapRateIntervals(input.runs, level, "bindingCapIds");
	const scenarioCapInterval = scenarioUtilityCapPresentRateInterval(input.runs, level);
	const slices = variantSlices(input.runs, level);
	const unsupportedRunCount = input.runs.length - supported;
	return {
		scorerVersion: SCENARIO_UTILITY_CONFIDENCE_INTERVAL_SCORER_VERSION,
		status:
			intervalSupported(rawInterval) && intervalSupported(cappedInterval) && unsupportedRunCount === 0
				? "scenario_utility_confidence_interval_foundation"
				: "scenario_utility_confidence_interval_foundation_with_unsupported",
		confidenceLevel: level,
		runCount: input.runs.length,
		supportedRunCount: supported,
		unsupportedRunCount,
		rawScenarioUtilityMeanInterval: rawInterval,
		cappedScenarioUtilityMeanInterval: cappedInterval,
		componentMeanIntervals: componentIntervals,
		triggeredHardCapRateIntervals: triggeredIntervals,
		bindingHardCapRateIntervals: bindingIntervals,
		scenarioUtilityCapPresentRateInterval: scenarioCapInterval,
		variantSlices: slices,
		unsupportedAggregate: unsupportedAggregate(input.runs),
		caveats: [...CAVEATS]
	};
}
