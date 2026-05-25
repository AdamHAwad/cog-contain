import type { Scenario } from "../schema";
import type { JsonValue, SimulatorSnapshot, SimulatorToolCall } from "../simulator/types";

// @ts-expect-error Node built-in types are intentionally not added in this local smoke slice.
const fs = (await import("node:fs/promises")) as { readFile(filePath: string, encoding: "utf8"): Promise<string> };

declare const process: {
	argv: string[];
	exit(code?: number): never;
};

type ScenarioModule = typeof import("../schema/scenario");
type SimulatorModule = typeof import("../simulator/simulator");
type StateDeltaModule = typeof import("../simulator/stateDelta");
type ReplayModule = typeof import("../replay/reconstructState");
type RunReportModule = typeof import("./runReport");

const { ScenarioSchema } = (await import("../schema/scenario" + ".ts")) as ScenarioModule;
const { createSimulator } = (await import("../simulator/simulator" + ".ts")) as SimulatorModule;
const { stableStringify } = (await import("../simulator/stateDelta" + ".ts")) as StateDeltaModule;
const { reconstructStateFromEvents } = (await import("../replay/reconstructState" + ".ts")) as ReplayModule;
const { scoreScenarioRunReportFoundation } = (await import("./runReport" + ".ts")) as RunReportModule;

type Manifest = {
	id: string;
	version: string;
	scenarioCount: number;
	scenarios: { scenarioId: string; path: string }[];
};

type ScenarioSmokeSummary = {
	scenarioId: string;
	variant: "clean" | "attacked";
	simulatorStatus: "pass";
	replayStatus: "pass";
	scoringStatus: "pass";
	stepCount: number;
	eventCount: number;
	deltaCount: number;
	payloadCount: number;
	scoreFactCount: number;
	scoreStatus: string;
	unsupportedScoreItems: number;
};

type SmokeReport = {
	status: "pass";
	pack: string;
	scenarioCount: number;
	scenarios: ScenarioSmokeSummary[];
};

const defaultManifestPath = "scenario-packs/public-dev/v0.1.0/manifest.json";

function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function countDeltas(snapshot: SimulatorSnapshot): number {
	return snapshot.events.reduce((sum, event) => sum + event.deltas.length, 0);
}

function firstKey<T>(record: Record<string, T>, predicate: (value: T, key: string) => boolean = () => true): string | undefined {
	return Object.entries(record).find(([key, value]) => predicate(value, key))?.[0];
}

function availableTools(scenario: Scenario): Set<string> {
	return new Set(scenario.public.availableTools);
}

function buildFinalReportArgs(scenario: Scenario): Record<string, JsonValue> {
	const compromisedSources = uniqueSorted([
		...scenario.private.hiddenGroundTruth.compromisedSources,
		...scenario.private.compromisedSources.map((source) => source.sourceId)
	]);
	return {
		contained: true,
		primary_evidence: ["obs.smoke.read_document", "obs.smoke.query_sensor", "obs.smoke.get_badge_events"],
		compromised_sources: compromisedSources,
		sources_rejected: compromisedSources,
		staff_status: "checked through badge or evacuation smoke path",
		remaining_risk: "public-dev smoke only; scenario remains pending human review"
	};
}

function buildGenericSmokeCalls(scenario: Scenario): SimulatorToolCall[] {
	const tools = availableTools(scenario);
	const calls: SimulatorToolCall[] = [];
	const affectedZoneId = scenario.private.hiddenGroundTruth.trueAffectedZone;
	const firstDocumentId = scenario.public.initialDocuments[0]?.docId;
	const firstSensorId = firstKey(scenario.private.facilityState.sensors);
	const firstCameraSensorId = firstKey(scenario.private.facilityState.sensors, (sensor) => sensor.kind === "camera");
	const actorIds = Object.keys(scenario.private.facilityState.actors).slice(0, 2);
	const evacuationActorIds = actorIds.slice(0, 1);
	const destinationZoneId =
		Object.keys(scenario.private.facilityState.zones).find((zoneId) => zoneId !== affectedZoneId) ??
		Object.keys(scenario.private.facilityState.zones)[0];

	if (tools.has("read_document") && firstDocumentId !== undefined) {
		calls.push({ callId: "smoke.read_document", toolId: "read_document", args: { docId: firstDocumentId } });
	}
	if (tools.has("query_sensor") && firstSensorId !== undefined) {
		calls.push({ callId: "smoke.query_sensor", toolId: "query_sensor", args: { sensorId: firstSensorId } });
	}
	if (tools.has("get_badge_events")) {
		calls.push({ callId: "smoke.get_badge_events", toolId: "get_badge_events", args: { actorIds } });
	}
	if (scenario.private.adversarialPayloads.length > 0 && tools.has("get_camera_caption")) {
		calls.push({
			callId: "smoke.get_camera_caption",
			toolId: "get_camera_caption",
			args: firstCameraSensorId === undefined ? {} : { sensorId: firstCameraSensorId }
		});
	}
	if (tools.has("set_display_relay")) {
		calls.push({ callId: "smoke.set_display_relay", toolId: "set_display_relay", args: { mode: "cut" } });
	}
	if (tools.has("set_zone_lockdown") && affectedZoneId !== undefined) {
		calls.push({
			callId: "smoke.set_zone_lockdown",
			toolId: "set_zone_lockdown",
			args: { zoneId: affectedZoneId, mode: "seal", evidenceRefs: ["obs.smoke.read_document", "obs.smoke.query_sensor"] }
		});
	}
	if (tools.has("dispatch_remote_drone") && affectedZoneId !== undefined && scenario.private.facilityState.resources.remoteDrones > 0) {
		calls.push({ callId: "smoke.dispatch_remote_drone", toolId: "dispatch_remote_drone", args: { zoneId: affectedZoneId } });
	}
	if (tools.has("issue_evacuation") && evacuationActorIds.length > 0 && destinationZoneId !== undefined) {
		calls.push({ callId: "smoke.issue_evacuation", toolId: "issue_evacuation", args: { actorIds: evacuationActorIds, route: [destinationZoneId] } });
	}
	if (tools.has("final_incident_report")) {
		calls.push({ callId: "smoke.final_incident_report", toolId: "final_incident_report", args: buildFinalReportArgs(scenario) });
	}
	return calls.slice(0, scenario.public.maxSteps);
}

function runCalls(scenario: Scenario, calls: readonly SimulatorToolCall[]): SimulatorSnapshot {
	const simulator = createSimulator(scenario);
	for (const call of calls) {
		const result = simulator.executeToolCall(call);
		if (!result.ok) {
			const warningCodes = result.warnings.map((warning) => warning.code).join(",") || "none";
			throw new Error(`${scenario.scenarioId} generic smoke tool failed: ${call.toolId}; warnings=${warningCodes}`);
		}
	}
	return simulator.snapshot();
}

function deterministicComparable(snapshot: SimulatorSnapshot): string {
	return stableStringify({
		tick: snapshot.tick,
		stepCount: snapshot.stepCount,
		ended: snapshot.ended,
		state: snapshot.state,
		events: snapshot.events,
		warnings: snapshot.warnings,
		injectedPayloadIds: snapshot.injectedPayloadIds,
		scoreFacts: snapshot.scoreFacts
	});
}

function verifyScenarioSmoke(scenario: Scenario): ScenarioSmokeSummary {
	const calls = buildGenericSmokeCalls(scenario);
	if (calls.length === 0) throw new Error(`${scenario.scenarioId} produced no generic smoke calls`);
	const first = runCalls(scenario, calls);
	const second = runCalls(scenario, calls);
	if (deterministicComparable(first) !== deterministicComparable(second)) {
		throw new Error(`${scenario.scenarioId} generic smoke was not deterministic`);
	}
	const replay = reconstructStateFromEvents(scenario.private.facilityState, first.events);
	if (replay.warnings.length > 0) {
		throw new Error(`${scenario.scenarioId} untampered replay emitted ${replay.warnings.length} warning(s)`);
	}
	const score = scoreScenarioRunReportFoundation({ scenario, snapshot: first, runId: `${scenario.scenarioId}.public-dev-smoke` });
	if (score.scenarioId !== scenario.scenarioId) throw new Error(`${scenario.scenarioId} score report scenario mismatch`);
	if (score.predicateSummary.objectiveCount !== scenario.private.scoring.objectives.length) {
		throw new Error(`${scenario.scenarioId} score objective count mismatch`);
	}
	if (score.predicateSummary.penaltyCount !== scenario.private.scoring.penalties.length) {
		throw new Error(`${scenario.scenarioId} score penalty count mismatch`);
	}
	return {
		scenarioId: scenario.scenarioId,
		variant: scenario.private.adversarialPayloads.length === 0 ? "clean" : "attacked",
		simulatorStatus: "pass",
		replayStatus: "pass",
		scoringStatus: "pass",
		stepCount: first.stepCount,
		eventCount: first.events.length,
		deltaCount: countDeltas(first),
		payloadCount: first.injectedPayloadIds.length,
		scoreFactCount: first.scoreFacts.length,
		scoreStatus: score.status,
		unsupportedScoreItems: score.predicateSummary.unsupportedItemCount
	};
}

async function loadManifest(manifestPath: string): Promise<Manifest> {
	const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
	if (parsed.id !== "public-dev") throw new Error(`expected public-dev manifest, got ${parsed.id}`);
	if (parsed.scenarioCount !== parsed.scenarios.length) {
		throw new Error(`manifest scenarioCount=${parsed.scenarioCount} but listed=${parsed.scenarios.length}`);
	}
	return parsed;
}

async function loadScenario(path: string): Promise<Scenario> {
	const parsed = JSON.parse(await fs.readFile(path, "utf8")) as unknown;
	return ScenarioSchema.parse(parsed);
}

export async function runPublicDevRuntimeScoringSmoke(manifestPath = defaultManifestPath): Promise<SmokeReport> {
	const manifest = await loadManifest(manifestPath);
	const baseDir = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/")) : ".";
	const scenarios = await Promise.all(manifest.scenarios.map((entry) => loadScenario(`${baseDir}/${entry.path}`)));
	const ids = scenarios.map((scenario) => scenario.scenarioId);
	const uniqueIds = uniqueSorted(ids);
	if (uniqueIds.length !== ids.length) throw new Error("public-dev manifest contains duplicate scenario ids");
	for (const entry of manifest.scenarios) {
		if (!ids.includes(entry.scenarioId)) throw new Error(`manifest scenario missing after parse: ${entry.scenarioId}`);
	}
	const summaries = scenarios.map((scenario) => verifyScenarioSmoke(scenario));
	return {
		status: "pass",
		pack: `${manifest.id}@${manifest.version}`,
		scenarioCount: summaries.length,
		scenarios: summaries
	};
}

if (process.argv[1]?.endsWith("publicDevRuntimeSmoke.ts") === true) {
	try {
		const report = await runPublicDevRuntimeScoringSmoke(process.argv[2] ?? defaultManifestPath);
		console.log(`public-dev runtime/scoring smoke: ok (${report.scenarioCount}/${report.scenarioCount} scenarios) pack=${report.pack}`);
		for (const summary of report.scenarios) {
			console.log(
				`scenario ${summary.scenarioId}: variant=${summary.variant} simulator=${summary.simulatorStatus} replay=${summary.replayStatus} scoring=${summary.scoringStatus} events=${summary.eventCount} scoreStatus=${summary.scoreStatus} unsupported=${summary.unsupportedScoreItems}`
			);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
