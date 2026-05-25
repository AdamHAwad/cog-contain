import { createHash } from "node:crypto";
import type { ArtifactTrajectoryEvent, RunnerTrajectoryEvent } from "../types";

export function sortForStableJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => sortForStableJson(item));
	if (typeof value !== "object" || value === null) return value;
	const output: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) {
		const item = (value as Record<string, unknown>)[key];
		if (item !== undefined) output[key] = sortForStableJson(item);
	}
	return output;
}

export function stableJson(value: unknown, space = 0): string {
	return JSON.stringify(sortForStableJson(value), null, space);
}

export function sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

export function sha256StableJson(value: unknown): string {
	return sha256Hex(stableJson(value));
}

function timestampForStep(step: number): string {
	return new Date(Date.UTC(2026, 4, 21, 0, 0, step)).toISOString();
}

function eventTick(event: RunnerTrajectoryEvent, fallbackTick: number): number {
	return typeof event.finalTick === "number" ? event.finalTick : fallbackTick;
}

function eventPayload(event: RunnerTrajectoryEvent): Record<string, unknown> {
	return {
		sequence: event.sequence,
		label: event.label,
		role: event.role,
		textBlockCount: event.textBlockCount,
		toolCallId: event.toolCallId,
		toolId: event.toolId,
		argumentKeys: event.argumentKeys,
		ok: event.ok,
		warningCodes: event.warningCodes,
		deltaCount: event.deltaCount,
		deltaPaths: event.deltaPaths,
		payloadIds: event.payloadIds,
		finalTick: event.finalTick,
		ended: event.ended,
		code: event.code,
		message: event.message
	};
}

export function createHashLinkedTrajectoryEvents(input: {
	runId: string;
	events: readonly RunnerTrajectoryEvent[];
}): ArtifactTrajectoryEvent[] {
	let previousEventHash: string | undefined;
	let lastTick = 0;
	return input.events.map((event, index) => {
		const step = index + 1;
		const tick = eventTick(event, lastTick);
		lastTick = tick;
		const payload = eventPayload(event);
		const payloadHash = sha256StableJson(payload);
		const eventBody = {
			eventId: `${input.runId}.event.${String(step).padStart(6, "0")}`,
			runId: input.runId,
			step,
			tick,
			timestamp: timestampForStep(step),
			kind: event.kind,
			payload,
			hashes: {
				...(previousEventHash === undefined ? {} : { previousEventHash }),
				payloadHash
			}
		};
		const eventHash = sha256StableJson(eventBody);
		const linkedEvent: ArtifactTrajectoryEvent = {
			...eventBody,
			hashes: {
				...eventBody.hashes,
				eventHash
			}
		};
		previousEventHash = eventHash;
		return linkedEvent;
	});
}
