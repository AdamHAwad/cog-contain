import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	MockArtifactAggregateManifest,
	MockArtifactAggregateReport,
	MockArtifactAggregateUnsupportedRunSummary,
	MockArtifactAggregateWriteConfig,
	MockArtifactAggregateWriteResult,
	MockArtifactScoreEvent,
	MockArtifactScoreMetrics,
	MockArtifactScoreReport,
	MockArtifactScorerVersions
} from "../types";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { MOCK_ARTIFACT_SCORE_SCHEMA_VERSION } from "./mockArtifactScoreReport.ts";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { sha256Hex, stableJson } from "../artifacts/hashChain.ts";

export const MOCK_ARTIFACT_AGGREGATE_SCHEMA_VERSION = "phase-6r.mock-artifact-aggregate.v1" as const;

const AGGREGATE_REPORT_FILE = "aggregate-score-report.json" as const;
const AGGREGATE_MANIFEST_FILE = "aggregate-manifest.json" as const;
const SOURCE_FILES = ["score-report.json", "score-events.jsonl", "scenario-public.json"] as const;
const ALLOWED_SCORE_EVENT_KEYS = [
	"eventId",
	"itemId",
	"itemType",
	"pointsApplied",
	"pointsConsidered",
	"predicateKind",
	"reasonCode",
	"runId",
	"scenarioId",
	"status",
	"supported"
] as const;

const CAVEATS = [
	"mock-only sanitized aggregate import over explicit Phase 6Q score artifact directories",
	"input reading is limited to score-report.json, score-events.jsonl, replay-manifest.json, and scenario-public.json for each explicit run directory",
	"aggregate output stores only IDs, counts, statuses, scalar metrics, scorer-version labels, and safe reason codes",
	"source score reports, score-event arrays, source manifest hash maps, trajectories, state snapshots, notes, model metadata, run configs, raw model output, raw tool arguments, raw observations, evidence/source arrays, final-report values, private scenario prose, public document text, adversarial payload text, sensitive personnel/spatial descriptors, provider request/response bodies, env values, and secret data are not included",
	"not official scoring, not headline scoring, not leaderboard or rank readiness, not model ranking, not official pricing methodology, not live-provider artifact scoring, and not replay-grade persistence",
	"core aggregate score-report gaps for runner artifact scoring and official publication remain deferred"
] as const;

type JsonRecord = Record<string, unknown>;
type ScoredMockArtifactScoreReport = Extract<MockArtifactScoreReport, { status: "scored_foundation" | "scored_foundation_with_unsupported" }>;

type ImportedRun = {
	runDir: string;
	runId: string;
	scenarioId: string;
	artifactSchemaVersion: string;
	scorerVersions: { label: string; value: string }[];
	metrics: MockArtifactScoreMetrics;
	scoreEvents: MockArtifactScoreEvent[];
	reasonCodes: string[];
	hashVerification: {
		verified: boolean;
		missingHashCount: number;
		hashMismatchCount: number;
	};
};

type HashCheck = {
	missingHashCount: number;
	hashMismatchCount: number;
};

function asRecord(value: unknown, label: string): JsonRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as JsonRecord;
}

function asString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
	return value;
}

function asBoolean(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
	return value;
}

function asFiniteNumber(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
	return value;
}

function asFiniteNumberOrNull(value: unknown, label: string): number | null {
	return value === null ? null : asFiniteNumber(value, label);
}

function asNonNegativeInteger(value: unknown, label: string): number {
	const parsed = asFiniteNumber(value, label);
	if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer`);
	return parsed;
}

function parseJson(text: string, label: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`${label} is not valid JSON`);
	}
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function scorerVersionEntries(input: unknown): { label: string; value: string }[] {
	const record = asRecord(input, "scorerVersions");
	return Object.entries(record)
		.map(([label, value]) => ({ label, value: asString(value, `scorerVersions.${label}`) }))
		.sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

function validateMetrics(input: unknown): MockArtifactScoreMetrics {
	const metrics = asRecord(input, "score metrics");
	return {
		runScoreStatus: asString(metrics.runScoreStatus, "metrics.runScoreStatus"),
		objectiveCompletionStatus: asString(metrics.objectiveCompletionStatus, "metrics.objectiveCompletionStatus"),
		objectiveCompletionScore: asFiniteNumberOrNull(metrics.objectiveCompletionScore, "metrics.objectiveCompletionScore"),
		weightedAttackSuccessRate: asFiniteNumberOrNull(metrics.weightedAttackSuccessRate, "metrics.weightedAttackSuccessRate"),
		attackResistanceScore: asFiniteNumberOrNull(metrics.attackResistanceScore, "metrics.attackResistanceScore"),
		triggeredPenaltyCount: asNonNegativeInteger(metrics.triggeredPenaltyCount, "metrics.triggeredPenaltyCount"),
		unsupportedPenaltyCount: asNonNegativeInteger(metrics.unsupportedPenaltyCount, "metrics.unsupportedPenaltyCount"),
		hardCapCount: asNonNegativeInteger(metrics.hardCapCount, "metrics.hardCapCount"),
		predicateScoreEventCount: asNonNegativeInteger(metrics.predicateScoreEventCount, "metrics.predicateScoreEventCount"),
		scenarioUtilityStatus: asString(metrics.scenarioUtilityStatus, "metrics.scenarioUtilityStatus"),
		rawScenarioUtilityScore: asFiniteNumberOrNull(metrics.rawScenarioUtilityScore, "metrics.rawScenarioUtilityScore"),
		cappedScenarioUtilityScore: asFiniteNumberOrNull(metrics.cappedScenarioUtilityScore, "metrics.cappedScenarioUtilityScore"),
		finalReportQualityStatus: asString(metrics.finalReportQualityStatus, "metrics.finalReportQualityStatus"),
		finalReportQualityScore: asFiniteNumberOrNull(metrics.finalReportQualityScore, "metrics.finalReportQualityScore"),
		unsupportedItemCount: asNonNegativeInteger(metrics.unsupportedItemCount, "metrics.unsupportedItemCount"),
		unsupportedScenarioUtilityCheckCount: asNonNegativeInteger(
			metrics.unsupportedScenarioUtilityCheckCount,
			"metrics.unsupportedScenarioUtilityCheckCount"
		),
		unsupportedFinalReportQualityCheckCount: asNonNegativeInteger(
			metrics.unsupportedFinalReportQualityCheckCount,
			"metrics.unsupportedFinalReportQualityCheckCount"
		),
		scoreEventCount: asNonNegativeInteger(metrics.scoreEventCount, "metrics.scoreEventCount"),
		objectiveCount: asNonNegativeInteger(metrics.objectiveCount, "metrics.objectiveCount"),
		penaltyCount: asNonNegativeInteger(metrics.penaltyCount, "metrics.penaltyCount")
	};
}

function validateScoreReport(input: unknown, label: string): ScoredMockArtifactScoreReport {
	const report = asRecord(input, label);
	const artifactSchemaVersion = asString(report.artifactSchemaVersion, `${label}.artifactSchemaVersion`);
	if (artifactSchemaVersion !== MOCK_ARTIFACT_SCORE_SCHEMA_VERSION) throw new Error(`${label} schema version mismatch`);
	const mode = asString(report.mode, `${label}.mode`);
	if (mode !== "mock") throw new Error(`${label} mode mismatch`);
	const status = asString(report.status, `${label}.status`);
	if (status !== "scored_foundation" && status !== "scored_foundation_with_unsupported") {
		throw new Error(`${label} is not a scored mock foundation report`);
	}
	return {
		artifactSchemaVersion,
		runId: asString(report.runId, `${label}.runId`),
		scenarioId: asString(report.scenarioId, `${label}.scenarioId`),
		mode: "mock",
		status,
		scorerVersions: Object.fromEntries(scorerVersionEntries(report.scorerVersions).map((entry) => [entry.label, entry.value])) as MockArtifactScorerVersions,
		metrics: validateMetrics(report.metrics),
		caveats: []
	};
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateScoreEvent(input: unknown, label: string): MockArtifactScoreEvent {
	const record = asRecord(input, label);
	const keys = Object.keys(record).sort();
	if (!sameStringArray(keys, [...ALLOWED_SCORE_EVENT_KEYS].sort())) throw new Error(`${label} has unsupported keys`);
	return {
		eventId: asString(record.eventId, `${label}.eventId`),
		scenarioId: asString(record.scenarioId, `${label}.scenarioId`),
		runId: asString(record.runId, `${label}.runId`),
		itemType: asString(record.itemType, `${label}.itemType`),
		itemId: asString(record.itemId, `${label}.itemId`),
		predicateKind: asString(record.predicateKind, `${label}.predicateKind`),
		status: asString(record.status, `${label}.status`),
		supported: asBoolean(record.supported, `${label}.supported`),
		pointsConsidered: asFiniteNumber(record.pointsConsidered, `${label}.pointsConsidered`),
		pointsApplied: asFiniteNumber(record.pointsApplied, `${label}.pointsApplied`),
		reasonCode: asString(record.reasonCode, `${label}.reasonCode`)
	};
}

function parseScoreEvents(text: string, label: string): MockArtifactScoreEvent[] {
	const lines = text.trim().length === 0 ? [] : text.trim().split(/\n+/);
	return lines.map((line, index) => validateScoreEvent(parseJson(line, `${label}.${index + 1}`), `${label}.${index + 1}`));
}

function fileHashes(manifest: unknown): JsonRecord {
	return asRecord(asRecord(manifest, "replay-manifest").fileHashes, "replay-manifest.fileHashes");
}

function verifySourceHashes(input: { manifest: unknown; fileTexts: Record<(typeof SOURCE_FILES)[number], string> }): HashCheck {
	const hashes = fileHashes(input.manifest);
	let missingHashCount = 0;
	let hashMismatchCount = 0;
	for (const fileName of SOURCE_FILES) {
		const expected = hashes[fileName];
		if (typeof expected !== "string") {
			missingHashCount += 1;
			continue;
		}
		if (sha256Hex(input.fileTexts[fileName]) !== expected) hashMismatchCount += 1;
	}
	return { missingHashCount, hashMismatchCount };
}

function validateScenarioPublic(input: unknown, label: string): { scenarioId: string; artifactSchemaVersion: string } {
	const scenarioPublic = asRecord(input, label);
	if (scenarioPublic.scenarioSummaryKind !== "sanitized_public_metadata") throw new Error(`${label} is not a sanitized public metadata summary`);
	return {
		scenarioId: asString(scenarioPublic.scenarioId, `${label}.scenarioId`),
		artifactSchemaVersion: asString(scenarioPublic.artifactSchemaVersion, `${label}.artifactSchemaVersion`)
	};
}

function issueReasonCodes(input: {
	report: ScoredMockArtifactScoreReport;
	events: readonly MockArtifactScoreEvent[];
	hashCheck: HashCheck;
	scenarioPublic: { scenarioId: string };
}): string[] {
	const reasons: string[] = [];
	if (input.hashCheck.hashMismatchCount > 0) reasons.push("source_hash_mismatch");
	if (input.hashCheck.missingHashCount > 0) reasons.push("source_hash_missing");
	if (input.report.status !== "scored_foundation") reasons.push("source_score_report_unsupported");
	if (input.report.scenarioId !== input.scenarioPublic.scenarioId) reasons.push("scenario_id_mismatch");
	if (input.report.metrics.scoreEventCount !== input.events.length || input.report.metrics.predicateScoreEventCount !== input.events.length) {
		reasons.push("score_event_count_mismatch");
	}
	if (input.events.some((event) => event.runId !== input.report.runId || event.scenarioId !== input.report.scenarioId)) {
		reasons.push("score_event_identity_mismatch");
	}
	if (input.events.some((event) => event.itemType !== "objective" && event.itemType !== "penalty")) reasons.push("score_event_item_type_unsupported");
	if (input.events.some((event) => !event.supported)) reasons.push("score_event_unsupported");
	if (input.report.metrics.unsupportedItemCount > 0) reasons.push("unsupported_score_items");
	if (input.report.metrics.unsupportedPenaltyCount > 0) reasons.push("unsupported_penalties");
	if (input.report.metrics.unsupportedScenarioUtilityCheckCount > 0) reasons.push("unsupported_scenario_utility_checks");
	if (input.report.metrics.unsupportedFinalReportQualityCheckCount > 0) reasons.push("unsupported_final_report_quality_checks");
	return sortedUnique(reasons);
}

async function importRun(runDir: string): Promise<ImportedRun> {
	const [scoreReportText, scoreEventsText, replayManifestText, scenarioPublicText] = await Promise.all([
		readFile(join(runDir, "score-report.json"), "utf8"),
		readFile(join(runDir, "score-events.jsonl"), "utf8"),
		readFile(join(runDir, "replay-manifest.json"), "utf8"),
		readFile(join(runDir, "scenario-public.json"), "utf8")
	]);
	const report = validateScoreReport(parseJson(scoreReportText, `${runDir}/score-report.json`), `${runDir}/score-report.json`);
	const events = parseScoreEvents(scoreEventsText, `${runDir}/score-events.jsonl`);
	const manifest = parseJson(replayManifestText, `${runDir}/replay-manifest.json`);
	const scenarioPublic = validateScenarioPublic(parseJson(scenarioPublicText, `${runDir}/scenario-public.json`), `${runDir}/scenario-public.json`);
	const hashCheck = verifySourceHashes({
		manifest,
		fileTexts: { "score-report.json": scoreReportText, "score-events.jsonl": scoreEventsText, "scenario-public.json": scenarioPublicText }
	});
	const reasonCodes = issueReasonCodes({ report, events, hashCheck, scenarioPublic });
	return {
		runDir,
		runId: report.runId,
		scenarioId: report.scenarioId,
		artifactSchemaVersion: report.artifactSchemaVersion,
		scorerVersions: scorerVersionEntries(report.scorerVersions),
		metrics: report.metrics,
		scoreEvents: events,
		reasonCodes,
		hashVerification: {
			verified: hashCheck.missingHashCount === 0 && hashCheck.hashMismatchCount === 0,
			missingHashCount: hashCheck.missingHashCount,
			hashMismatchCount: hashCheck.hashMismatchCount
		}
	};
}

function mean(values: readonly (number | null)[]): number | null {
	const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
	return finite.length === values.length && finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function unsupportedRuns(runs: readonly ImportedRun[]): MockArtifactAggregateUnsupportedRunSummary[] {
	return runs
		.filter((run) => run.reasonCodes.length > 0)
		.map((run) => ({ runId: run.runId, reasonCodes: [...run.reasonCodes].sort() }))
		.sort((left, right) => left.runId.localeCompare(right.runId));
}

function reasonCounts(unsupported: readonly MockArtifactAggregateUnsupportedRunSummary[]): { reasonCode: string; runCount: number }[] {
	const counts = new Map<string, number>();
	for (const run of unsupported) {
		for (const reasonCode of run.reasonCodes) counts.set(reasonCode, (counts.get(reasonCode) ?? 0) + 1);
	}
	return [...counts.entries()].map(([reasonCode, runCount]) => ({ reasonCode, runCount })).sort((left, right) => left.reasonCode.localeCompare(right.reasonCode));
}

function aggregateScorerVersions(runs: readonly ImportedRun[]): { label: string; value: string }[] {
	const encoded = new Set<string>();
	for (const run of runs) {
		for (const entry of run.scorerVersions) encoded.add(`${entry.label}\u0000${entry.value}`);
	}
	return [...encoded]
		.map((entry) => {
			const [label, value] = entry.split("\u0000");
			return { label: label ?? "unknown", value: value ?? "unknown" };
		})
		.sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

export async function buildMockArtifactAggregateReport(runDirs: readonly string[]): Promise<MockArtifactAggregateReport> {
	if (runDirs.length === 0) throw new Error("at least one explicit run directory is required");
	const runs = await Promise.all(runDirs.map((runDir) => importRun(runDir)));
	const unsupported = unsupportedRuns(runs);
	const allEvents = runs.flatMap((run) => run.scoreEvents);
	const status = unsupported.length === 0 ? "mock_artifact_aggregate_foundation" : "mock_artifact_aggregate_foundation_with_unsupported";
	return {
		artifactAggregateSchemaVersion: MOCK_ARTIFACT_AGGREGATE_SCHEMA_VERSION,
		status,
		runCount: runs.length,
		supportedRunCount: runs.length - unsupported.length,
		unsupportedRunCount: unsupported.length,
		scenarioIds: sortedUnique(runs.map((run) => run.scenarioId)),
		sourceRunIds: sortedUnique(runs.map((run) => run.runId)),
		sourceArtifactSchemaVersions: sortedUnique(runs.map((run) => run.artifactSchemaVersion)),
		sourceScorerVersions: aggregateScorerVersions(runs),
		hashVerificationSummary: {
			sourceRunCount: runs.length,
			verifiedSourceRunCount: runs.filter((run) => run.hashVerification.verified).length,
			unverifiedSourceRunCount: runs.filter((run) => !run.hashVerification.verified).length,
			hashMismatchCount: sum(runs.map((run) => run.hashVerification.hashMismatchCount)),
			missingHashCount: sum(runs.map((run) => run.hashVerification.missingHashCount))
		},
		scoreEventSummary: {
			scoreEventRowCount: allEvents.length,
			objectiveEventCount: allEvents.filter((event) => event.itemType === "objective").length,
			penaltyEventCount: allEvents.filter((event) => event.itemType === "penalty").length,
			unsupportedScoreEventCount: allEvents.filter((event) => !event.supported).length
		},
		metricSummary: {
			meanObjectiveCompletionScore: mean(runs.map((run) => run.metrics.objectiveCompletionScore)),
			meanWeightedAttackSuccessRate: mean(runs.map((run) => run.metrics.weightedAttackSuccessRate)),
			meanAttackResistanceScore: mean(runs.map((run) => run.metrics.attackResistanceScore)),
			totalTriggeredPenaltyCount: sum(runs.map((run) => run.metrics.triggeredPenaltyCount)),
			totalUnsupportedPenaltyCount: sum(runs.map((run) => run.metrics.unsupportedPenaltyCount)),
			totalHardCapCount: sum(runs.map((run) => run.metrics.hardCapCount)),
			meanRawScenarioUtilityScore: mean(runs.map((run) => run.metrics.rawScenarioUtilityScore)),
			meanCappedScenarioUtilityScore: mean(runs.map((run) => run.metrics.cappedScenarioUtilityScore)),
			meanFinalReportQualityScore: mean(runs.map((run) => run.metrics.finalReportQualityScore)),
			totalUnsupportedItemCheckCount: sum(
				runs.map(
					(run) =>
						run.metrics.unsupportedItemCount +
						run.metrics.unsupportedPenaltyCount +
						run.metrics.unsupportedScenarioUtilityCheckCount +
						run.metrics.unsupportedFinalReportQualityCheckCount
				)
			)
		},
		unsupportedSummary: {
			unsupportedRunCount: unsupported.length,
			unsupportedRuns: unsupported,
			reasonCounts: reasonCounts(unsupported)
		},
		caveats: [...CAVEATS]
	};
}

async function outputDirExists(outDir: string): Promise<boolean> {
	try {
		await readdir(outDir);
		return true;
	} catch (error) {
		if ((error as { code?: string }).code === "ENOENT") return false;
		throw error;
	}
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${stableJson(value, 2)}\n`, "utf8");
}

async function fileSha256(path: string): Promise<string> {
	return sha256Hex(await readFile(path, "utf8"));
}

export async function writeMockArtifactAggregateReport(config: MockArtifactAggregateWriteConfig): Promise<MockArtifactAggregateWriteResult> {
	if ((await outputDirExists(config.outDir)) && config.overwrite !== true) {
		throw new Error("aggregate output exists; pass overwrite to replace it");
	}
	if (config.overwrite === true) await rm(config.outDir, { recursive: true, force: true });
	await mkdir(config.outDir, { recursive: true });

	const report = await buildMockArtifactAggregateReport(config.runDirs);
	const reportPath = join(config.outDir, AGGREGATE_REPORT_FILE);
	await writeJson(reportPath, report);
	const reportHash = await fileSha256(reportPath);
	const manifest: MockArtifactAggregateManifest = {
		artifactAggregateSchemaVersion: MOCK_ARTIFACT_AGGREGATE_SCHEMA_VERSION,
		reportId: "phase-6r-orchard-mirror-mock-aggregate",
		status: report.status,
		files: [AGGREGATE_REPORT_FILE, AGGREGATE_MANIFEST_FILE],
		fileHashes: { [AGGREGATE_REPORT_FILE]: reportHash },
		sourceRunCount: report.runCount,
		sourceRunIds: [...report.sourceRunIds],
		caveats: [
			"manifest hashes cover aggregate output files only",
			"source artifact hash verification is summarized by counts in the aggregate report; source manifest hash maps are not copied"
		]
	};
	const manifestPath = join(config.outDir, AGGREGATE_MANIFEST_FILE);
	await writeJson(manifestPath, manifest);
	return {
		outDir: config.outDir,
		files: [AGGREGATE_REPORT_FILE, AGGREGATE_MANIFEST_FILE].sort(),
		runCount: report.runCount,
		supportedRunCount: report.supportedRunCount,
		unsupportedRunCount: report.unsupportedRunCount,
		reportHash,
		manifestHash: await fileSha256(manifestPath)
	};
}
