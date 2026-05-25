export {};

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error Runtime fixture uses Node strip-types with explicit TypeScript extensions.
import { sha256Hex, stableJson } from "../artifacts/hashChain.ts";

declare const process: {
	argv: string[];
	exit(code?: number): never;
};

type MatrixSummary = {
	status: string;
	pack: string;
	outputDir: string;
	runCount: number;
	scenarios: MatrixScenario[];
	aggregate: { outDir: string; runCount: number; supportedRunCount: number; unsupportedRunCount: number };
};

type MatrixScenario = {
	scenarioId: string;
	variant: "clean" | "attacked";
	runId: string;
	runStatus: string;
	artifactValidationStatus: string;
	scoreStatus: string;
	eventCount: number;
	toolCallCount: number;
	scoreEventCount: number;
	caveat: string;
};

type AggregateReport = {
	artifactAggregateSchemaVersion: string;
	status: string;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	scenarioIds: string[];
	sourceRunIds: string[];
	hashVerificationSummary: {
		sourceRunCount: number;
		verifiedSourceRunCount: number;
		unverifiedSourceRunCount: number;
		hashMismatchCount: number;
		missingHashCount: number;
	};
	scoreEventSummary: {
		scoreEventRowCount: number;
		objectiveEventCount: number;
		penaltyEventCount: number;
		unsupportedScoreEventCount: number;
	};
	metricSummary: Record<string, number | null>;
	unsupportedSummary: {
		unsupportedRunCount: number;
		reasonCounts: { reasonCode: string; runCount: number }[];
	};
};

type AggregateManifest = {
	status: string;
	sourceRunCount: number;
	sourceRunIds: string[];
	fileHashes: Record<string, string>;
};

type ReplayManifest = {
	runId: string;
	scenarioId: string;
	replayGrade: boolean;
	fileHashes: Record<string, string>;
	trajectory?: {
		eventCount?: number;
		firstEventHash?: string;
		lastEventHash?: string;
		hashAlgorithm?: string;
	};
	replayLimitations?: string[];
};

type ScoreReport = {
	runId: string;
	scenarioId: string;
	status: string;
	metrics?: Record<string, number | string | null>;
};

type SourceRun = {
	scenario: MatrixScenario;
	replay: ReplayManifest;
	score: ScoreReport;
	scoreEventRows: number;
};

type FixtureReport = {
	fixtureSchemaVersion: string;
	fixtureKind: "public-dev-report-fixture";
	status: "local_mock_fixture_with_unsupported" | "local_mock_fixture";
	pack: { id: string; version: string };
	nonOfficial: true;
	mockOnly: true;
	publicationReady: false;
	rankingEligible: false;
	source: {
		matrixPath: string;
		aggregateReportPath: string;
		aggregateManifestPath: string;
		sourceRunCount: number;
		supportedRunCount: number;
		unsupportedRunCount: number;
	};
	summary: {
		scenarioCount: number;
		runCount: number;
		verifiedHashSourceRunCount: number;
		hashMismatchCount: number;
		missingHashCount: number;
		scoreEventRowCount: number;
		objectiveEventCount: number;
		penaltyEventCount: number;
		unsupportedScoreEventCount: number;
		meanObjectiveCompletionScore: number | null;
		meanCappedScenarioUtilityScore: number | null;
		meanFinalReportQualityScore: number | null;
	};
	scenarios: {
		scenarioId: string;
		runId: string;
		variant: "clean" | "attacked";
		runStatus: string;
		scoreStatus: string;
		replayGrade: false;
		eventCount: number;
		toolCallCount: number;
		scoreEventCount: number;
		localFixtureMetric: number | null;
		unsupportedReasonCodes: string[];
	}[];
	caveats: string[];
};

type LeaderboardFixture = {
	fixtureSchemaVersion: string;
	fixtureKind: "leaderboard-fixture";
	nonOfficial: true;
	mockOnly: true;
	publicationReady: false;
	rankingEligible: false;
	entries: {
		entryId: string;
		scenarioId: string;
		runId: string;
		modelLabel: "COG-CONTAIN faux mock";
		providerMode: "mock-faux";
		localFixtureMetric: number | null;
		scoreStatus: string;
		replayGrade: false;
		rankingEligible: false;
		publicationReady: false;
		caveats: string[];
	}[];
	caveats: string[];
};

type RedactedReplayIndex = {
	fixtureSchemaVersion: string;
	fixtureKind: "redacted-replay-index";
	nonOfficial: true;
	mockOnly: true;
	publicationReady: false;
	records: {
		runId: string;
		scenarioId: string;
		replayGrade: false;
		eventCount: number;
		toolCallCount: number;
		scoreEventCount: number;
		trajectoryHashPrefix: string | null;
		firstEventHashPrefix: string | null;
		scoreReportHashPrefix: string | null;
		scoreEventsHashPrefix: string | null;
		omittedFields: string[];
		caveats: string[];
	}[];
	caveats: string[];
};

type SourceIntegrity = {
	fixtureSchemaVersion: string;
	fixtureKind: "source-integrity";
	nonOfficial: true;
	mockOnly: true;
	inputs: { path: string; sha256: string }[];
	aggregateManifestStatus: string;
	aggregateReportStatus: string;
	sourceRunCount: number;
	verifiedSourceRunCount: number;
	hashMismatchCount: number;
	missingHashCount: number;
	runFileHashPrefixes: {
		runId: string;
		scenarioId: string;
		replayManifestHashPrefix: string;
		scoreReportHashPrefix: string;
		scoreEventsHashPrefix: string;
	}[];
	caveats: string[];
};

const FIXTURE_SCHEMA_VERSION = "phase-15.public-dev-report-fixture.v1";
const DEFAULT_SOURCE_DIR = "artifacts/runs/phase-13-public-dev-mock-matrix";
const DEFAULT_OUTPUT_DIR = "artifacts/runs/phase-15-public-dev-report-fixture";
const EXPECTED_FILES = [
	"fixture-manifest.json",
	"public-report-fixture.json",
	"leaderboard-fixture.json",
	"redacted-replay-index.json",
	"source-integrity.json",
	"README.md"
] as const;
const REQUIRED_CAVEATS = [
	"local non-live public-dev mock fixture only",
	"not official scoring",
	"not model ranking",
	"not leaderboard readiness",
	"not publication ready",
	"not replay-grade",
	"not full V1 completion"
] as const;
const FORBIDDEN_KEY_NAMES = new Set([
	"private",
	"hidden",
	"hiddenGroundTruth",
	"adversarialPayloads",
	"rawTrajectory",
	"rawModelOutput",
	"rawToolArgs",
	"rawObservations",
	"providerPayload",
	"headers",
	"authorization",
	"apiKey",
	"credential",
	"secret"
]);

function parseArgs(argv: string[]): { sourceDir: string; outDir: string } {
	return {
		sourceDir: readFlag(argv, "--source") ?? DEFAULT_SOURCE_DIR,
		outDir: readFlag(argv, "--out") ?? DEFAULT_OUTPUT_DIR
	};
}

function readFlag(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
}

async function readText(path: string): Promise<string> {
	return readFile(path, "utf8");
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readText(path)) as T;
}

async function fileSha256(path: string): Promise<string> {
	return sha256Hex(await readText(path));
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${stableJson(value, 2)}\n`, "utf8");
}

function packParts(pack: string): { id: string; version: string } {
	const [id, version] = pack.split("@");
	return { id: id ?? "unknown", version: version ?? "unknown" };
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hashPrefix(value: string | undefined): string | null {
	return typeof value === "string" && value.length > 0 ? value.slice(0, 16) : null;
}

function unsupportedReasonCodes(aggregate: AggregateReport, runId: string): string[] {
	const runs = (aggregate as AggregateReport & { unsupportedSummary: { unsupportedRuns?: { runId: string; reasonCodes: string[] }[] } }).unsupportedSummary
		.unsupportedRuns;
	return runs?.find((run) => run.runId === runId)?.reasonCodes.slice().sort() ?? [];
}

async function loadSourceRuns(sourceDir: string, matrix: MatrixSummary): Promise<SourceRun[]> {
	return Promise.all(
		matrix.scenarios.map(async (scenario) => {
			const runDir = join(sourceDir, "runs", scenario.scenarioId);
			const replay = await readJson<ReplayManifest>(join(runDir, "replay-manifest.json"));
			const score = await readJson<ScoreReport>(join(runDir, "score-report.json"));
			const scoreEventsText = await readText(join(runDir, "score-events.jsonl"));
			const scoreEventRows = scoreEventsText.trim().length === 0 ? 0 : scoreEventsText.trim().split(/\n+/).length;
			return { scenario, replay, score, scoreEventRows };
		})
	);
}

function buildPublicReport(input: { matrix: MatrixSummary; aggregate: AggregateReport; runs: SourceRun[]; sourceDir: string }): FixtureReport {
	const pack = packParts(input.matrix.pack);
	return {
		fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
		fixtureKind: "public-dev-report-fixture",
		status: input.aggregate.unsupportedRunCount > 0 ? "local_mock_fixture_with_unsupported" : "local_mock_fixture",
		pack,
		nonOfficial: true,
		mockOnly: true,
		publicationReady: false,
		rankingEligible: false,
		source: {
			matrixPath: join(input.sourceDir, "matrix-summary.json"),
			aggregateReportPath: join(input.sourceDir, "aggregate", "aggregate-score-report.json"),
			aggregateManifestPath: join(input.sourceDir, "aggregate", "aggregate-manifest.json"),
			sourceRunCount: input.aggregate.runCount,
			supportedRunCount: input.aggregate.supportedRunCount,
			unsupportedRunCount: input.aggregate.unsupportedRunCount
		},
		summary: {
			scenarioCount: input.aggregate.scenarioIds.length,
			runCount: input.aggregate.runCount,
			verifiedHashSourceRunCount: input.aggregate.hashVerificationSummary.verifiedSourceRunCount,
			hashMismatchCount: input.aggregate.hashVerificationSummary.hashMismatchCount,
			missingHashCount: input.aggregate.hashVerificationSummary.missingHashCount,
			scoreEventRowCount: input.aggregate.scoreEventSummary.scoreEventRowCount,
			objectiveEventCount: input.aggregate.scoreEventSummary.objectiveEventCount,
			penaltyEventCount: input.aggregate.scoreEventSummary.penaltyEventCount,
			unsupportedScoreEventCount: input.aggregate.scoreEventSummary.unsupportedScoreEventCount,
			meanObjectiveCompletionScore: asNumber(input.aggregate.metricSummary.meanObjectiveCompletionScore),
			meanCappedScenarioUtilityScore: asNumber(input.aggregate.metricSummary.meanCappedScenarioUtilityScore),
			meanFinalReportQualityScore: asNumber(input.aggregate.metricSummary.meanFinalReportQualityScore)
		},
		scenarios: input.runs.map((run) => ({
			scenarioId: run.scenario.scenarioId,
			runId: run.scenario.runId,
			variant: run.scenario.variant,
			runStatus: run.scenario.runStatus,
			scoreStatus: run.score.status,
			replayGrade: false,
			eventCount: run.scenario.eventCount,
			toolCallCount: run.scenario.toolCallCount,
			scoreEventCount: run.scoreEventRows,
			localFixtureMetric: asNumber(run.score.metrics?.objectiveCompletionScore),
			unsupportedReasonCodes: unsupportedReasonCodes(input.aggregate, run.scenario.runId)
		})),
		caveats: [...REQUIRED_CAVEATS, "derived only from sanitized T373 mock matrix artifacts"]
	};
}

function buildLeaderboard(report: FixtureReport): LeaderboardFixture {
	return {
		fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
		fixtureKind: "leaderboard-fixture",
		nonOfficial: true,
		mockOnly: true,
		publicationReady: false,
		rankingEligible: false,
		entries: report.scenarios.map((scenario) => ({
			entryId: `${scenario.scenarioId}.fixture-entry`,
			scenarioId: scenario.scenarioId,
			runId: scenario.runId,
			modelLabel: "COG-CONTAIN faux mock",
			providerMode: "mock-faux",
			localFixtureMetric: scenario.localFixtureMetric,
			scoreStatus: scenario.scoreStatus,
			replayGrade: false,
			rankingEligible: false,
			publicationReady: false,
			caveats: [
				"local fixture metric only",
				"not an official headline score",
				"not model ranking",
				"not leaderboard readiness",
				"not publication ready"
			]
		})),
		caveats: [...REQUIRED_CAVEATS, "entries are intentionally ranking-ineligible"]
	};
}

function buildReplayIndex(runs: SourceRun[]): RedactedReplayIndex {
	return {
		fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
		fixtureKind: "redacted-replay-index",
		nonOfficial: true,
		mockOnly: true,
		publicationReady: false,
		records: runs.map((run) => ({
			runId: run.scenario.runId,
			scenarioId: run.scenario.scenarioId,
			replayGrade: false,
			eventCount: run.scenario.eventCount,
			toolCallCount: run.scenario.toolCallCount,
			scoreEventCount: run.scoreEventRows,
			trajectoryHashPrefix: hashPrefix(run.replay.trajectory?.lastEventHash),
			firstEventHashPrefix: hashPrefix(run.replay.trajectory?.firstEventHash),
			scoreReportHashPrefix: hashPrefix(run.replay.fileHashes["score-report.json"]),
			scoreEventsHashPrefix: hashPrefix(run.replay.fileHashes["score-events.jsonl"]),
			omittedFields: [
				"trajectory event bodies",
				"model text",
				"tool arguments",
				"tool observations",
				"scenario document text",
				"adversarial payload text",
				"private scenario fields"
			],
			caveats: ["redacted index only", "not replay-grade", "not publication ready"]
		})),
		caveats: [...REQUIRED_CAVEATS, "no trajectory event bodies are included"]
	};
}

async function buildSourceIntegrity(input: {
	sourceDir: string;
	matrix: MatrixSummary;
	aggregate: AggregateReport;
	aggregateManifest: AggregateManifest;
	runs: SourceRun[];
}): Promise<SourceIntegrity> {
	const inputPaths = [
		join(input.sourceDir, "matrix-summary.json"),
		join(input.sourceDir, "aggregate", "aggregate-score-report.json"),
		join(input.sourceDir, "aggregate", "aggregate-manifest.json")
	];
	return {
		fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
		fixtureKind: "source-integrity",
		nonOfficial: true,
		mockOnly: true,
		inputs: await Promise.all(inputPaths.map(async (path) => ({ path, sha256: await fileSha256(path) }))),
		aggregateManifestStatus: input.aggregateManifest.status,
		aggregateReportStatus: input.aggregate.status,
		sourceRunCount: input.aggregate.runCount,
		verifiedSourceRunCount: input.aggregate.hashVerificationSummary.verifiedSourceRunCount,
		hashMismatchCount: input.aggregate.hashVerificationSummary.hashMismatchCount,
		missingHashCount: input.aggregate.hashVerificationSummary.missingHashCount,
		runFileHashPrefixes: await Promise.all(
			input.runs.map(async (run) => ({
				runId: run.scenario.runId,
				scenarioId: run.scenario.scenarioId,
				replayManifestHashPrefix: hashPrefix(await fileSha256(join(input.sourceDir, "runs", run.scenario.scenarioId, "replay-manifest.json"))) ?? "none",
				scoreReportHashPrefix: hashPrefix(run.replay.fileHashes["score-report.json"]) ?? "none",
				scoreEventsHashPrefix: hashPrefix(run.replay.fileHashes["score-events.jsonl"]) ?? "none"
			}))
		),
		caveats: [...REQUIRED_CAVEATS, "source integrity is limited to sanitized local mock artifacts"]
	};
}

function walk(value: unknown, visit: (key: string, value: unknown) => void): void {
	if (Array.isArray(value)) {
		for (const item of value) walk(item, visit);
		return;
	}
	if (typeof value !== "object" || value === null) return;
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		visit(key, child);
		walk(child, visit);
	}
}

function assertSafeFixtureObject(value: unknown, label: string): void {
	walk(value, (key, child) => {
		if (FORBIDDEN_KEY_NAMES.has(key)) throw new Error(`${label} contains forbidden key ${key}`);
		if ((key === "official" || key === "publicationReady" || key === "rankingEligible" || key === "replayGrade") && child === true) {
			throw new Error(`${label} contains unsafe true readiness key ${key}`);
		}
	});
	const text = stableJson(value).toLowerCase();
	for (const phrase of ["leaderboard-ready:true", "publicationready:true", "publicreleaseready:true", "full v1 complete", "official results published"]) {
		if (text.includes(phrase)) throw new Error(`${label} contains forbidden readiness phrase ${phrase}`);
	}
}

async function validateFixture(outDir: string, matrix: MatrixSummary, report: FixtureReport): Promise<void> {
	for (const file of EXPECTED_FILES) {
		if (!existsSync(join(outDir, file))) throw new Error(`fixture missing ${file}`);
	}
	if (report.summary.runCount !== matrix.runCount) throw new Error("fixture run count mismatch");
	if (report.summary.scenarioCount !== matrix.scenarios.length) throw new Error("fixture scenario count mismatch");
	const objects = await Promise.all(EXPECTED_FILES.filter((file) => file.endsWith(".json")).map(async (file) => [file, await readJson<unknown>(join(outDir, file))] as const));
	for (const [file, object] of objects) assertSafeFixtureObject(object, file);
	const leaderboard = objects.find(([file]) => file === "leaderboard-fixture.json")?.[1] as LeaderboardFixture;
	if (!leaderboard.entries.every((entry) => entry.rankingEligible === false && entry.publicationReady === false)) {
		throw new Error("leaderboard entries missing non-official/ranking-ineligible caveats");
	}
	const replay = objects.find(([file]) => file === "redacted-replay-index.json")?.[1] as RedactedReplayIndex;
	if (!replay.records.every((record) => record.replayGrade === false)) throw new Error("replay index contains replayGrade=true");
}

async function writeReadme(outDir: string): Promise<void> {
	await writeFile(
		join(outDir, "README.md"),
		[
			"# Phase 15 public-dev report fixture",
			"",
			"Local non-live fixture projection derived only from sanitized T373 mock matrix artifacts.",
			"This is mock-only, non-official, ranking-ineligible, not publication ready, not replay-grade, and not full V1 completion.",
			"The fixture omits raw trajectories, raw model output, raw tool arguments, raw tool observations, raw public document text, raw adversarial payload text, private scenario bodies, provider payloads, headers, env values, keys, hosted endpoints, account/project identifiers, private refs, storage refs, and hidden data."
		].join("\n") + "\n",
		"utf8"
	);
}

export async function generatePublicDevReportFixture(input: { sourceDir?: string; outDir?: string } = {}) {
	const sourceDir = input.sourceDir ?? DEFAULT_SOURCE_DIR;
	const outDir = input.outDir ?? DEFAULT_OUTPUT_DIR;
	const [matrix, aggregate, aggregateManifest] = await Promise.all([
		readJson<MatrixSummary>(join(sourceDir, "matrix-summary.json")),
		readJson<AggregateReport>(join(sourceDir, "aggregate", "aggregate-score-report.json")),
		readJson<AggregateManifest>(join(sourceDir, "aggregate", "aggregate-manifest.json"))
	]);
	if (matrix.runCount !== aggregate.runCount || matrix.scenarios.length !== aggregate.runCount) throw new Error("source run count mismatch");
	const runs = await loadSourceRuns(sourceDir, matrix);
	await rm(outDir, { recursive: true, force: true });
	await mkdir(outDir, { recursive: true });
	const report = buildPublicReport({ matrix, aggregate, runs, sourceDir });
	const leaderboard = buildLeaderboard(report);
	const replayIndex = buildReplayIndex(runs);
	const sourceIntegrity = await buildSourceIntegrity({ sourceDir, matrix, aggregate, aggregateManifest, runs });
	const manifest = {
		fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
		fixtureKind: "fixture-manifest",
		status: "pass",
		nonOfficial: true,
		mockOnly: true,
		publicationReady: false,
		rankingEligible: false,
		files: [...EXPECTED_FILES].sort(),
		sourceRunCount: matrix.runCount,
		scenarioCount: matrix.scenarios.length,
		caveats: [...REQUIRED_CAVEATS]
	};
	await writeJson(join(outDir, "fixture-manifest.json"), manifest);
	await writeJson(join(outDir, "public-report-fixture.json"), report);
	await writeJson(join(outDir, "leaderboard-fixture.json"), leaderboard);
	await writeJson(join(outDir, "redacted-replay-index.json"), replayIndex);
	await writeJson(join(outDir, "source-integrity.json"), sourceIntegrity);
	await writeReadme(outDir);
	await validateFixture(outDir, matrix, report);
	return {
		outDir,
		files: [...EXPECTED_FILES].sort(),
		sourceRunCount: matrix.runCount,
		scenarioCount: matrix.scenarios.length,
		leaderboardEntryCount: leaderboard.entries.length,
		replayRecordCount: replayIndex.records.length,
		unsupportedRunCount: aggregate.unsupportedRunCount
	};
}

async function main(argv: string[]): Promise<void> {
	const options = parseArgs(argv);
	const result = await generatePublicDevReportFixture(options);
	console.log(`public-dev report fixture: ok scenarios=${result.scenarioCount} runs=${result.sourceRunCount} out=${result.outDir}`);
	console.log(
		`public-dev report fixture: files=${result.files.length} leaderboardEntries=${result.leaderboardEntryCount} replayRecords=${result.replayRecordCount} unsupportedRuns=${result.unsupportedRunCount}`
	);
	console.log("public-dev report fixture: local mock-only non-official validation ok");
}

if (process.argv[1]?.endsWith("publicDevReportFixture.ts")) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(`public-dev report fixture: failed ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
