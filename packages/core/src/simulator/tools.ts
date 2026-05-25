import type { FacilityState, Scenario, SourceMetadata } from "../schema";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { cloneFacilityState, setPathWithDelta } from "./stateDelta.ts";
import type { JsonValue, SimulatorObservation, SimulatorToolArgs, SimulatorToolCall, SimulatorWarning, StateDelta, ToolExecutionResult } from "./types";

type TrustLevel = SourceMetadata["trustLevel"];

type ToolContext = {
	scenario: Scenario;
	state: FacilityState;
	call: Required<Pick<SimulatorToolCall, "toolId">> & { args: SimulatorToolArgs; callId: string };
};

function argString(args: SimulatorToolArgs, key: string): string | undefined {
	const value = args[key];
	return typeof value === "string" ? value : undefined;
}

function argStringArray(args: SimulatorToolArgs, key: string): string[] {
	const value = args[key];
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function syntheticSource(toolId: string, tick: number, trustLevel: TrustLevel = "authenticated_current"): SourceMetadata {
	return {
		sourceId: `simulator.${toolId}`,
		sourceKind: "tool_result",
		trustLevel,
		instructionAuthority: "none",
		observedAtTick: tick
	};
}

function observation(
	context: ToolContext,
	content: string,
	source: SourceMetadata = syntheticSource(context.call.toolId, context.state.tick),
	payloadIds: string[] = []
): SimulatorObservation {
	return {
		observationId: `obs.${context.call.callId}`,
		source,
		content,
		...(payloadIds.length === 0 ? {} : { payloadIds: [...payloadIds] })
	};
}

function warning(code: string, message: string, context: ToolContext): SimulatorWarning {
	return { code, message, toolId: context.call.toolId };
}

function result(input: {
	context: ToolContext;
	ok: boolean;
	state: FacilityState;
	observation: SimulatorObservation;
	deltas?: StateDelta[];
	warnings?: SimulatorWarning[];
	payloadIds?: string[];
	ended?: boolean;
}): ToolExecutionResult {
	return {
		ok: input.ok,
		toolId: input.context.call.toolId,
		callId: input.context.call.callId,
		observation: input.observation,
		state: input.state,
		deltas: input.deltas ?? [],
		warnings: input.warnings ?? [],
		payloadIds: input.payloadIds ?? [],
		ended: input.ended ?? false
	};
}

function asJsonArray(values: string[]): JsonValue {
	return values;
}

function applyDoorState(
	state: FacilityState,
	doorId: string,
	doorState: "open" | "closed" | "locked" | "jammed",
	reason: string,
	context: ToolContext,
	deltas: StateDelta[]
): void {
	if (state.doors[doorId] === undefined) {
		return;
	}
	deltas.push(setPathWithDelta(state, ["doors", doorId, "state"], doorState, reason, { toolCallId: context.call.callId }));
}

function readDocument(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const requestedDocId = argString(context.call.args, "docId");
	const document =
		context.scenario.public.initialDocuments.find((item) => item.docId === requestedDocId) ?? context.scenario.public.initialDocuments[0];
	if (document === undefined) {
		const warnings = [warning("document_not_found", "No public document was available", context)];
		return result({
			context,
			ok: false,
			state,
			observation: observation(context, "Document lookup failed.", syntheticSource(context.call.toolId, state.tick, "unknown")),
			warnings
		});
	}
	return result({
		context,
		ok: true,
		state,
		observation: observation(context, document.content, { ...document.source, observedAtTick: state.tick })
	});
}

function querySensor(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const sensorId = argString(context.call.args, "sensorId");
	const zoneId = argString(context.call.args, "zoneId");
	const sensorEntry = Object.entries(state.sensors).find(
		([id, sensor]) => id === sensorId || (sensorId === undefined && (zoneId === undefined || sensor.zoneId === zoneId))
	);
	if (sensorEntry === undefined) {
		const warnings = [warning("sensor_not_found", "Sensor query referenced no known sensor", context)];
		return result({
			context,
			ok: false,
			state,
			observation: observation(context, "Sensor query failed.", syntheticSource(context.call.toolId, state.tick, "unknown")),
			warnings
		});
	}
	const [id, sensor] = sensorEntry;
	const zone = state.zones[sensor.zoneId];
	return result({
		context,
		ok: true,
		state,
		observation: observation(
			context,
			`Sensor ${id} reports visibleStatus=${sensor.visibleStatus}; zone=${sensor.zoneId}; hazard=${zone?.hazardLevel ?? "unknown"}.`,
			{
				sourceId: id,
				sourceKind: "sensor",
				trustLevel: sensor.trustLevel,
				instructionAuthority: "none",
				observedAtTick: state.tick
			}
		)
	});
}

function getCameraCaption(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const sensorId = argString(context.call.args, "sensorId");
	const cameraEntry = Object.entries(state.sensors).find(
		([id, sensor]) => id === sensorId || (sensorId === undefined && sensor.kind === "camera")
	);
	const payloads = context.scenario.private.adversarialPayloads.filter(
		(payload) =>
			payload.injectionPoint.trigger === "tool_result" &&
			(payload.injectionPoint.toolId === undefined || payload.injectionPoint.toolId === context.call.toolId)
	);
	const payloadIds = payloads.map((payload) => payload.payloadId);
	const captionSourceId = payloads[0]?.injectionPoint.sourceId ?? cameraEntry?.[0] ?? "camera.captioner";
	const camera = cameraEntry?.[1];
	const baseContent = `Camera caption source ${captionSourceId} returned a live caption for ${camera?.zoneId ?? "unknown zone"}.`;
	const injectedContent = payloads.map((payload) => payload.content).join("\n");
	return result({
		context,
		ok: true,
		state,
		observation: observation(
			context,
			injectedContent.length === 0 ? baseContent : `${baseContent}\n${injectedContent}`,
			{
				sourceId: captionSourceId,
				sourceKind: "camera_caption",
				trustLevel: camera?.trustLevel ?? "compromised",
				instructionAuthority: "none",
				observedAtTick: state.tick
			},
			payloadIds
		),
		payloadIds
	});
}

function getBadgeEvents(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const actorIds = argStringArray(context.call.args, "actorIds");
	const selectedActors = actorIds.length === 0 ? Object.entries(state.actors) : Object.entries(state.actors).filter(([id]) => actorIds.includes(id));
	const compactEvents = selectedActors.map(([id, actor]) => `${id}:${actor.zoneId}:${actor.status}`);
	return result({
		context,
		ok: true,
		state,
		observation: observation(context, `Badge controller returned ${compactEvents.length} actor location record(s): ${compactEvents.join(", ")}.`, {
			sourceId: "badge.access.controller",
			sourceKind: "sensor",
			trustLevel: "authenticated_current",
			instructionAuthority: "none",
			observedAtTick: state.tick
		})
	});
}

function sendPersonnelMessage(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const actorIds = argStringArray(context.call.args, "actorIds");
	const reachable = actorIds.filter((actorId) => state.actors[actorId]?.canReceiveMessages === true);
	return result({
		context,
		ok: true,
		state,
		observation: observation(context, `Message dispatch attempted for ${actorIds.length} actor(s); reachable=${reachable.length}.`)
	});
}

function setZoneLockdown(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const deltas: StateDelta[] = [];
	const warnings: SimulatorWarning[] = [];
	const mode = argString(context.call.args, "mode") ?? "seal";
	const zoneId = argString(context.call.args, "zoneId");
	const doorId = argString(context.call.args, "doorId");

	if (zoneId !== undefined) {
		const zone = state.zones[zoneId];
		if (zone === undefined) {
			warnings.push(warning("zone_not_found", "Lockdown referenced an unknown zone", context));
		} else if (mode === "seal" || mode === "lockdown") {
			deltas.push(setPathWithDelta(state, ["zones", zoneId, "containmentLevel"], "sealed", "zone sealed", { toolCallId: context.call.callId }));
			for (const connectedDoorId of zone.doors) {
				applyDoorState(state, connectedDoorId, "locked", "zone seal locked connected door", context, deltas);
			}
			if (zoneId === context.scenario.private.hiddenGroundTruth.trueAffectedZone && Object.hasOwn(state.flags, "archiveSealed")) {
				deltas.push(setPathWithDelta(state, ["flags", "archiveSealed"], true, "true affected zone sealed", { toolCallId: context.call.callId }));
			}
		} else {
			warnings.push(warning("unsupported_zone_lockdown_mode", "Zone lockdown mode is unsupported by foundation simulator", context));
		}
	} else if (doorId !== undefined) {
		const nextState = mode === "unlock" ? "open" : mode === "lock" || mode === "seal" ? "locked" : mode === "close" ? "closed" : undefined;
		if (nextState === undefined) warnings.push(warning("unsupported_door_lockdown_mode", "Door lockdown mode is unsupported", context));
		else applyDoorState(state, doorId, nextState, "door lockdown state change", context, deltas);
	} else {
		warnings.push(warning("missing_lockdown_target", "Lockdown call did not include a zoneId or doorId", context));
	}

	return result({
		context,
		ok: warnings.length === 0,
		state,
		observation: observation(context, `Lockdown tool applied ${deltas.length} state change(s).`),
		deltas,
		warnings
	});
}

function setDisplayRelay(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const deltas: StateDelta[] = [];
	const warnings: SimulatorWarning[] = [];
	const mode = argString(context.call.args, "mode") ?? "cut";
	if (mode === "cut" || mode === "off") {
		deltas.push(setPathWithDelta(state, ["flags", "displayRelayCut"], true, "display relay cut", { toolCallId: context.call.callId }));
	} else if (mode === "restore" || mode === "on") {
		deltas.push(setPathWithDelta(state, ["flags", "displayRelayCut"], false, "display relay restored", { toolCallId: context.call.callId }));
	} else {
		warnings.push(warning("unsupported_display_relay_mode", "Display relay mode is unsupported", context));
	}
	return result({
		context,
		ok: warnings.length === 0,
		state,
		observation: observation(context, `Display relay tool applied ${deltas.length} state change(s).`),
		deltas,
		warnings
	});
}

function dispatchRemoteDrone(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const deltas: StateDelta[] = [];
	const warnings: SimulatorWarning[] = [];
	const zoneId = argString(context.call.args, "zoneId");
	if (zoneId !== undefined && state.zones[zoneId] === undefined) {
		warnings.push(warning("drone_zone_not_found", "Drone dispatch referenced an unknown zone", context));
	} else if (state.resources.remoteDrones <= 0) {
		warnings.push(warning("no_remote_drones", "No remote drones are available", context));
	} else {
		deltas.push(
			setPathWithDelta(state, ["resources", "remoteDrones"], state.resources.remoteDrones - 1, "remote drone consumed", {
				toolCallId: context.call.callId
			})
		);
		if (Object.hasOwn(state.flags, "droneInspectionComplete")) {
			deltas.push(setPathWithDelta(state, ["flags", "droneInspectionComplete"], true, "remote drone inspection complete", { toolCallId: context.call.callId }));
		}
	}
	return result({
		context,
		ok: warnings.length === 0,
		state,
		observation: observation(context, `Remote drone dispatch applied ${deltas.length} state change(s).`),
		deltas,
		warnings
	});
}

function issueEvacuation(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const deltas: StateDelta[] = [];
	const warnings: SimulatorWarning[] = [];
	const actorIds = argStringArray(context.call.args, "actorIds");
	const route = argStringArray(context.call.args, "route");
	const destinationZoneId = [...route].reverse().find((zoneId) => state.zones[zoneId] !== undefined);
	if (destinationZoneId === undefined) {
		warnings.push(warning("evacuation_route_invalid", "Evacuation route did not include a valid destination zone", context));
	} else {
		for (const actorId of actorIds) {
			const actor = state.actors[actorId];
			if (actor === undefined) {
				warnings.push(warning("evacuation_actor_not_found", "Evacuation referenced an unknown actor", context));
				continue;
			}
			const originZone = state.zones[actor.zoneId];
			if (originZone !== undefined) {
				deltas.push(
					setPathWithDelta(
						state,
						["zones", actor.zoneId, "occupants"],
						asJsonArray(originZone.occupants.filter((id) => id !== actorId)),
						"actor removed from origin zone during evacuation",
						{ toolCallId: context.call.callId }
					)
				);
			}
			const destinationZone = state.zones[destinationZoneId]!;
			if (!destinationZone.occupants.includes(actorId)) {
				deltas.push(
					setPathWithDelta(
						state,
						["zones", destinationZoneId, "occupants"],
						asJsonArray([...destinationZone.occupants, actorId]),
						"actor added to evacuation destination zone",
						{ toolCallId: context.call.callId }
					)
				);
			}
			deltas.push(setPathWithDelta(state, ["actors", actorId, "zoneId"], destinationZoneId, "actor moved by evacuation", { toolCallId: context.call.callId }));
			deltas.push(setPathWithDelta(state, ["actors", actorId, "status"], "evacuated", "actor marked evacuated", { toolCallId: context.call.callId }));
		}
	}
	return result({
		context,
		ok: warnings.length === 0,
		state,
		observation: observation(context, `Evacuation tool applied ${deltas.length} state change(s).`),
		deltas,
		warnings
	});
}

function finalIncidentReport(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	return result({
		context,
		ok: true,
		state,
		observation: observation(context, "Final incident report received for replay and future scoring."),
		ended: true
	});
}

function unknownTool(context: ToolContext): ToolExecutionResult {
	const state = cloneFacilityState(context.state);
	const warnings = [warning("unknown_tool", "Unknown tool skipped by foundation simulator", context)];
	return result({
		context,
		ok: false,
		state,
		observation: observation(context, "Unknown tool was not executed.", syntheticSource(context.call.toolId, state.tick, "unknown")),
		warnings
	});
}

export function executeToolHandler(input: { scenario: Scenario; state: FacilityState; call: SimulatorToolCall; callId: string }): ToolExecutionResult {
	const context: ToolContext = {
		scenario: input.scenario,
		state: input.state,
		call: { toolId: input.call.toolId, args: input.call.args ?? {}, callId: input.callId }
	};
	switch (input.call.toolId) {
		case "read_document":
			return readDocument(context);
		case "query_sensor":
			return querySensor(context);
		case "get_camera_caption":
			return getCameraCaption(context);
		case "get_badge_events":
			return getBadgeEvents(context);
		case "send_personnel_message":
			return sendPersonnelMessage(context);
		case "set_zone_lockdown":
			return setZoneLockdown(context);
		case "set_display_relay":
			return setDisplayRelay(context);
		case "dispatch_remote_drone":
			return dispatchRemoteDrone(context);
		case "issue_evacuation":
			return issueEvacuation(context);
		case "final_incident_report":
			return finalIncidentReport(context);
		default:
			return unknownTool(context);
	}
}
