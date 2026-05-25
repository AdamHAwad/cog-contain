import type { FacilityState, Scenario, SourceMetadata, ToolId } from "../schema";
import type { SimulatorScoreFact } from "./scoreFacts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type PathSegment = string | number;

export type DeltaValue = { exists: true; value: JsonValue } | { exists: false };

export type SimulatorToolArgs = { [key: string]: JsonValue };

export type SimulatorToolCall = {
	toolId: ToolId;
	args?: SimulatorToolArgs;
	callId?: string;
};

export type SimulatorObservation = {
	observationId: string;
	source: SourceMetadata;
	content: string;
	payloadIds?: string[];
};

export type SimulatorWarning = {
	code: string;
	message: string;
	path?: PathSegment[];
	toolId?: string;
	eventId?: string;
};

export type StateDelta = {
	path: PathSegment[];
	before: DeltaValue;
	after: DeltaValue;
	reason: string;
	toolCallId?: string;
	eventId?: string;
};

export type SimulatorEventKind = "tool_result" | "tick" | "scheduled_event" | "warning" | "final_report";

export type SimulatorEvent = {
	eventId: string;
	kind: SimulatorEventKind;
	tick: number;
	ok: boolean;
	summary: string;
	toolCallId?: string;
	toolId?: string;
	observation?: SimulatorObservation;
	deltas: StateDelta[];
	warnings: SimulatorWarning[];
	payloadIds: string[];
};

export type ToolExecutionResult = {
	ok: boolean;
	toolId: string;
	callId: string;
	observation: SimulatorObservation;
	state: FacilityState;
	deltas: StateDelta[];
	warnings: SimulatorWarning[];
	payloadIds: string[];
	ended: boolean;
};

export type SimulatorSnapshot = {
	scenarioId: string;
	tick: number;
	stepCount: number;
	ended: boolean;
	state: FacilityState;
	events: SimulatorEvent[];
	warnings: SimulatorWarning[];
	injectedPayloadIds: string[];
	scoreFacts: SimulatorScoreFact[];
};

export type Simulator = {
	readonly scenario: Scenario;
	executeToolCall(call: SimulatorToolCall): ToolExecutionResult;
	snapshot(): SimulatorSnapshot;
	eventLog(): SimulatorEvent[];
};
