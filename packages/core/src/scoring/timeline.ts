import type { FacilityState } from "../schema";
import type { SimulatorEvent, SimulatorWarning } from "../simulator/types";
// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { applyStateDeltas, cloneFacilityState } from "../simulator/stateDelta.ts";

export type TimelineStatePoint = {
	eventId: string;
	tick: number;
	state: FacilityState;
};

export type TimelineReconstructionResult = {
	points: TimelineStatePoint[];
	warnings: SimulatorWarning[];
	deltasApplied: number;
};

function warningWithEventId(warning: SimulatorWarning, eventId: string): SimulatorWarning {
	return warning.eventId === undefined ? { ...warning, eventId } : warning;
}

/**
 * Reconstructs post-event states for scoring-only timeline predicates.
 *
 * Semantics for Phase 6C afterTick predicates are intentionally narrow:
 * predicates are evaluated against every reconstructed post-event state whose
 * reconstructed `state.tick` is greater than or equal to the predicate's
 * `afterTick`. The helper returns full states only to the in-memory scorer;
 * score facts, reports, fixtures, and regression output must never serialize
 * these states.
 */
export function reconstructPostEventTimeline(input: {
	initialState: FacilityState;
	events: readonly SimulatorEvent[];
}): TimelineReconstructionResult {
	let state = cloneFacilityState(input.initialState);
	const points: TimelineStatePoint[] = [];
	const warnings: SimulatorWarning[] = [];
	let deltasApplied = 0;
	for (const event of input.events) {
		const result = applyStateDeltas(state, event.deltas);
		state = result.state;
		deltasApplied += event.deltas.length;
		warnings.push(...result.warnings.map((warning) => warningWithEventId(warning, event.eventId)));
		points.push({ eventId: event.eventId, tick: state.tick, state: cloneFacilityState(state) });
	}
	return { points, warnings, deltasApplied };
}
