import type { FacilityState, Scenario } from "../schema";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { cloneFacilityState, setPathWithDelta } from "./stateDelta.ts";
import type { SimulatorEvent, SimulatorWarning, StateDelta } from "./types";

type ScheduledScenarioEvent = Scenario["private"]["eventSchedule"][number];

export type ScheduledEventApplication = {
	state: FacilityState;
	events: SimulatorEvent[];
	deltas: StateDelta[];
	warnings: SimulatorWarning[];
	appliedEventIds: Set<string>;
};

function effectField(effect: Record<string, unknown>, key: string): unknown {
	return effect[key];
}

function scheduledWarning(code: string, message: string, eventId: string): SimulatorWarning {
	return { code, message, eventId };
}

function eventSortKey(event: ScheduledScenarioEvent): string {
	return `${String(event.tick).padStart(12, "0")}:${event.eventId}`;
}

export function applyDueScheduledEvents(input: {
	scenario: Scenario;
	state: FacilityState;
	appliedEventIds: ReadonlySet<string>;
}): ScheduledEventApplication {
	let state = cloneFacilityState(input.state);
	const appliedEventIds = new Set(input.appliedEventIds);
	const events: SimulatorEvent[] = [];
	const warnings: SimulatorWarning[] = [];
	const deltas: StateDelta[] = [];
	const dueEvents = input.scenario.private.eventSchedule
		.filter((event) => event.tick <= state.tick && !appliedEventIds.has(event.eventId))
		.sort((left, right) => eventSortKey(left).localeCompare(eventSortKey(right)));

	for (const scheduledEvent of dueEvents) {
		const result = applyScheduledEvent(input.scenario, state, scheduledEvent);
		state = result.state;
		appliedEventIds.add(scheduledEvent.eventId);
		deltas.push(...result.deltas);
		warnings.push(...result.warnings);
		events.push({
			eventId: `scheduled.${scheduledEvent.eventId}`,
			kind: "scheduled_event",
			tick: state.tick,
			ok: result.ok,
			summary: result.summary,
			deltas: result.deltas,
			warnings: result.warnings,
			payloadIds: []
		});
	}

	return { state, events, deltas, warnings, appliedEventIds };
}

function applyScheduledEvent(
	_scenario: Scenario,
	inputState: FacilityState,
	scheduledEvent: ScheduledScenarioEvent
): { state: FacilityState; deltas: StateDelta[]; warnings: SimulatorWarning[]; ok: boolean; summary: string } {
	const state = cloneFacilityState(inputState);
	const deltas: StateDelta[] = [];
	const warnings: SimulatorWarning[] = [];
	const effect = scheduledEvent.effect as Record<string, unknown>;
	const kind = effectField(effect, "kind");

	if (kind !== "increaseHazardIfRelayActive") {
		const warning = scheduledWarning(
			"unsupported_scheduled_event",
			"Unsupported scheduled event kind skipped by foundation simulator",
			scheduledEvent.eventId
		);
		warnings.push(warning);
		return { state, deltas, warnings, ok: false, summary: "unsupported scheduled event skipped" };
	}

	const zoneId = effectField(effect, "zoneId");
	const amount = effectField(effect, "amount");
	if (typeof zoneId !== "string" || typeof amount !== "number") {
		warnings.push(scheduledWarning("malformed_scheduled_event", "Scheduled event fields were malformed", scheduledEvent.eventId));
		return { state, deltas, warnings, ok: false, summary: "malformed scheduled event skipped" };
	}

	const zone = state.zones[zoneId];
	if (zone === undefined) {
		warnings.push(scheduledWarning("scheduled_event_missing_zone", "Scheduled event referenced an unknown zone", scheduledEvent.eventId));
		return { state, deltas, warnings, ok: false, summary: "scheduled event referenced unknown zone" };
	}

	if (state.flags["displayRelayCut"] === true) {
		warnings.push(scheduledWarning("scheduled_event_noop_relay_cut", "Scheduled event made no state change because display relay was cut", scheduledEvent.eventId));
		return { state, deltas, warnings, ok: true, summary: "scheduled event no-op because relay was cut" };
	}

	const nextHazard = Math.min(5, Math.max(0, zone.hazardLevel + amount));
	if (nextHazard !== zone.hazardLevel) {
		deltas.push(
			setPathWithDelta(state, ["zones", zoneId, "hazardLevel"], nextHazard, "scheduled event increased hazard", {
				eventId: scheduledEvent.eventId
			})
		);
	}

	return { state, deltas, warnings, ok: true, summary: "scheduled event applied" };
}
