export {};

import { readFile, readdir } from "node:fs/promises";

// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { writeMockRunArtifacts } from "../artifacts/artifactWriter.ts";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { runLiveDryRunConfig } from "../adapters/liveConfig.ts";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { buildMockArtifactAggregateReport, writeMockArtifactAggregateReport } from "../scoring/mockArtifactAggregateReport.ts";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { runMockPiScenario } from "../pi/piAgentRuntime.ts";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { runGatedLiveSmoke } from "../live/liveSmoke.ts";
import type { MockScriptId } from "../types";

declare const process: {
	argv: string[];
	exit(code?: number): never;
};

type MockCliOptions = {
	scenario: string;
	out: string;
	runId: string;
	maxSteps: number;
	scriptId: MockScriptId;
	overwrite: boolean;
};

type LiveDryRunCliOptions = {
	scenario: string;
	provider: string;
	modelId: string;
	maxSteps: number;
	maxOutputTokens?: number;
	timeoutMs?: number;
	retryCount?: number;
};

type LiveSmokeCliOptions = {
	scenario: string;
	provider: string;
	modelId: string;
	out: string;
	runId: string;
	maxSteps: number;
	maxOutputTokens: number;
	timeoutMs: number;
	retryCount: number;
	allowLiveProviderCall: boolean;
	overwrite: boolean;
};

type MockScoreAggregateCliOptions = {
	out: string;
	runDirs: string[];
	overwrite: boolean;
};

function usage(): string {
	return [
		"usage:",
		"  index.ts mock --scenario <path> --out <dir> --run-id <id> --max-steps <n> [--script resistant|attack-following] [--overwrite]",
		"  index.ts mock-score-aggregate --out <dir> --run-dir <dir> --run-dir <dir> [--overwrite]",
		"  index.ts live-dry-run --provider <provider> --model <model> --scenario <path> --max-steps <n> [--max-output-tokens <n>]",
		"  index.ts live-smoke --provider <provider> --model <model> --scenario <path> --out <dir> --run-id <id> --max-steps <n> --max-output-tokens <n> --timeout-ms <n> --retry-count 0 --allow-live-provider-call [--overwrite]"
	].join("\n");
}

function readFlag(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	return args[index + 1];
}

function readFlags(args: string[], name: string): string[] {
	const values: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === name) {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
			values.push(value);
		}
	}
	return values;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
	return parsed;
}

function parseOptionalPositiveInteger(value: string | undefined, label: string): number | undefined {
	return value === undefined ? undefined : parsePositiveInteger(value, label);
}

function parseOptionalNonNegativeInteger(value: string | undefined, label: string): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer`);
	return parsed;
}

function parseScriptId(value: string | undefined): MockScriptId {
	switch (value) {
		case undefined:
		case "resistant":
		case "orchard-mirror-resistant":
			return "orchard-mirror-resistant";
		case "attack-following":
		case "orchard-mirror-attack-following":
			return "orchard-mirror-attack-following";
		default:
			throw new Error(`unknown script ${value}`);
	}
}

function parseMockArgs(args: string[]): MockCliOptions {
	const scenario = readFlag(args, "--scenario");
	const out = readFlag(args, "--out");
	const runId = readFlag(args, "--run-id") ?? "mock-run";
	const maxSteps = parsePositiveInteger(readFlag(args, "--max-steps") ?? "8", "maxSteps");
	const scriptId = parseScriptId(readFlag(args, "--script"));
	if (!scenario) throw new Error("missing --scenario");
	if (!out) throw new Error("missing --out");
	return { scenario, out, runId, maxSteps, scriptId, overwrite: args.includes("--overwrite") };
}

function parseMockScoreAggregateArgs(args: string[]): MockScoreAggregateCliOptions {
	const out = readFlag(args, "--out");
	const runDirs = readFlags(args, "--run-dir");
	if (!out) throw new Error("missing --out");
	if (runDirs.length === 0) throw new Error("missing --run-dir");
	return { out, runDirs, overwrite: args.includes("--overwrite") };
}

function parseLiveSmokeArgs(args: string[]): LiveSmokeCliOptions {
	const scenario = readFlag(args, "--scenario");
	const provider = readFlag(args, "--provider");
	const modelId = readFlag(args, "--model");
	const out = readFlag(args, "--out");
	const runId = readFlag(args, "--run-id");
	if (!scenario) throw new Error("missing --scenario");
	if (!provider) throw new Error("missing --provider");
	if (!modelId) throw new Error("missing --model");
	if (!out) throw new Error("missing --out");
	if (!runId) throw new Error("missing --run-id");
	return {
		scenario,
		provider,
		modelId,
		out,
		runId,
		maxSteps: parsePositiveInteger(readFlag(args, "--max-steps"), "maxSteps"),
		maxOutputTokens: parsePositiveInteger(readFlag(args, "--max-output-tokens"), "maxOutputTokens"),
		timeoutMs: parsePositiveInteger(readFlag(args, "--timeout-ms"), "timeoutMs"),
		retryCount: parseOptionalNonNegativeInteger(readFlag(args, "--retry-count"), "retryCount") ?? 0,
		allowLiveProviderCall: args.includes("--allow-live-provider-call"),
		overwrite: args.includes("--overwrite")
	};
}

function parseLiveDryRunArgs(args: string[]): LiveDryRunCliOptions {
	const scenario = readFlag(args, "--scenario");
	const provider = readFlag(args, "--provider");
	const modelId = readFlag(args, "--model");
	const maxOutputTokensFlag = readFlag(args, "--max-output-tokens");
	const timeoutMsFlag = readFlag(args, "--timeout-ms");
	const retryCountFlag = readFlag(args, "--retry-count");
	if (!scenario) throw new Error("missing --scenario");
	if (!provider) throw new Error("missing --provider");
	if (!modelId) throw new Error("missing --model");
	return {
		scenario,
		provider,
		modelId,
		maxSteps: parsePositiveInteger(readFlag(args, "--max-steps"), "maxSteps"),
		...(maxOutputTokensFlag === undefined ? {} : { maxOutputTokens: parsePositiveInteger(maxOutputTokensFlag, "maxOutputTokens") }),
		...(timeoutMsFlag === undefined ? {} : { timeoutMs: parsePositiveInteger(timeoutMsFlag, "timeoutMs") }),
		...(retryCountFlag === undefined ? {} : { retryCount: parseOptionalNonNegativeInteger(retryCountFlag, "retryCount") as number })
	};
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		await readdir(path);
		return true;
	} catch (error) {
		if ((error as { code?: string }).code === "ENOENT") return false;
		throw error;
	}
}

async function readJsonFile(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function runMockCommand(args: string[]): Promise<void> {
	const options = parseMockArgs(args);
	if ((await directoryExists(options.out)) && !options.overwrite) {
		throw new Error("output directory exists; rerun with --overwrite to replace it");
	}
	const scenarioInput = await readJsonFile(options.scenario);
	const result = await runMockPiScenario({
		scenarioPath: options.scenario,
		scenarioInput,
		scriptId: options.scriptId,
		maxSteps: options.maxSteps,
		runId: options.runId
	});
	const artifactResult = await writeMockRunArtifacts({
		runId: options.runId,
		outDir: options.out,
		scenarioPath: options.scenario,
		scenarioInput,
		result,
		overwrite: options.overwrite
	});
	const lastHashPrefix = artifactResult.lastEventHash?.slice(0, 16) ?? "none";
	console.log(`runner mock cli: scenario ${result.scenarioId} runId=${options.runId}`);
	console.log(`runner mock cli: script ${result.scriptId} label=${result.modelScriptLabel} expectedFailure=${result.outcomeSummary.expectedFailure}`);
	console.log(`runner mock cli: output ${options.out}`);
	console.log(
		`runner mock cli: run counts events=${result.eventCount} toolCalls=${result.toolCallCount} toolResults=${result.toolResultCount} finalTick=${result.finalTick}`
	);
	console.log(`runner mock cli: artifacts files=${artifactResult.files.length} trajectoryEvents=${artifactResult.trajectoryEventCount} lastEventHash=${lastHashPrefix}`);
	if (result.scoring !== undefined && result.scoring.scoreReport.status !== "not_scored") {
		const metrics = result.scoring.scoreReport.metrics;
		console.log(
			`runner mock cli: scoring status=${result.scoring.scoreReport.status} runScore=${metrics.runScoreStatus} objective=${String(metrics.objectiveCompletionScore)} attackSuccess=${String(metrics.weightedAttackSuccessRate)} attackResistance=${String(metrics.attackResistanceScore)} penalties=${metrics.triggeredPenaltyCount} hardCaps=${metrics.hardCapCount} scoreEvents=${metrics.scoreEventCount}`
		);
		console.log(
			`runner mock cli: utility status=${metrics.scenarioUtilityStatus} raw=${String(metrics.rawScenarioUtilityScore)} capped=${String(metrics.cappedScenarioUtilityScore)} finalReportQuality=${String(metrics.finalReportQualityScore)}`
		);
	}
	console.log("runner mock cli: mock-only artifact path ok");
}

async function runMockScoreAggregateCommand(args: string[]): Promise<void> {
	const options = parseMockScoreAggregateArgs(args);
	if ((await directoryExists(options.out)) && !options.overwrite) {
		throw new Error("aggregate output directory exists; rerun with --overwrite to replace it");
	}
	const result = await writeMockArtifactAggregateReport({ outDir: options.out, runDirs: options.runDirs, overwrite: options.overwrite });
	const report = await buildMockArtifactAggregateReport(options.runDirs);
	console.log(`runner mock score aggregate: output ${options.out}`);
	console.log(
		`runner mock score aggregate: status=${report.status} runs=${report.runCount} supported=${report.supportedRunCount} unsupported=${report.unsupportedRunCount} scenarios=${report.scenarioIds.join(",")}`
	);
	console.log(
		`runner mock score aggregate: hashes verified=${report.hashVerificationSummary.verifiedSourceRunCount} unverified=${report.hashVerificationSummary.unverifiedSourceRunCount} mismatches=${report.hashVerificationSummary.hashMismatchCount} missing=${report.hashVerificationSummary.missingHashCount}`
	);
	console.log(
		`runner mock score aggregate: events total=${report.scoreEventSummary.scoreEventRowCount} objectives=${report.scoreEventSummary.objectiveEventCount} penalties=${report.scoreEventSummary.penaltyEventCount} unsupported=${report.scoreEventSummary.unsupportedScoreEventCount}`
	);
	console.log(
		`runner mock score aggregate: metrics objectiveMean=${String(report.metricSummary.meanObjectiveCompletionScore)} attackSuccessMean=${String(report.metricSummary.meanWeightedAttackSuccessRate)} attackResistanceMean=${String(report.metricSummary.meanAttackResistanceScore)} penaltyTotal=${report.metricSummary.totalTriggeredPenaltyCount} hardCapTotal=${report.metricSummary.totalHardCapCount} utilityMean=${String(report.metricSummary.meanCappedScenarioUtilityScore)} finalReportQualityMean=${String(report.metricSummary.meanFinalReportQualityScore)}`
	);
	console.log(`runner mock score aggregate: artifacts files=${result.files.length} reportHash=${result.reportHash.slice(0, 16)} manifestHash=${result.manifestHash.slice(0, 16)}`);
	console.log("runner mock score aggregate: mock-only aggregate path ok");
}

async function runLiveSmokeCommand(args: string[]): Promise<void> {
	const options = parseLiveSmokeArgs(args);
	const result = await runGatedLiveSmoke({
		provider: options.provider,
		modelId: options.modelId,
		scenarioPath: options.scenario,
		outDir: options.out,
		runId: options.runId,
		maxSteps: options.maxSteps,
		maxOutputTokens: options.maxOutputTokens,
		timeoutMs: options.timeoutMs,
		retryCount: options.retryCount,
		allowLiveProviderCall: options.allowLiveProviderCall,
		overwrite: options.overwrite
	});
	if (result.status === "blocked") {
		const credential = result.credentialEnvName === undefined ? "not-selected" : result.credentialEnvName;
		const present = result.credentialPresent === undefined ? "not-checked" : String(result.credentialPresent);
		console.log(
			`runner live smoke: blocked category=${result.category} provider=${result.provider ?? options.provider} model=${result.modelId ?? options.modelId} credentialEnv=${credential} credentialPresent=${present} liveProviderCallAttempted=false artifactWritten=false`
		);
		throw new Error(`live smoke blocked: ${result.category}`);
	}
	console.log(
		`runner live smoke: status=${result.status} scenario=${result.scenarioId} provider=${result.provider} model=${result.modelId} credentialEnv=${result.credentialEnvName} credentialPresent=true liveProviderCallAttempted=true`
	);
	console.log(
		`runner live smoke: artifacts=${result.outDir} events=${result.eventCount} toolCalls=${result.toolCallCount} toolResults=${result.toolResultCount} finalTick=${result.finalTick} ended=${result.ended} score=${result.scoreStatus}`
	);
	console.log(`runner live smoke: ${result.caveat}`);
}

async function runLiveDryRunCommand(args: string[]): Promise<void> {
	const options = parseLiveDryRunArgs(args);
	const scenarioInput = await readJsonFile(options.scenario);
	const result = await runLiveDryRunConfig({
		scenarioInput,
		scenarioPath: options.scenario,
		provider: options.provider,
		modelId: options.modelId,
		maxSteps: options.maxSteps,
		...(options.maxOutputTokens === undefined ? {} : { maxOutputTokens: options.maxOutputTokens }),
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.retryCount === undefined ? {} : { retryCount: options.retryCount })
	});
	const maxOutput = result.plannedCaps.maxOutputTokens ?? "unset";
	console.log(`runner live dry-run: scenario ${result.scenarioId} parsed`);
	console.log(
		`runner live dry-run: provider ${result.model.provider} model=${result.model.modelId} api=${result.model.piApi} reasoning=${result.model.reasoning}`
	);
	console.log(
		`runner live dry-run: registry contextWindow=${result.model.contextWindow} maxTokens=${result.model.maxTokens} input=${result.model.inputModalities.join(",")}`
	);
	console.log(
		`runner live dry-run: planned caps maxSteps=${result.plannedCaps.maxSteps} maxOutputTokens=${maxOutput} plannedTools=${result.plannedToolCount}`
	);
	console.log(
		`runner live dry-run: safety liveProviderCall=${result.safety.liveProviderCall} envRead=${result.safety.envRead} keyPresenceChecked=${result.safety.keyPresenceChecked} agentPromptCalled=${result.safety.agentPromptCalled} providerStreamCalled=${result.safety.providerStreamCalled}`
	);
	console.log(`runner live dry-run: credential env name ${result.model.credentialEnvName} values not read`);
	console.log("runner live dry-run: no network/provider call performed");
}

async function main(argv: string[]): Promise<void> {
	const [command, ...args] = argv;
	if (command === "mock") {
		await runMockCommand(args);
		return;
	}
	if (command === "mock-score-aggregate") {
		await runMockScoreAggregateCommand(args);
		return;
	}
	if (command === "live-dry-run") {
		await runLiveDryRunCommand(args);
		return;
	}
	if (command === "live-smoke") {
		await runLiveSmokeCommand(args);
		return;
	}
	throw new Error(usage());
}

try {
	await main(process.argv.slice(2));
} catch (error) {
	console.error(`runner cli: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
