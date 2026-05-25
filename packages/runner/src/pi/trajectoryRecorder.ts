import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { RunnerToolResultDetails, RunnerTrajectoryEvent } from "../types";

function textBlockCount(content: unknown): number {
	if (typeof content === "string") return 1;
	if (!Array.isArray(content)) return 0;
	return content.filter((block) => typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text").length;
}

function messageRole(message: unknown): string | undefined {
	return typeof message === "object" && message !== null && typeof (message as { role?: unknown }).role === "string"
		? (message as { role: string }).role
		: undefined;
}

function isAssistantMessage(message: unknown): boolean {
	return messageRole(message) === "assistant";
}

function messageContent(message: unknown): unknown {
	return typeof message === "object" && message !== null ? (message as { content?: unknown }).content : undefined;
}

function argumentKeys(args: unknown): string[] {
	if (typeof args !== "object" || args === null || Array.isArray(args)) return [];
	return Object.keys(args as Record<string, unknown>).sort();
}

function isDetails(value: unknown): value is RunnerToolResultDetails {
	if (typeof value !== "object" || value === null) return false;
	const details = value as Partial<RunnerToolResultDetails>;
	return typeof details.toolId === "string" && typeof details.ok === "boolean" && typeof details.deltaCount === "number";
}

function resultDetails(result: unknown): RunnerToolResultDetails | undefined {
	if (typeof result !== "object" || result === null) return undefined;
	const details = (result as { details?: unknown }).details;
	return isDetails(details) ? details : undefined;
}

export class TrajectoryRecorder {
	#events: RunnerTrajectoryEvent[] = [];
	#sequence = 0;

	recordAgentEvent(event: AgentEvent): void {
		if (event.type === "message_end" && isAssistantMessage(event.message)) {
			const maybeStopReason = typeof event.message === "object" && event.message !== null ? (event.message as { stopReason?: unknown }).stopReason : undefined;
			const maybeError = typeof event.message === "object" && event.message !== null ? (event.message as { errorMessage?: unknown }).errorMessage : undefined;
			if (maybeStopReason === "error" || maybeStopReason === "aborted") {
				this.#push({
					kind: "runner_error",
					label: maybeStopReason === "aborted" ? "assistant aborted message" : "assistant error message",
					code: maybeStopReason === "aborted" ? "assistant_aborted" : "assistant_error",
					message: typeof maybeError === "string" ? maybeError : `assistant message ended with ${maybeStopReason}`
				});
				return;
			}
			this.#push({
				kind: "model_message",
				label: "assistant message ended",
				role: "assistant",
				textBlockCount: textBlockCount(messageContent(event.message))
			});
			return;
		}

		if (event.type === "tool_execution_start") {
			this.#push({
				kind: "tool_call",
				label: "tool execution started",
				toolCallId: event.toolCallId,
				toolId: event.toolName,
				argumentKeys: argumentKeys(event.args)
			});
			return;
		}

		if (event.type === "tool_execution_end") {
			const details = resultDetails(event.result);
			this.#push({
				kind: "tool_result",
				label: "tool execution ended",
				toolCallId: event.toolCallId,
				toolId: event.toolName,
				ok: !event.isError && (details?.ok ?? true),
				warningCodes: details?.warningCodes ?? [],
				deltaCount: details?.deltaCount ?? 0,
				payloadIds: details?.payloadIds ?? [],
				...(details?.finalTick === undefined ? {} : { finalTick: details.finalTick }),
				...(details?.ended === undefined ? {} : { ended: details.ended })
			});
			if ((details?.deltaCount ?? 0) > 0) {
				this.#push({
					kind: "state_delta",
					label: "simulator state delta summary",
					toolCallId: event.toolCallId,
					toolId: event.toolName,
					deltaCount: details?.deltaCount ?? 0,
					deltaPaths: details?.deltaPaths ?? []
				});
			}
			return;
		}
	}

	getEvents(): RunnerTrajectoryEvent[] {
		return JSON.parse(JSON.stringify(this.#events)) as RunnerTrajectoryEvent[];
	}

	#push(event: Omit<RunnerTrajectoryEvent, "sequence">): void {
		this.#sequence += 1;
		this.#events.push({ sequence: this.#sequence, ...event });
	}
}

export function summarizeTrajectoryEvents(events: readonly RunnerTrajectoryEvent[]) {
	return {
		eventCount: events.length,
		modelMessageCount: events.filter((event) => event.kind === "model_message").length,
		toolCallCount: events.filter((event) => event.kind === "tool_call").length,
		toolResultCount: events.filter((event) => event.kind === "tool_result").length,
		stateDeltaEventCount: events.filter((event) => event.kind === "state_delta").length
	};
}
