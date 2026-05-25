import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { sha256StableJson } from "../artifacts/hashChain.ts";
import type { ArtifactTrajectoryEvent } from "../types";

export type PublicDevDraftMatrixValidationConfig = {
	outDir: string;
	packVersion: string;
	expectedScenarioIds: readonly string[];
	label: string;
};

export type PublicDevDraftMatrixRunValidation = {
	scenarioId: string;
	eventCount: number;
	toolCallCount: number;
	scoreStatus: string;
	lastHashPrefix: string;
};

export type PublicDevDraftMatrixValidationResult = {
	runCount: number;
	runs: PublicDevDraftMatrixRunValidation[];
	summary: string;
};

const REQUIRED_RUN_FILES = [
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

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	assert(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be object`);
	return value as Record<string, unknown>;
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8")) as unknown;
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

async function validateRun(config: PublicDevDraftMatrixValidationConfig, scenarioId: string): Promise<PublicDevDraftMatrixRunValidation> {
	const runDir = join(config.outDir, "runs", runDirName(scenarioId));
	for (const file of REQUIRED_RUN_FILES) assert(existsSync(join(runDir, file)), `${scenarioId} missing ${file}`);
	const publicScenario = asRecord(await readJson(join(runDir, "scenario-public.json")), `${scenarioId} scenario-public`);
	assert(!("private" in publicScenario), `${scenarioId} scenario-public contains private`);
	assert(publicScenario.scenarioId === scenarioId, `${scenarioId} scenario-public id mismatch`);
	assert(publicScenario.packVersion === config.packVersion, `${scenarioId} pack version mismatch`);
	const replayManifest = asRecord(await readJson(join(runDir, "replay-manifest.json")), `${scenarioId} replay-manifest`);
	assert(replayManifest.replayGrade === false, `${scenarioId} replayGrade must be false`);
	const scoreReport = asRecord(await readJson(join(runDir, "score-report.json")), `${scenarioId} score-report`);
	assert(scoreReport.status === "scored_foundation" || scoreReport.status === "scored_foundation_with_unsupported", `${scenarioId} score status invalid`);
	const trajectoryText = await readFile(join(runDir, "trajectory.jsonl"), "utf8");
	const events = trajectoryText.trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line) as ArtifactTrajectoryEvent);
	assert(hashChainOk(events), `${scenarioId} hash chain invalid`);
	return {
		scenarioId,
		eventCount: events.length,
		toolCallCount: events.filter((event) => event.kind === "tool_call").length,
		scoreStatus: String(scoreReport.status),
		lastHashPrefix: events.at(-1)?.hashes.eventHash.slice(0, 16) ?? "none"
	};
}

export async function validatePublicDevDraftMockMatrix(config: PublicDevDraftMatrixValidationConfig): Promise<PublicDevDraftMatrixValidationResult> {
	assert(existsSync(config.outDir), "output directory missing");
	assert(existsSync(join(config.outDir, "matrix-summary.json")), "matrix summary missing");
	assert(existsSync(join(config.outDir, "aggregate", "aggregate-score-report.json")), "aggregate score report missing");
	assert(existsSync(join(config.outDir, "aggregate", "aggregate-manifest.json")), "aggregate manifest missing");
	const matrix = asRecord(await readJson(join(config.outDir, "matrix-summary.json")), "matrix-summary");
	assert(matrix.status === "pass", "matrix status not pass");
	assert(matrix.pack === `public-dev@${config.packVersion}`, "matrix pack mismatch");
	assert(matrix.runCount === config.expectedScenarioIds.length, "matrix run count mismatch");
	const aggregate = asRecord(matrix.aggregate, "matrix.aggregate");
	assert(aggregate.runCount === config.expectedScenarioIds.length, "aggregate run count mismatch");
	const runs = await Promise.all(config.expectedScenarioIds.map((scenarioId) => validateRun(config, scenarioId)));
	const summary = runs.map((run) => `${run.scenarioId}:${run.scoreStatus}:events=${run.eventCount}:tools=${run.toolCallCount}:hash=${run.lastHashPrefix}`).join(", ");
	return { runCount: runs.length, runs, summary };
}
