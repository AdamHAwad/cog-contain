import type { LiveDryRunConfig, LiveDryRunModelConfig, LiveDryRunProviderId, LiveDryRunResult } from "../types";
// @ts-expect-error Runtime CLI uses Node strip-types with explicit TypeScript extensions.
import { getRegistryModel, isLiveDryRunProviderId } from "./piModelRegistry.ts";

type SafeParseIssue = { path: (string | number | symbol)[] };

type ScenarioLike = {
	scenarioId: string;
	public: { availableTools: string[] };
};

type ScenarioSchemaModule = {
	ScenarioSchema: {
		safeParse(input: unknown):
			| { success: true; data: ScenarioLike }
			| { success: false; error: { issues: SafeParseIssue[] } };
	};
};

const CREDENTIAL_ENV_NAMES: Record<LiveDryRunProviderId, string> = {
	openai: "OPENAI_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	anthropic: "ANTHROPIC_API_KEY"
};

async function loadScenarioSchemaModule(): Promise<ScenarioSchemaModule> {
	return (await import(new URL("../../../core/src/schema/scenario.ts", import.meta.url).href)) as ScenarioSchemaModule;
}

function parseHost(baseUrl: string): string {
	try {
		return new URL(baseUrl).hostname;
	} catch {
		return "unknown-host";
	}
}

function assertPositiveInteger(value: number, label: string): void {
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}

function assertOptionalPositiveInteger(value: number | undefined, label: string): void {
	if (value !== undefined) assertPositiveInteger(value, label);
}

async function parseScenario(input: unknown): Promise<ScenarioLike> {
	const { ScenarioSchema } = await loadScenarioSchemaModule();
	const result = ScenarioSchema.safeParse(input);
	if (!result.success) {
		const issuePaths = result.error.issues.slice(0, 6).map((issue) => (issue.path.length === 0 ? "<root>" : issue.path.join(".")));
		throw new Error(`scenario validation failed at ${issuePaths.join(",")}`);
	}
	return result.data;
}

export function validateLiveDryRunModel(providerInput: string, modelId: string): LiveDryRunModelConfig {
	if (!isLiveDryRunProviderId(providerInput)) {
		throw new Error(`unsupported provider ${providerInput}`);
	}
	const model = getRegistryModel(providerInput, modelId);
	if (model === undefined) {
		throw new Error(`unsupported model ${modelId} for provider ${providerInput}`);
	}
	return {
		mode: "live-dry-run",
		provider: providerInput,
		modelId: model.id,
		displayName: model.name ?? model.id,
		piApi: model.api,
		reasoning: model.reasoning,
		inputModalities: [...model.input],
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		costPerMillionTokens: { ...model.cost },
		baseUrlHost: parseHost(model.baseUrl),
		credentialEnvName: CREDENTIAL_ENV_NAMES[providerInput]
	};
}

export async function runLiveDryRunConfig(config: LiveDryRunConfig): Promise<LiveDryRunResult> {
	assertPositiveInteger(config.maxSteps, "maxSteps");
	assertOptionalPositiveInteger(config.maxOutputTokens, "maxOutputTokens");
	assertOptionalPositiveInteger(config.timeoutMs, "timeoutMs");
	if (config.retryCount !== undefined && (!Number.isInteger(config.retryCount) || config.retryCount < 0)) {
		throw new Error("retryCount must be a non-negative integer");
	}
	const scenario = await parseScenario(config.scenarioInput);
	const model = validateLiveDryRunModel(config.provider, config.modelId);
	return {
		scenarioId: scenario.scenarioId,
		mode: "live-dry-run",
		validated: true,
		model,
		plannedCaps: {
			maxSteps: config.maxSteps,
			...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
			...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
			...(config.retryCount === undefined ? {} : { retryCount: config.retryCount })
		},
		plannedToolCount: scenario.public.availableTools.length,
		safety: {
			envRead: false,
			keyPresenceChecked: false,
			liveProviderCall: false,
			agentPromptCalled: false,
			providerStreamCalled: false,
			directProviderSdk: false
		}
	};
}
