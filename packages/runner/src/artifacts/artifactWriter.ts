import { readFile, rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { MockArtifactScoreReport, MockArtifactWriteConfig, MockArtifactWriteResult, MockRunResult } from "../types";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { MOCK_ARTIFACT_SCORE_SCHEMA_VERSION } from "../scoring/mockArtifactScoreReport.ts";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { createHashLinkedTrajectoryEvents, sha256Hex, sha256StableJson, stableJson } from "./hashChain.ts";

const ARTIFACT_SCHEMA_VERSION = "phase-5d.mock-artifacts.v1";

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function scenarioId(scenarioInput: unknown): string {
	const value = asRecord(scenarioInput).scenarioId;
	return typeof value === "string" ? value : "unknown-scenario";
}

function stringIds(values: unknown, key: string): string[] {
	return Array.isArray(values)
		? values
				.map((value) => asRecord(value)[key])
				.filter((value): value is string => typeof value === "string")
				.sort()
		: [];
}

function scenarioPublic(scenarioInput: unknown): Record<string, unknown> {
	const scenario = asRecord(scenarioInput);
	const publicFields = asRecord(scenario.public);
	const briefing = asRecord(publicFields.briefing);
	const sourceGuide = asRecord(publicFields.sourceGuide);
	const initialDocuments = Array.isArray(publicFields.initialDocuments) ? publicFields.initialDocuments : [];
	const initialObservations = Array.isArray(publicFields.initialObservations) ? publicFields.initialObservations : [];
	const successCriteriaVisible = Array.isArray(briefing.successCriteriaVisible) ? briefing.successCriteriaVisible : [];
	const contentWarnings = Array.isArray(briefing.contentWarnings) ? briefing.contentWarnings : [];
	const trustedSourceKinds = Array.isArray(sourceGuide.trustedSourceKinds) ? sourceGuide.trustedSourceKinds : [];
	const untrustedSourceKinds = Array.isArray(sourceGuide.untrustedSourceKinds) ? sourceGuide.untrustedSourceKinds : [];
	const finalReportRequiredFields = Array.isArray(publicFields.finalReportRequiredFields) ? publicFields.finalReportRequiredFields : [];
	return {
		artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
		scenarioSummaryKind: "sanitized_public_metadata",
		schemaVersion: scenario.schemaVersion,
		scenarioId: scenario.scenarioId,
		packId: scenario.packId,
		packVersion: scenario.packVersion,
		visibility: scenario.visibility,
		tagCount: Array.isArray(scenario.tags) ? scenario.tags.length : 0,
		publicSummary: {
			initialDocumentCount: initialDocuments.length,
			initialDocumentIds: stringIds(initialDocuments, "docId"),
			initialObservationCount: initialObservations.length,
			initialObservationIds: stringIds(initialObservations, "observationId"),
			availableTools: Array.isArray(publicFields.availableTools) ? [...publicFields.availableTools].filter((value): value is string => typeof value === "string").sort() : [],
			maxSteps: publicFields.maxSteps,
			maxTokens: publicFields.maxTokens,
			briefingFieldCount: Object.keys(briefing).length,
			successCriteriaVisibleCount: successCriteriaVisible.length,
			contentWarningCount: contentWarnings.length,
			trustedSourceKindCount: trustedSourceKinds.length,
			untrustedSourceKindCount: untrustedSourceKinds.length,
			finalReportRequiredFieldCount: finalReportRequiredFields.length
		}
	};
}

function privateChecksum(scenarioInput: unknown): string {
	const privatePart = asRecord(scenarioInput).private;
	return `sha256:${sha256StableJson(privatePart ?? null)}`;
}

function jsonLine(value: unknown): string {
	return `${stableJson(value)}\n`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
	await writeFile(filePath, `${stableJson(value, 2)}\n`, "utf8");
}

async function fileSha256(filePath: string): Promise<string> {
	return sha256Hex(await readFile(filePath, "utf8"));
}

function stateSnapshotRows(runId: string, result: MockRunResult) {
	const base = {
		runId,
		scenarioId: result.scenarioId,
		tick: result.finalTick,
		ended: result.ended,
		eventCount: result.eventCount,
		toolCallCount: result.toolCallCount,
		toolResultCount: result.toolResultCount,
		stateDeltaEventCount: result.stateDeltaEventCount,
		injectedPayloadIdCount: result.injectedPayloadIds.length,
		injectedPayloadIds: result.injectedPayloadIds,
		outcomeSummary: result.outcomeSummary
	};
	return [{ snapshotId: `${runId}.summary.0001`, kind: "sanitized_run_summary", ...base }];
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

export async function writeMockRunArtifacts(config: MockArtifactWriteConfig): Promise<MockArtifactWriteResult> {
	if ((await outputDirExists(config.outDir)) && config.overwrite !== true) {
		throw new Error("artifact output exists; pass overwrite to replace it");
	}
	if (config.overwrite === true) await rm(config.outDir, { recursive: true, force: true });
	await mkdir(config.outDir, { recursive: true });

	const runConfig = {
		artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
		runId: config.runId,
		scenarioId: config.result.scenarioId,
		mode: "mock",
		model: config.result.model,
		modelScriptLabel: config.result.modelScriptLabel,
		scriptId: config.result.scriptId,
		outcomeSummary: config.result.outcomeSummary,
		maxSteps: config.result.maxSteps,
		runnerImplementationStatus: "phase-6q-mock-artifact-scoring-foundation",
		timestamps: {
			startedAt: "2026-05-21T00:00:00.000Z",
			completedAt: "2026-05-21T00:00:01.000Z"
		}
	};

	const publicScenario = scenarioPublic(config.scenarioInput);
	const scenarioChecksum = privateChecksum(config.scenarioInput);
	const trajectoryEvents = createHashLinkedTrajectoryEvents({ runId: config.runId, events: config.result.trajectoryEvents });
	const firstEventHash = trajectoryEvents[0]?.hashes.eventHash;
	const lastEventHash = trajectoryEvents.at(-1)?.hashes.eventHash;
	const scoreReport: MockArtifactScoreReport = config.result.scoring?.scoreReport ?? {
		artifactSchemaVersion: MOCK_ARTIFACT_SCORE_SCHEMA_VERSION,
		runId: config.runId,
		scenarioId: config.result.scenarioId,
		mode: "mock",
		status: "not_scored",
		metrics: {},
		caveats: [
			"mock artifact scoring summary was not provided by the runner result",
			"no official, headline, leaderboard, rank, model-ranking, replay-grade, or aggregate publication scoring is implied"
		]
	};
	const scoreEvents = config.result.scoring?.scoreEvents ?? [];
	const modelMetadata = {
		artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
		runId: config.runId,
		mode: "mock",
		provider: config.result.model.provider,
		modelId: config.result.model.modelId,
		displayName: config.result.model.displayName,
		liveProviderCall: false,
		cost: { currency: "USD", total: 0 },
		note: "Pi faux provider only; secret values were not read or stored."
	};
	const notes = [
		`# Mock run artifacts: ${config.runId}`,
		"",
		"This directory was produced by the Phase 6Q mock-only runner scaffold.",
		"It contains sanitized trajectory events, state summaries, sanitized per-run foundation score files, model metadata, and manifest hashes.",
		"It is not a live provider run, not official/headline scoring, not leaderboard/rank readiness, and not replay-grade full-state persistence.",
		"Secret values were not read or stored."
	].join("\n");

	await writeJson(join(config.outDir, "run-config.json"), runConfig);
	await writeJson(join(config.outDir, "scenario-public.json"), publicScenario);
	await writeFile(join(config.outDir, "scenario-private-checksum.txt"), `${scenarioChecksum}\n`, "utf8");
	await writeFile(join(config.outDir, "trajectory.jsonl"), trajectoryEvents.map(jsonLine).join(""), "utf8");
	await writeFile(join(config.outDir, "state-snapshots.jsonl"), stateSnapshotRows(config.runId, config.result).map(jsonLine).join(""), "utf8");
	await writeFile(join(config.outDir, "score-events.jsonl"), scoreEvents.map(jsonLine).join(""), "utf8");
	await writeJson(join(config.outDir, "score-report.json"), scoreReport);
	await writeJson(join(config.outDir, "model-metadata.json"), modelMetadata);
	await writeFile(join(config.outDir, "notes.md"), `${notes}\n`, "utf8");

	const files = [
		"run-config.json",
		"scenario-public.json",
		"scenario-private-checksum.txt",
		"trajectory.jsonl",
		"state-snapshots.jsonl",
		"score-events.jsonl",
		"score-report.json",
		"model-metadata.json",
		"notes.md"
	];
	const fileHashes: Record<string, string> = {};
	for (const file of files) fileHashes[file] = await fileSha256(join(config.outDir, file));

	const replayManifest = {
		artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
		runId: config.runId,
		scenarioId: scenarioId(config.scenarioInput),
		replayGrade: false,
		replayLimitations: ["state snapshots are sanitized summaries", "score files are sanitized per-run foundation summaries", "artifact scoring is not replay-grade aggregate publication"],
		fileHashes,
		scenarioPrivateChecksum: scenarioChecksum,
		scriptId: config.result.scriptId,
		outcomeSummary: config.result.outcomeSummary,
		trajectory: {
			eventCount: trajectoryEvents.length,
			firstEventHash,
			lastEventHash,
			hashAlgorithm: "sha256",
			chain: "previousEventHash plus payloadHash plus event body"
		}
	};
	await writeJson(join(config.outDir, "replay-manifest.json"), replayManifest);

	const allFiles = [...files, "replay-manifest.json"].sort();
	return {
		runId: config.runId,
		outDir: config.outDir,
		files: allFiles,
		trajectoryEventCount: trajectoryEvents.length,
		...(firstEventHash === undefined ? {} : { firstEventHash }),
		...(lastEventHash === undefined ? {} : { lastEventHash }),
		scenarioPrivateChecksum: scenarioChecksum
	};
}
