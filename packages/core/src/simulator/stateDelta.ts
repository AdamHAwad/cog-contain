import type { FacilityState } from "../schema";
import type { DeltaValue, JsonValue, PathSegment, StateDelta, SimulatorWarning } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepCloneJson<T>(value: T): T {
	if (value === undefined) return value;
	return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneFacilityState(state: FacilityState): FacilityState {
	return deepCloneJson(state);
}

function toJsonValue(value: unknown): JsonValue {
	return deepCloneJson(value) as JsonValue;
}

export function toDeltaValue(value: unknown): DeltaValue {
	return value === undefined ? { exists: false } : { exists: true, value: toJsonValue(value) };
}

export function readPath(target: unknown, path: readonly PathSegment[]): unknown {
	let current = target;
	for (const segment of path) {
		if (current === undefined || current === null) return undefined;
		if (Array.isArray(current) && typeof segment === "number") {
			current = current[segment];
			continue;
		}
		if (!isRecord(current)) return undefined;
		current = current[String(segment)];
	}
	return current;
}

function writePathMutable(target: unknown, path: readonly PathSegment[], value: DeltaValue): void {
	if (path.length === 0) throw new Error("cannot write empty state path");
	let current = target;
	for (const segment of path.slice(0, -1)) {
		if (current === undefined || current === null) throw new Error(`cannot write through missing segment ${String(segment)}`);
		if (Array.isArray(current) && typeof segment === "number") {
			current = current[segment];
			continue;
		}
		if (!isRecord(current)) throw new Error(`cannot write through non-object segment ${String(segment)}`);
		current = current[String(segment)];
	}
	const finalSegment = path[path.length - 1]!;
	if (Array.isArray(current) && typeof finalSegment === "number") {
		if (value.exists) current[finalSegment] = deepCloneJson(value.value);
		else current.splice(finalSegment, 1);
		return;
	}
	if (!isRecord(current)) throw new Error(`cannot write final segment ${String(finalSegment)} on non-object`);
	if (value.exists) current[String(finalSegment)] = deepCloneJson(value.value);
	else delete current[String(finalSegment)];
}

export function makeStateDelta(
	state: FacilityState,
	path: PathSegment[],
	after: DeltaValue,
	reason: string,
	metadata: { toolCallId?: string; eventId?: string } = {}
): StateDelta {
	return {
		path,
		before: toDeltaValue(readPath(state, path)),
		after,
		reason,
		...(metadata.toolCallId === undefined ? {} : { toolCallId: metadata.toolCallId }),
		...(metadata.eventId === undefined ? {} : { eventId: metadata.eventId })
	};
}

export function setPathWithDelta(
	state: FacilityState,
	path: PathSegment[],
	value: JsonValue,
	reason: string,
	metadata: { toolCallId?: string; eventId?: string } = {}
): StateDelta {
	const delta = makeStateDelta(state, path, { exists: true, value }, reason, metadata);
	writePathMutable(state, path, delta.after);
	return delta;
}

function deltaValueMatchesCurrent(deltaValue: DeltaValue, current: unknown): boolean {
	if (!deltaValue.exists) return current === undefined;
	return stableStringify(deltaValue.value) === stableStringify(toJsonValue(current));
}

export function applyStateDelta<T>(target: T, delta: StateDelta): { state: T; warnings: SimulatorWarning[] } {
	const state = deepCloneJson(target);
	const current = readPath(state, delta.path);
	const warnings: SimulatorWarning[] = [];
	if (!deltaValueMatchesCurrent(delta.before, current)) {
		warnings.push({
			code: "replay_before_mismatch",
			message: "Replay delta before-value did not match current state",
			path: [...delta.path],
			...(delta.eventId === undefined ? {} : { eventId: delta.eventId })
		});
	}
	writePathMutable(state, delta.path, delta.after);
	return { state, warnings };
}

export function applyStateDeltas<T>(target: T, deltas: readonly StateDelta[]): { state: T; warnings: SimulatorWarning[] } {
	let state = deepCloneJson(target);
	const warnings: SimulatorWarning[] = [];
	for (const delta of deltas) {
		const result = applyStateDelta(state, delta);
		state = result.state;
		warnings.push(...result.warnings);
	}
	return { state, warnings };
}

export function flattenEventDeltas(events: readonly { deltas: StateDelta[] }[]): StateDelta[] {
	return events.flatMap((event) => event.deltas);
}

export function stableStringify(value: unknown): string {
	return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => sortForStableStringify(item));
	if (!isRecord(value)) return value;
	const output: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) {
		output[key] = sortForStableStringify(value[key]);
	}
	return output;
}
