export {};

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { writeMockRunArtifacts } from "../artifacts/artifactWriter.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { sha256StableJson, stableJson } from "../artifacts/hashChain.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { runMockPiScenario } from "../pi/piAgentRuntime.ts";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { writeMockArtifactAggregateReport } from "../scoring/mockArtifactAggregateReport.ts";
import type { ArtifactTrajectoryEvent, MockArtifactScoreReport, MockRunResult } from "../types";

declare const process: {
	argv: string[];
	exit(code?: number): never;
};

type Manifest = {
	id: string;
	version: string;
	scenarioCount: number;
	scenarios: { scenarioId: string; path: string }[];
};

type ScenarioInput = {
	scenarioId: string;
	private?: { adversarialPayloads?: unknown[] };
	public?: { maxSteps?: number };
};

type ArtifactValidationSummary = {
	runId: string;
	runDir: string;
	requiredFilesPresent: true;
	scenarioPublicSanitized: true;
	hashChainCoherent: true;
	replayManifestPresent: true;
	scoreArtifactsPresent: true;
	eventCount: number;
	toolCallCount: number;
	scoreStatus: string;
	scoreEventCount: number;
	lastEventHashPrefix: string;
};

type MatrixScenarioSummary = {
	scenarioId: string;
	variant: "clean" | "attacked";
	runId: string;
	runStatus: "pass";
	artifactValidationStatus: "pass";
	scoreStatus: string;
	eventCount: number;
	toolCallCount: number;
	scoreEventCount: number;
	caveat: string;
};

type MatrixReport = {
	status: "pass";
	pack: string;
	outputDir: string;
	runCount: number;
	scenarios: MatrixScenarioSummary[];
	aggregate: {
		outDir: string;
		runCount: number;
		supportedRunCount: number;
		unsupportedRunCount: number;
	};
};

const defaultManifestPath = "scenario-packs/examples/v1.0.0/manifest.json";
const defaultOutputDir = "artifacts/runs/example-mock-matrix";
const REQUIRED_ARTIFACT_FILES = [
	"run-config.json",
	"scenario-public.json",
	"scenario-private-checksum.txt",
	"trajectory.jsonl",
	"state-snapshots.jsonl",
	"score-events.jsonl",
	"score-report.json",
	"model-metadata.json",
	"replay-manifest.json",
	"notes.md"
] as const;

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function parseJson(text: string, label: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`${label} is not valid JSON`);
	}
}

function runDirName(scenarioId: string): string {
	return scenarioId.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function eventBodyForHash(event: ArtifactTrajectoryEvent): Record<string, unknown> {
	return {
		eventId: event.eventId,
		runId: event.runId,
		step: event.step,
		tick: event.tick,
		timestamp: event.timestamp,
		kind: event.kind,
		payload: event.payload,
		hashes: {
			...(event.hashes.previousEventHash === undefined ? {} : { previousEventHash: event.hashes.previousEventHash }),
			payloadHash: event.hashes.payloadHash
		}
	};
}

function hashChainOk(events: readonly ArtifactTrajectoryEvent[]): boolean {
	let previous: string | undefined;
	for (const event of events) {
		if (event.hashes.previousEventHash !== previous) return false;
		if (event.hashes.payloadHash !== sha256StableJson(event.payload)) return false;
		if (event.hashes.eventHash !== sha256StableJson(eventBodyForHash(event))) return false;
		previous = event.hashes.eventHash;
	}
	return events.length > 0;
}

async function readJsonFile(path: string): Promise<unknown> {
	return parseJson(await readFile(path, "utf8"), path);
}

async function validateArtifactDir(runDir: string): Promise<ArtifactValidationSummary> {
	for (const file of REQUIRED_ARTIFACT_FILES) {
		if (!existsSync(join(runDir, file))) throw new Error(`${runDir} missing ${file}`);
	}
	const publicScenario = asRecord(await readJsonFile(join(runDir, "scenario-public.json")), `${runDir}/scenario-public.json`);
	if ("private" in publicScenario) throw new Error(`${runDir} scenario-public.json contains private field`);
	const replayManifest = asRecord(await readJsonFile(join(runDir, "replay-manifest.json")), `${runDir}/replay-manifest.json`);
	if (replayManifest.replayGrade !== false) throw new Error(`${runDir} replay-manifest must mark replayGrade=false`);
	const trajectoryText = await readFile(join(runDir, "trajectory.jsonl"), "utf8");
	const events = trajectoryText
		.trim()
		.split(/\n+/)
		.filter(Boolean)
		.map((line, index) => parseJson(line, `${runDir}/trajectory.jsonl:${index + 1}`) as ArtifactTrajectoryEvent);
	if (!hashChainOk(events)) throw new Error(`${runDir} hash chain validation failed`);
	const scoreReport = asRecord(await readJsonFile(join(runDir, "score-report.json")), `${runDir}/score-report.json`) as MockArtifactScoreReport;
	if (scoreReport.status !== "scored_foundation" && scoreReport.status !== "scored_foundation_with_unsupported") {
		throw new Error(`${runDir} score report was not a scored mock foundation report`);
	}
	const scoreEventsText = await readFile(join(runDir, "score-events.jsonl"), "utf8");
	const scoreEventCount = scoreEventsText.trim().length === 0 ? 0 : scoreEventsText.trim().split(/\n+/).length;
	const runConfig = asRecord(await readJsonFile(join(runDir, "run-config.json")), `${runDir}/run-config.json`);
	const runId = typeof runConfig.runId === "string" ? runConfig.runId : "unknown-run";
	const lastHash = events.at(-1)?.hashes.eventHash;
	return {
		runId,
		runDir,
		requiredFilesPresent: true,
		scenarioPublicSanitized: true,
		hashChainCoherent: true,
		replayManifestPresent: true,
		scoreArtifactsPresent: true,
		eventCount: events.length,
		toolCallCount: events.filter((event) => event.kind === "tool_call").length,
		scoreStatus: scoreReport.status,
		scoreEventCount,
		lastEventHashPrefix: lastHash?.slice(0, 16) ?? "none"
	};
}

async function loadManifest(manifestPath: string): Promise<Manifest> {
	const manifest = parseJson(await readFile(manifestPath, "utf8"), manifestPath) as Manifest;
	if (!Array.isArray(manifest.scenarios)) throw new Error(`${manifestPath} missing scenarios array`);
	if (manifest.id !== "examples" && manifest.id !== "public-dev") throw new Error(`expected examples or public-dev manifest, got ${manifest.id}`);
	if (manifest.scenarioCount !== manifest.scenarios.length) {
		throw new Error(`manifest count mismatch scenarioCount=${manifest.scenarioCount} listed=${manifest.scenarios.length}`);
	}
	return manifest;
}

async function loadScenario(path: string): Promise<ScenarioInput> {
	const scenario = parseJson(await readFile(path, "utf8"), path) as ScenarioInput;
	if (typeof scenario.scenarioId !== "string") throw new Error(`${path} missing scenarioId`);
	return scenario;
}

function assertRunResult(result: MockRunResult, scenario: ScenarioInput): void {
	if (result.scenarioId !== scenario.scenarioId) throw new Error(`${scenario.scenarioId} result scenario mismatch`);
	if (!result.ended) throw new Error(`${scenario.scenarioId} mock run did not end`);
	if (result.toolCallCount <= 0 || result.toolResultCount <= 0) throw new Error(`${scenario.scenarioId} missing tool activity`);
	if (result.toolCallCount !== result.toolResultCount) throw new Error(`${scenario.scenarioId} tool call/result count mismatch`);
	if (result.eventCount <= 0) throw new Error(`${scenario.scenarioId} missing trajectory events`);
	if (result.scoring === undefined) throw new Error(`${scenario.scenarioId} missing scoring summary`);
}

async function writeMatrixSummary(outDir: string, report: MatrixReport): Promise<void> {
	await writeFile(join(outDir, "matrix-summary.json"), `${stableJson(report, 2)}\n`, "utf8");
	await writeFile(
		join(outDir, "README.md"),
		[
			"# Local example mock matrix artifacts",
			"",
			"Sanitized local no-live mock artifacts produced through the Pi Agent faux provider path.",
			"These artifacts are local development outputs, not live provider results, not official scoring, not leaderboard readiness, and not full V1 completion.",
			"Secret values and env values were not read or stored."
		].join("\n") + "\n",
		"utf8"
	);
}

export async function runPublicDevMockMatrix(input: { manifestPath?: string; outDir?: string; scenarioLimit?: number } = {}): Promise<MatrixReport> {
	const manifestPath = input.manifestPath ?? defaultManifestPath;
	const outDir = input.outDir ?? defaultOutputDir;
	const manifest = await loadManifest(manifestPath);
	const scenarioEntries = input.scenarioLimit === undefined ? manifest.scenarios : manifest.scenarios.slice(0, Math.max(1, input.scenarioLimit));
	const baseDir = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/")) : ".";
	await rm(outDir, { recursive: true, force: true });
	await mkdir(outDir, { recursive: true });
	const runDirs: string[] = [];
	const summaries: MatrixScenarioSummary[] = [];
	for (const entry of scenarioEntries) {
		const scenarioPath = `${baseDir}/${entry.path}`;
		const scenario = await loadScenario(scenarioPath);
		if (scenario.scenarioId !== entry.scenarioId) throw new Error(`manifest scenario mismatch for ${entry.scenarioId}`);
		const runId = `${scenario.scenarioId}.${manifest.id}-generic.mock`;
		const result = await runMockPiScenario({
			scenarioPath,
			scenarioInput: scenario,
			scriptId: "public-dev-generic",
			runId,
			maxSteps: scenario.public?.maxSteps ?? 12
		});
		assertRunResult(result, scenario);
		const runDir = join(outDir, "runs", runDirName(scenario.scenarioId));
		await writeMockRunArtifacts({ runId, outDir: runDir, scenarioPath, scenarioInput: scenario, result, overwrite: true });
		const artifact = await validateArtifactDir(runDir);
		runDirs.push(runDir);
		summaries.push({
			scenarioId: scenario.scenarioId,
			variant: (scenario.private?.adversarialPayloads?.length ?? 0) === 0 ? "clean" : "attacked",
			runId,
			runStatus: "pass",
			artifactValidationStatus: "pass",
			scoreStatus: artifact.scoreStatus,
			eventCount: artifact.eventCount,
			toolCallCount: artifact.toolCallCount,
			scoreEventCount: artifact.scoreEventCount,
			caveat: artifact.scoreStatus === "scored_foundation" ? "mock-only foundation score" : "mock-only foundation score with unsupported components"
		});
	}
	const aggregate = await writeMockArtifactAggregateReport({ outDir: join(outDir, "aggregate"), runDirs, overwrite: true });
	const report: MatrixReport = {
		status: "pass",
		pack: `${manifest.id}@${manifest.version}`,
		outputDir: outDir,
		runCount: summaries.length,
		scenarios: summaries,
		aggregate: {
			outDir: aggregate.outDir,
			runCount: aggregate.runCount,
			supportedRunCount: aggregate.supportedRunCount,
			unsupportedRunCount: aggregate.unsupportedRunCount
		}
	};
	await writeMatrixSummary(outDir, report);
	return report;
}

async function main(argv: string[]): Promise<void> {
	const limitArg = argv[2] === undefined ? undefined : Number(argv[2]);
	const report = await runPublicDevMockMatrix({
		manifestPath: argv[0] ?? defaultManifestPath,
		outDir: argv[1] ?? defaultOutputDir,
		...(limitArg === undefined ? {} : { scenarioLimit: limitArg })
	});
	console.log(`mock runner matrix: ok (${report.runCount}/${report.runCount} scenarios) pack=${report.pack}`);
	for (const scenario of report.scenarios) {
		console.log(
			`scenario ${scenario.scenarioId}: variant=${scenario.variant} run=${scenario.runStatus} artifacts=${scenario.artifactValidationStatus} score=${scenario.scoreStatus} events=${scenario.eventCount} toolCalls=${scenario.toolCallCount}`
		);
	}
	console.log(
		`mock runner matrix: aggregate ok runs=${report.aggregate.runCount} supported=${report.aggregate.supportedRunCount} unsupported=${report.aggregate.unsupportedRunCount}`
	);
}

if (process.argv[1]?.endsWith("publicDevMockMatrix.ts")) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(`mock runner matrix: failed ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
