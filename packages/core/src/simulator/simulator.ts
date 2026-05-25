// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { ScenarioSchema } from "../schema/scenario.ts";
import type { FacilityState, Scenario, SourceMetadata } from "../schema";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { applyDueScheduledEvents } from "./eventSchedule.ts";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { createSeededPrng, type SeededPrng } from "./prng.ts";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { collectScoreFactsForToolCall } from "./scoreFacts.ts";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { cloneFacilityState, deepCloneJson, setPathWithDelta } from "./stateDelta.ts";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { executeToolHandler } from "./tools.ts";
import type { Simulator, SimulatorEvent, SimulatorObservation, SimulatorSnapshot, SimulatorToolCall, SimulatorWarning, StateDelta, ToolExecutionResult } from "./types";

function controllerSource(tick: number): SourceMetadata {
	return {
		sourceId: "simulator.controller",
		sourceKind: "tool_result",
		trustLevel: "system",
		instructionAuthority: "none",
		observedAtTick: tick
	};
}

function rejectedObservation(callId: string, tick: number, content: string): SimulatorObservation {
	return {
		observationId: `obs.${callId}`,
		source: controllerSource(tick),
		content
	};
}

function validationErrorMessage(input: unknown): string {
	const result = ScenarioSchema.safeParse(input);
	if (result.success) return "scenario parsed";
	const paths = result.error.issues.slice(0, 6).map((issue) => (issue.path.length === 0 ? "<root>" : issue.path.join(".")));
	return `scenario validation failed at ${paths.join(", ")}`;
}

export class CoreSimulator implements Simulator {
	readonly scenario: Scenario;
	#state: FacilityState;
	#events: SimulatorEvent[] = [];
	#warnings: SimulatorWarning[] = [];
	#scoreFacts: ReturnType<typeof collectScoreFactsForToolCall> = [];
	#appliedScheduledEventIds = new Set<string>();
	#injectedPayloadIds = new Set<string>();
	#stepCount = 0;
	#ended = false;
	#prng: SeededPrng;

	constructor(scenario: Scenario) {
		this.scenario = scenario;
		this.#state = cloneFacilityState(scenario.private.facilityState);
		this.#prng = createSeededPrng(scenario.private.randomSeed);
	}

	executeToolCall(call: SimulatorToolCall): ToolExecutionResult {
		const callId = call.callId ?? `call.${this.#stepCount + 1}.${call.toolId}`;
		if (this.#ended) {
			return this.#rejectCall(call, callId, "simulator_ended", "Simulator already ended after final report");
		}
		if (this.#stepCount >= this.scenario.public.maxSteps) {
			return this.#rejectCall(call, callId, "max_steps_exceeded", "Scenario maxSteps has already been reached");
		}

		const scoreFacts = collectScoreFactsForToolCall({
			scenario: this.scenario,
			state: this.#state,
			toolCallId: callId,
			toolId: call.toolId,
			tick: this.#state.tick,
			args: call.args ?? {},
			priorEvents: this.#events
		});

		const toolResult = executeToolHandler({ scenario: this.scenario, state: this.#state, call, callId });
		if (toolResult.ok) this.#scoreFacts.push(...scoreFacts);
		this.#state = toolResult.state;
		for (const payloadId of toolResult.payloadIds) this.#injectedPayloadIds.add(payloadId);

		const toolEvent: SimulatorEvent = {
			eventId: `tool.${callId}`,
			kind: toolResult.ended ? "final_report" : "tool_result",
			tick: this.#state.tick,
			ok: toolResult.ok,
			summary: toolResult.ended ? "final report received" : `tool ${call.toolId} executed`,
			toolCallId: callId,
			toolId: call.toolId,
			observation: toolResult.observation,
			deltas: toolResult.deltas,
			warnings: toolResult.warnings,
			payloadIds: toolResult.payloadIds
		};
		this.#events.push(toolEvent);
		this.#warnings.push(...toolResult.warnings);

		if (!toolResult.ok) {
			return { ...toolResult, state: cloneFacilityState(this.#state) };
		}

		this.#stepCount += 1;
		const tickDelta = setPathWithDelta(this.#state, ["tick"], this.#state.tick + 1, "accepted tool call advanced simulator tick", {
			toolCallId: callId
		});
		const tickEvent: SimulatorEvent = {
			eventId: `tick.${callId}`,
			kind: "tick",
			tick: this.#state.tick,
			ok: true,
			summary: "simulator tick advanced",
			toolCallId: callId,
			toolId: call.toolId,
			deltas: [tickDelta],
			warnings: [],
			payloadIds: []
		};
		this.#events.push(tickEvent);

		const scheduled = applyDueScheduledEvents({
			scenario: this.scenario,
			state: this.#state,
			appliedEventIds: this.#appliedScheduledEventIds
		});
		this.#state = scheduled.state;
		this.#appliedScheduledEventIds = scheduled.appliedEventIds;
		this.#events.push(...scheduled.events);
		this.#warnings.push(...scheduled.warnings);

		if (toolResult.ended) this.#ended = true;

		const combinedDeltas: StateDelta[] = [...toolResult.deltas, tickDelta, ...scheduled.deltas];
		return {
			...toolResult,
			state: cloneFacilityState(this.#state),
			deltas: combinedDeltas,
			warnings: [...toolResult.warnings, ...scheduled.warnings],
			ended: this.#ended
		};
	}

	snapshot(): SimulatorSnapshot {
		void this.#prng.snapshot();
		return {
			scenarioId: this.scenario.scenarioId,
			tick: this.#state.tick,
			stepCount: this.#stepCount,
			ended: this.#ended,
			state: cloneFacilityState(this.#state),
			events: deepCloneJson(this.#events),
			warnings: deepCloneJson(this.#warnings),
			injectedPayloadIds: [...this.#injectedPayloadIds].sort(),
			scoreFacts: deepCloneJson(this.#scoreFacts)
		};
	}

	eventLog(): SimulatorEvent[] {
		return deepCloneJson(this.#events);
	}

	#rejectCall(call: SimulatorToolCall, callId: string, code: string, message: string): ToolExecutionResult {
		const warning: SimulatorWarning = { code, message, toolId: call.toolId };
		const observation = rejectedObservation(callId, this.#state.tick, message);
		const event: SimulatorEvent = {
			eventId: `rejected.${callId}`,
			kind: "warning",
			tick: this.#state.tick,
			ok: false,
			summary: "tool call rejected",
			toolCallId: callId,
			toolId: call.toolId,
			observation,
			deltas: [],
			warnings: [warning],
			payloadIds: []
		};
		this.#events.push(event);
		this.#warnings.push(warning);
		return {
			ok: false,
			toolId: call.toolId,
			callId,
			observation,
			state: cloneFacilityState(this.#state),
			deltas: [],
			warnings: [warning],
			payloadIds: [],
			ended: this.#ended
		};
	}
}

export function createSimulator(input: unknown): CoreSimulator {
	const result = ScenarioSchema.safeParse(input);
	if (!result.success) {
		throw new Error(validationErrorMessage(input));
	}
	return new CoreSimulator(result.data);
}
