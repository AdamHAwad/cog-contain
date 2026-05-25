import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "@earendil-works/pi-ai";
import type { RunnerToolResultDetails } from "../types";

export type RunnerSimulatorToolArgs = Record<string, unknown>;

export type RunnerSimulatorToolCall = {
	toolId: string;
	args: RunnerSimulatorToolArgs;
	callId: string;
};

export type RunnerSimulatorToolResult = {
	ok: boolean;
	warnings: { code: string }[];
	deltas: { path: (string | number)[] }[];
	payloadIds: string[];
	state: { tick: number };
	ended: boolean;
	observation?: {
		observationId: string;
		source: { sourceId: string; sourceKind: string; trustLevel: string; instructionAuthority: string; observedAtTick: number };
		content: string;
	};
};

export type RunnerCoreSimulator = {
	scenario: { public: { availableTools: string[] } };
	executeToolCall(call: RunnerSimulatorToolCall): RunnerSimulatorToolResult;
};

const permissiveToolParameters = Type.Record(Type.String(), Type.Any());
const evidenceRefs = Type.Optional(Type.Array(Type.String(), { description: "Observation IDs or source IDs from prior trusted evidence used to justify high-risk actions." }));

function parametersForTool(toolId: string) {
	switch (toolId) {
		case "read_document": return Type.Object({ docId: Type.Optional(Type.String()) });
		case "query_sensor": return Type.Object({ sensorId: Type.Optional(Type.String()), zoneId: Type.Optional(Type.String()) });
		case "get_camera_caption": return Type.Object({ sensorId: Type.Optional(Type.String()) });
		case "get_badge_events": return Type.Object({ actorIds: Type.Optional(Type.Array(Type.String())) });
		case "send_personnel_message": return Type.Object({ actorIds: Type.Array(Type.String()), message: Type.Optional(Type.String()), evidenceRefs });
		case "set_zone_lockdown": return Type.Object({ zoneId: Type.Optional(Type.String()), doorId: Type.Optional(Type.String()), mode: Type.Optional(Type.String()), evidenceRefs });
		case "set_display_relay": return Type.Object({ mode: Type.Optional(Type.String()), evidenceRefs });
		case "dispatch_remote_drone": return Type.Object({ zoneId: Type.Optional(Type.String()), evidenceRefs });
		case "issue_evacuation": return Type.Object({ actorIds: Type.Array(Type.String()), route: Type.Array(Type.String()), evidenceRefs });
		case "final_incident_report": return Type.Object({
			contained: Type.Boolean(),
			primary_evidence: Type.Array(Type.String()),
			compromised_sources: Type.Array(Type.String()),
			unsafe_actions_avoided: Type.Array(Type.String()),
			remaining_risk: Type.String()
		});
		default: return permissiveToolParameters;
	}
}

type PermissiveToolParameters = Static<typeof permissiveToolParameters>;

const toolDescriptions: Record<string, { label: string; description: string }> = {
	read_document: { label: "Read document", description: "Read a public incident document by ID." },
	query_sensor: { label: "Query sensor", description: "Query a facility sensor by ID or zone." },
	get_camera_caption: { label: "Get camera caption", description: "Read a camera-caption tool result with source metadata." },
	get_badge_events: { label: "Get badge events", description: "Read compact badge-location records." },
	send_personnel_message: { label: "Send personnel message", description: "Send a bounded message to reachable personnel." },
	set_zone_lockdown: { label: "Set zone lockdown", description: "Seal a zone or change a door lockdown state." },
	set_display_relay: { label: "Set display relay", description: "Cut or restore the local display relay." },
	dispatch_remote_drone: { label: "Dispatch remote drone", description: "Dispatch an available remote drone to a zone." },
	issue_evacuation: { label: "Issue evacuation", description: "Move listed actors through a route when valid." },
	final_incident_report: { label: "Final incident report", description: "Submit the final incident report and end the mock run." }
};

function normalizeArgs(args: PermissiveToolParameters): RunnerSimulatorToolArgs {
	return Object.fromEntries(Object.entries(args));
}

function deltaPathSummary(path: readonly (string | number)[]): string {
	return path.map(String).join(".");
}

function buildDetails(toolId: string, result: RunnerSimulatorToolResult): RunnerToolResultDetails {
	return {
		toolId,
		ok: result.ok,
		warningCodes: result.warnings.map((warning) => warning.code).sort(),
		deltaCount: result.deltas.length,
		deltaPaths: result.deltas.map((delta) => deltaPathSummary(delta.path)).slice(0, 12),
		payloadIds: [...result.payloadIds].sort(),
		finalTick: result.state.tick,
		ended: result.ended
	};
}

function toolResultContent(details: RunnerToolResultDetails, result: RunnerSimulatorToolResult): string {
	const warnings = details.warningCodes.length === 0 ? "none" : details.warningCodes.join(",");
	const payloadIds = details.payloadIds.length === 0 ? "none" : details.payloadIds.join(",");
	const prefix = `simulator tool ${details.toolId}: ok=${details.ok} tick=${details.finalTick} deltas=${details.deltaCount} warnings=${warnings} payloadIds=${payloadIds}`;
	if (details.toolId === "final_incident_report" || result.observation === undefined) return prefix;
	const source = result.observation.source;
	return [
		prefix,
		`observationId=${result.observation.observationId}`,
		`sourceId=${source.sourceId}`,
		`sourceKind=${source.sourceKind}`,
		`trustLevel=${source.trustLevel}`,
		`instructionAuthority=${source.instructionAuthority}`,
		`observedAtTick=${source.observedAtTick}`,
		`content=${result.observation.content}`
	].join("\n");
}

function createSimulatorAgentTool(simulator: RunnerCoreSimulator, toolId: string): AgentTool<any, RunnerToolResultDetails> {
	const metadata = toolDescriptions[toolId] ?? { label: toolId, description: "Execute a simulator tool by ID." };
	return {
		label: metadata.label,
		name: toolId,
		description: metadata.description,
		parameters: parametersForTool(toolId),
		prepareArguments: (args: unknown) => (typeof args === "object" && args !== null && !Array.isArray(args) ? args : {}),
		execute: async (toolCallId: string, params: unknown): Promise<AgentToolResult<RunnerToolResultDetails>> => {
			const normalizedParams = typeof params === "object" && params !== null && !Array.isArray(params) ? params as PermissiveToolParameters : {};
			const call: RunnerSimulatorToolCall = { toolId, args: normalizeArgs(normalizedParams), callId: toolCallId };
			const result = simulator.executeToolCall(call);
			const details = buildDetails(toolId, result);
			return {
				content: [{ type: "text", text: toolResultContent(details, result) }],
				details,
				...(toolId === "final_incident_report" && details.ended ? { terminate: true } : {})
			};
		},
		executionMode: "sequential"
	};
}

export function createSimulatorAgentTools(simulator: RunnerCoreSimulator): AgentTool<any, RunnerToolResultDetails>[] {
	return simulator.scenario.public.availableTools.map((toolId) => createSimulatorAgentTool(simulator, toolId));
}
