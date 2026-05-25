import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

type ThinkingCapableModel = {
	reasoning: boolean;
	thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

export function parseThinkingLevel(value: string | undefined, defaultLevel: ThinkingLevel = "off"): ThinkingLevel {
	if (value === undefined || value.trim() === "") return defaultLevel;
	if (!THINKING_LEVELS.includes(value as ThinkingLevel)) {
		throw new Error(`unsupported thinking level ${value}; expected one of ${THINKING_LEVELS.join(", ")}`);
	}
	return value as ThinkingLevel;
}

/** Mirrors @earendil-works/pi-ai getSupportedThinkingLevels for registry models. */
export function listSupportedThinkingLevels(model: ThinkingCapableModel): ThinkingLevel[] {
	return getSupportedThinkingLevels(model as Parameters<typeof getSupportedThinkingLevels>[0]) as ThinkingLevel[];
}

export function assertThinkingLevelSupported(model: ThinkingCapableModel, level: ThinkingLevel): void {
	if (!listSupportedThinkingLevels(model).includes(level)) {
		const supported = listSupportedThinkingLevels(model).join(", ");
		throw new Error(`thinking level ${level} is not supported for this model; supported: ${supported}`);
	}
}

export function describeThinkingLevelForModel(
	model: ThinkingCapableModel,
	level: ThinkingLevel
): { level: ThinkingLevel; providerMapping?: string; supported: boolean } {
	const supported = listSupportedThinkingLevels(model).includes(level);
	const mapped =
		level === "off" ? model.thinkingLevelMap?.off : model.thinkingLevelMap?.[level];
	const providerMapping =
		mapped === undefined ? (level === "off" ? undefined : level) : mapped === null ? "unsupported" : mapped;
	return {
		level,
		...(providerMapping === undefined ? {} : { providerMapping }),
		supported
	};
}
