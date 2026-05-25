import type { AggregateRunInput, AggregateVariant } from "./aggregate";
import type { ConfidenceIntervalUnsupportedReasonCode, MeanConfidenceIntervalFoundation } from "./confidenceIntervals";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { DEFAULT_CONFIDENCE_LEVEL, computeExhaustiveBootstrapMeanInterval } from "./confidenceIntervals.ts";

export const RESOURCE_USAGE_FOUNDATION_SCORER_VERSION = "0.1.0-resource-usage-foundation" as const;

export type ResourceUsageFoundationStatus = "resource_usage_foundation" | "resource_usage_foundation_with_unsupported";

export type ResourceUsageMetricId =
	| "step_count"
	| "tool_call_count"
	| "model_message_count"
	| "input_token_count"
	| "output_token_count"
	| "total_token_count"
	| "provider_cost_usd";

export type ResourceUsageUnsupportedReasonCode =
	| "no_runs"
	| "unsupported_run_report"
	| "invalid_resource_usage_summary"
	| "missing_token_usage"
	| "missing_provider_cost";

export type ResourceUsageSummary = {
	stepCount: number;
	toolCallCount: number;
	modelMessageCount?: number;
	inputTokenCount?: number;
	outputTokenCount?: number;
	totalTokenCount?: number;
	providerCostUsd?: number;
};

export type ResourceUsageRunInput = AggregateRunInput & {
	resourceUsage: ResourceUsageSummary;
};

export type ResourceUsageMetricSummary = {
	metricId: ResourceUsageMetricId;
	status: "supported" | "unsupported";
	observedRunCount: number;
	total: number | null;
	mean: number | null;
	min: number | null;
	max: number | null;
	meanInterval: MeanConfidenceIntervalFoundation;
	unsupportedRunIds: string[];
	reasonCode?: ResourceUsageUnsupportedReasonCode;
};

export type ResourceUsageUnsupportedRun = {
	runId: string;
	metricId: ResourceUsageMetricId | "run";
	reasonCode: ResourceUsageUnsupportedReasonCode;
};

export type ResourceUsageUnsupportedSummary = {
	unsupportedRunIds: string[];
	unsupportedRunCount: number;
	unsupportedRuns: ResourceUsageUnsupportedRun[];
	reasonCounts: { reasonCode: ResourceUsageUnsupportedReasonCode; count: number }[];
	metricReasonCounts: { metricId: ResourceUsageMetricId | "run"; reasonCode: ResourceUsageUnsupportedReasonCode; count: number }[];
};

export type ResourceUsageVariantSlice = {
	variant: AggregateVariant;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	metricSummaries: ResourceUsageMetricSummary[];
	unsupportedSummary: ResourceUsageUnsupportedSummary;
};

export type AggregateResourceUsageFoundationResult = {
	scorerVersion: typeof RESOURCE_USAGE_FOUNDATION_SCORER_VERSION;
	status: ResourceUsageFoundationStatus;
	confidenceLevel: number;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	metricSummaries: ResourceUsageMetricSummary[];
	variantSlices: ResourceUsageVariantSlice[];
	unsupportedSummary: ResourceUsageUnsupportedSummary;
	caveats: string[];
};

export type ScoreAggregateResourceUsageFoundationInput = {
	runs: ResourceUsageRunInput[];
	confidenceLevel?: number;
};

const METRIC_IDS = [
	"step_count",
	"tool_call_count",
	"model_message_count",
	"input_token_count",
	"output_token_count",
	"total_token_count",
	"provider_cost_usd"
] as const satisfies readonly ResourceUsageMetricId[];

const CAVEATS = [
	"resource-usage foundation aggregates caller-provided sanitized per-run resource summaries only",
	"this scorer does not read env vars, call providers, parse runner artifacts, inspect artifact contents, infer token counts, or infer provider pricing",
	"token totals may be derived only from caller-provided input/output token counts when total token count is absent",
	"mean intervals use the shared exhaustive bootstrap mean helper for samples of size 1 through 6",
	"variant slices use caller-provided metadata only and do not infer clean/attack status from hidden scenario text",
	"provider-cost metrics are caller-provided foundation metrics only and are not official provider-cost accounting or pricing methodology"
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

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function runId(input: ResourceUsageRunInput): string {
	return input.report.runId;
}

function normalizeVariant(input: ResourceUsageRunInput): AggregateVariant {
	const variant = input.metadata?.variant;
	return variant === "attack" || variant === "clean" || variant === "unknown" ? variant : "unknown";
}

function validNonNegativeInteger(value: number | undefined): boolean {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validOptionalNonNegativeNumber(value: number | undefined): boolean {
	return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function hasValidResourceUsage(input: ResourceUsageRunInput): boolean {
	const usage = input.resourceUsage;
	return (
		validNonNegativeInteger(usage.stepCount) &&
		validNonNegativeInteger(usage.toolCallCount) &&
		(usage.modelMessageCount === undefined || validNonNegativeInteger(usage.modelMessageCount)) &&
		validOptionalNonNegativeNumber(usage.inputTokenCount) &&
		validOptionalNonNegativeNumber(usage.outputTokenCount) &&
		validOptionalNonNegativeNumber(usage.totalTokenCount) &&
		validOptionalNonNegativeNumber(usage.providerCostUsd)
	);
}

function baseUnsupportedRun(input: ResourceUsageRunInput): ResourceUsageUnsupportedRun | null {
	if (input.report.status !== "run_score_foundation") {
		return { runId: runId(input), metricId: "run", reasonCode: "unsupported_run_report" };
	}
	if (!hasValidResourceUsage(input)) {
		return { runId: runId(input), metricId: "run", reasonCode: "invalid_resource_usage_summary" };
	}
	return null;
}

function baseSupportedRuns(runs: readonly ResourceUsageRunInput[]): ResourceUsageRunInput[] {
	return runs.filter((input) => baseUnsupportedRun(input) === null);
}

function tokenTotal(usage: ResourceUsageSummary): number | null {
	if (usage.totalTokenCount !== undefined) return usage.totalTokenCount;
	if (usage.inputTokenCount !== undefined && usage.outputTokenCount !== undefined) return usage.inputTokenCount + usage.outputTokenCount;
	return null;
}

function metricValue(input: ResourceUsageRunInput, metricId: ResourceUsageMetricId): number | null {
	const usage = input.resourceUsage;
	switch (metricId) {
		case "step_count":
			return usage.stepCount;
		case "tool_call_count":
			return usage.toolCallCount;
		case "model_message_count":
			return usage.modelMessageCount ?? null;
		case "input_token_count":
			return usage.inputTokenCount ?? null;
		case "output_token_count":
			return usage.outputTokenCount ?? null;
		case "total_token_count":
			return tokenTotal(usage);
		case "provider_cost_usd":
			return usage.providerCostUsd ?? null;
	}
}

function missingReason(metricId: ResourceUsageMetricId): ResourceUsageUnsupportedReasonCode {
	return metricId === "provider_cost_usd" ? "missing_provider_cost" : "missing_token_usage";
}

function metricRequired(metricId: ResourceUsageMetricId): boolean {
	return metricId === "step_count" || metricId === "tool_call_count";
}

function metricUnsupportedRuns(runs: readonly ResourceUsageRunInput[], metricId: ResourceUsageMetricId): ResourceUsageUnsupportedRun[] {
	const output: ResourceUsageUnsupportedRun[] = [];
	for (const input of runs) {
		const base = baseUnsupportedRun(input);
		if (base !== null) {
			output.push({ ...base, metricId });
			continue;
		}
		if (!metricRequired(metricId) && metricValue(input, metricId) === null) {
			output.push({ runId: runId(input), metricId, reasonCode: missingReason(metricId) });
		}
	}
	return output.sort((left, right) => `${left.metricId}:${left.runId}:${left.reasonCode}`.localeCompare(`${right.metricId}:${right.runId}:${right.reasonCode}`));
}

function mean(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function supportedMetricSummary(input: {
	metricId: ResourceUsageMetricId;
	values: number[];
	confidenceLevel: number;
}): ResourceUsageMetricSummary {
	return {
		metricId: input.metricId,
		status: "supported",
		observedRunCount: input.values.length,
		total: input.values.reduce((sum, value) => sum + value, 0),
		mean: mean(input.values),
		min: Math.min(...input.values),
		max: Math.max(...input.values),
		meanInterval: computeExhaustiveBootstrapMeanInterval({ values: input.values, confidenceLevel: input.confidenceLevel }),
		unsupportedRunIds: []
	};
}

function unsupportedMetricSummary(input: {
	metricId: ResourceUsageMetricId;
	reasonCode: ResourceUsageUnsupportedReasonCode;
	confidenceLevel: number;
	sampleCount: number;
	unsupportedRunIds?: string[];
}): ResourceUsageMetricSummary {
	return {
		metricId: input.metricId,
		status: "unsupported",
		observedRunCount: input.sampleCount,
		total: null,
		mean: null,
		min: null,
		max: null,
		meanInterval: unsupportedInterval({
			reasonCode: input.reasonCode === "no_runs" ? "no_runs" : input.sampleCount === 0 ? "no_supported_values" : "unsupported_run_metric",
			confidenceLevel: input.confidenceLevel,
			sampleCount: input.sampleCount,
			...(input.unsupportedRunIds === undefined ? {} : { unsupportedRunIds: input.unsupportedRunIds })
		}),
		unsupportedRunIds: input.unsupportedRunIds ?? [],
		reasonCode: input.reasonCode
	};
}

function metricSummary(runs: readonly ResourceUsageRunInput[], metricId: ResourceUsageMetricId, level: number): ResourceUsageMetricSummary {
	if (runs.length === 0) return unsupportedMetricSummary({ metricId, reasonCode: "no_runs", confidenceLevel: level, sampleCount: 0 });
	const unsupported = metricUnsupportedRuns(runs, metricId);
	const unsupportedRunIds = sortedUnique(unsupported.map((item) => item.runId));
	const supported = baseSupportedRuns(runs).filter((input) => metricValue(input, metricId) !== null);
	if (unsupported.length > 0) {
		return unsupportedMetricSummary({
			metricId,
			reasonCode: unsupported[0]?.reasonCode ?? "invalid_resource_usage_summary",
			confidenceLevel: level,
			sampleCount: supported.length,
			unsupportedRunIds
		});
	}
	if (supported.length === 0) {
		return unsupportedMetricSummary({ metricId, reasonCode: metricRequired(metricId) ? "no_runs" : missingReason(metricId), confidenceLevel: level, sampleCount: 0 });
	}
	return supportedMetricSummary({ metricId, values: supported.map((input) => metricValue(input, metricId) ?? 0), confidenceLevel: level });
}

function metricSummaries(runs: readonly ResourceUsageRunInput[], level: number): ResourceUsageMetricSummary[] {
	return METRIC_IDS.map((metricId) => metricSummary(runs, metricId, level));
}

function unsupportedSummary(runs: readonly ResourceUsageRunInput[]): ResourceUsageUnsupportedSummary {
	const unsupportedRuns = [
		...runs.map(baseUnsupportedRun).filter((item): item is ResourceUsageUnsupportedRun => item !== null),
		...METRIC_IDS.flatMap((metricId) => metricUnsupportedRuns(runs, metricId)).filter((item) => item.reasonCode === "missing_token_usage" || item.reasonCode === "missing_provider_cost")
	].sort((left, right) => `${left.metricId}:${left.runId}:${left.reasonCode}`.localeCompare(`${right.metricId}:${right.runId}:${right.reasonCode}`));
	const reasonCounts = new Map<ResourceUsageUnsupportedReasonCode, number>();
	const metricReasonCounts = new Map<string, { metricId: ResourceUsageMetricId | "run"; reasonCode: ResourceUsageUnsupportedReasonCode; count: number }>();
	for (const item of unsupportedRuns) {
		reasonCounts.set(item.reasonCode, (reasonCounts.get(item.reasonCode) ?? 0) + 1);
		const key = `${item.metricId}:${item.reasonCode}`;
		const current = metricReasonCounts.get(key);
		if (current === undefined) metricReasonCounts.set(key, { metricId: item.metricId, reasonCode: item.reasonCode, count: 1 });
		else current.count += 1;
	}
	return {
		unsupportedRunIds: sortedUnique(unsupportedRuns.map((item) => item.runId)),
		unsupportedRunCount: sortedUnique(unsupportedRuns.map((item) => item.runId)).length,
		unsupportedRuns,
		reasonCounts: [...reasonCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([reasonCode, count]) => ({ reasonCode, count })),
		metricReasonCounts: [...metricReasonCounts.values()].sort((left, right) => `${left.metricId}:${left.reasonCode}`.localeCompare(`${right.metricId}:${right.reasonCode}`))
	};
}

function variantSlices(runs: readonly ResourceUsageRunInput[], level: number): ResourceUsageVariantSlice[] {
	const grouped = new Map<AggregateVariant, ResourceUsageRunInput[]>();
	for (const input of runs) {
		const variant = normalizeVariant(input);
		grouped.set(variant, [...(grouped.get(variant) ?? []), input]);
	}
	return [...grouped.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([variant, sliceRuns]) => {
			const supported = baseSupportedRuns(sliceRuns);
			return {
				variant,
				runCount: sliceRuns.length,
				supportedRunCount: supported.length,
				unsupportedRunCount: sliceRuns.length - supported.length,
				metricSummaries: metricSummaries(sliceRuns, level),
				unsupportedSummary: unsupportedSummary(sliceRuns)
			};
		});
}

function metricSupported(summary: ResourceUsageMetricSummary): boolean {
	return summary.status === "supported" && summary.meanInterval.status === "supported";
}

export function scoreAggregateResourceUsageFoundation(input: ScoreAggregateResourceUsageFoundationInput): AggregateResourceUsageFoundationResult {
	const level = confidenceLevel(input.confidenceLevel);
	const supported = baseSupportedRuns(input.runs);
	const summaries = metricSummaries(input.runs, level);
	return {
		scorerVersion: RESOURCE_USAGE_FOUNDATION_SCORER_VERSION,
		status: summaries.every(metricSupported) && supported.length === input.runs.length ? "resource_usage_foundation" : "resource_usage_foundation_with_unsupported",
		confidenceLevel: level,
		runCount: input.runs.length,
		supportedRunCount: supported.length,
		unsupportedRunCount: input.runs.length - supported.length,
		metricSummaries: summaries,
		variantSlices: variantSlices(input.runs, level),
		unsupportedSummary: unsupportedSummary(input.runs),
		caveats: [...CAVEATS]
	};
}
