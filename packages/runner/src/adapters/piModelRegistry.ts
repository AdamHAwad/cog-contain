import { getModel, getModels, getProviders } from "@earendil-works/pi-ai";
import type { LiveDryRunProviderId } from "../types";

type RegistryModel = {
	id: string;
	name?: string;
	api: string;
	provider: string;
	baseUrl: string;
	reasoning: boolean;
	input: string[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
};

export function isLiveDryRunProviderId(value: string): value is LiveDryRunProviderId {
	return value === "openai" || value === "openrouter";
}

export function listRegistryProviders(): string[] {
	return getProviders().map(String).sort();
}

export function listRegistryModelIds(provider: LiveDryRunProviderId): string[] {
	return getModels(provider as never)
		.map((model) => String(model.id))
		.sort();
}

export function getRegistryModel(provider: LiveDryRunProviderId, modelId: string): RegistryModel | undefined {
	if (!listRegistryProviders().includes(provider)) return undefined;
	if (!listRegistryModelIds(provider).includes(modelId)) return undefined;
	const model = getModel(provider as never, modelId as never) as unknown as RegistryModel | undefined;
	return model;
}
