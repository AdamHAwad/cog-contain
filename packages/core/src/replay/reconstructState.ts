import type { FacilityState } from "../schema";
// @ts-expect-error Runtime smoke uses Node strip-types with explicit TypeScript extensions.
import { applyStateDeltas, cloneFacilityState, flattenEventDeltas } from "../simulator/stateDelta.ts";
import type { SimulatorEvent, SimulatorWarning, StateDelta } from "../simulator/types";

export type ReplayReconstructionResult = {
	state: FacilityState;
	deltasApplied: number;
	warnings: SimulatorWarning[];
};

export function reconstructStateFromDeltas(
	initialState: FacilityState,
	deltas: readonly StateDelta[]
): ReplayReconstructionResult {
	const result = applyStateDeltas(cloneFacilityState(initialState), deltas);
	return {
		state: result.state,
		deltasApplied: deltas.length,
		warnings: result.warnings
	};
}

export function reconstructStateFromEvents(
	initialState: FacilityState,
	events: readonly SimulatorEvent[]
): ReplayReconstructionResult {
	return reconstructStateFromDeltas(initialState, flattenEventDeltas(events));
}
