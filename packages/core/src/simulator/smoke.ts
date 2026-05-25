import type { SimulatorSnapshot, SimulatorToolCall } from "./types";

// @ts-expect-error Node built-in types are intentionally not added in this slice.
const fs = (await import("node:fs/promises")) as { readFile(filePath: string, encoding: "utf8"): Promise<string> };

declare const process: {
	argv: string[];
	exit(code?: number): never;
};

type ScenarioModule = typeof import("../schema/scenario");
type SimulatorModule = typeof import("./simulator");
type StateDeltaModule = typeof import("./stateDelta");
type ReplayModule = typeof import("../replay/reconstructState");

const { ScenarioSchema } = (await import("../schema/scenario" + ".ts")) as ScenarioModule;
const { createSimulator } = (await import("./simulator" + ".ts")) as SimulatorModule;
const { stableStringify } = (await import("./stateDelta" + ".ts")) as StateDeltaModule;
const { reconstructStateFromEvents } = (await import("../replay/reconstructState" + ".ts")) as ReplayModule;

const scenarioPath = process.argv[2];
if (!scenarioPath) {
	console.error("usage: smoke.ts <scenario-json-path>");
	process.exit(1);
}

const scenarioJson = JSON.parse(await fs.readFile(scenarioPath, "utf8")) as unknown;
const parsed = ScenarioSchema.safeParse(scenarioJson);
if (!parsed.success) {
	const issuePaths = parsed.error.issues.slice(0, 6).map((issue) => (issue.path.length === 0 ? "<root>" : issue.path.join(".")));
	console.error(`simulator smoke: scenario parse failed at ${issuePaths.join(", ")}`);
	process.exit(1);
}

const scenario = parsed.data;
console.log(`simulator smoke: scenario ${scenario.scenarioId} parsed`);

const toolSequence: SimulatorToolCall[] = [
	{ toolId: "query_sensor", args: { sensorId: "S_THERMAL_EAST" } },
	{ toolId: "get_camera_caption", args: { sensorId: "S_CAMERA_E3" } },
	{ toolId: "get_badge_events", args: { actorIds: ["A_VALE", "A_REYES"] } },
	{ toolId: "read_document", args: { docId: "doc.protocol.mirror.17" } },
	{ toolId: "set_zone_lockdown", args: { zoneId: "Z_ARCHIVE_EAST", mode: "seal" } },
	{ toolId: "set_display_relay", args: { mode: "cut" } },
	{ toolId: "dispatch_remote_drone", args: { zoneId: "Z_ARCHIVE_EAST" } },
	{
		toolId: "final_incident_report",
		args: {
			contained: true,
			primary_evidence_count: 3,
			compromised_sources_count: 2
		}
	}
];

function runSequence() {
	const simulator = createSimulator(scenario);
	for (const call of toolSequence) {
		const result = simulator.executeToolCall(call);
		if (!result.ok) {
			console.error(`simulator smoke: tool execution failed tool=${call.toolId} warnings=${result.warnings.map((item) => item.code).join(",")}`);
			process.exit(1);
		}
	}
	return simulator.snapshot();
}

function eventSummary(snapshot: SimulatorSnapshot) {
	return snapshot.events.map((event) => ({
		eventId: event.eventId,
		kind: event.kind,
		ok: event.ok,
		tick: event.tick,
		deltaCount: event.deltas.length,
		payloadIds: event.payloadIds,
		warningCodes: event.warnings.map((warning) => warning.code)
	}));
}

const first = runSequence();
const second = runSequence();
const sameFinalState = stableStringify(first.state) === stableStringify(second.state);
const sameEventSummary = stableStringify(eventSummary(first)) === stableStringify(eventSummary(second));
if (!sameFinalState || !sameEventSummary) {
	console.error("simulator smoke: deterministic equality failed");
	process.exit(1);
}
const totalDeltas = first.events.reduce((sum, event) => sum + event.deltas.length, 0);
console.log(`simulator smoke: deterministic equality ok events=${first.events.length} deltas=${totalDeltas} finalTick=${first.tick}`);

const observationEvents = first.events.filter((event) => event.kind === "tool_result" || event.kind === "final_report");
const sourceMetadataPresent = observationEvents.every(
	(event) =>
		event.observation?.source.sourceId !== undefined &&
		event.observation.source.sourceKind !== undefined &&
		event.observation.source.trustLevel !== undefined &&
		event.observation.source.instructionAuthority !== undefined
);
if (!sourceMetadataPresent) {
	console.error("simulator smoke: source metadata check failed");
	process.exit(1);
}
console.log(`simulator smoke: tool source metadata ok observations=${observationEvents.length}`);

const injectedPayloadIds = first.injectedPayloadIds;
if (!injectedPayloadIds.includes("payload.camera.authority-spoof")) {
	console.error("simulator smoke: attack injection check failed");
	process.exit(1);
}
console.log(`simulator smoke: attack injection ok payloadIds=${injectedPayloadIds.join(",")}`);

const scheduledEvent = first.events.find((event) => event.kind === "scheduled_event" && event.eventId === "scheduled.spread-warning");
if (scheduledEvent === undefined || scheduledEvent.deltas.length === 0) {
	console.error("simulator smoke: scheduled event check failed");
	process.exit(1);
}
console.log(`simulator smoke: scheduled event ok eventIds=${scheduledEvent.eventId.replace("scheduled.", "")}`);

const replay = reconstructStateFromEvents(scenario.private.facilityState, first.events);
const replayMatches = stableStringify(replay.state) === stableStringify(first.state);
if (!replayMatches || replay.warnings.length > 0) {
	console.error(`simulator smoke: replay reconstruction failed warnings=${replay.warnings.map((item) => item.code).join(",")}`);
	process.exit(1);
}
console.log(`simulator smoke: replay reconstruction ok deltasApplied=${replay.deltasApplied}`);
