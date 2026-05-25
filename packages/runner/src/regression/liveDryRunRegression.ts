export {};

import { readFile } from "node:fs/promises";

// @ts-expect-error Runtime regression uses Node strip-types with explicit TypeScript extensions.
import { runLiveDryRunConfig } from "../adapters/liveConfig.ts";
import type { LiveDryRunResult } from "../types";

declare const process: {
	argv: string[];
	exit(code?: number): never;
};

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function assertSafe(result: LiveDryRunResult): void {
	assert(result.validated === true, "dry-run result was not validated");
	assert(result.safety.liveProviderCall === false, "dry-run made provider call");
	assert(result.safety.envRead === false, "dry-run read env");
	assert(result.safety.keyPresenceChecked === false, "dry-run checked key presence");
	assert(result.safety.agentPromptCalled === false, "dry-run called agent prompt");
	assert(result.safety.providerStreamCalled === false, "dry-run called provider stream");
	assert(result.safety.directProviderSdk === false, "dry-run used direct provider sdk");
}

async function expectFailure(label: string, fn: () => Promise<unknown>): Promise<string> {
	try {
		await fn();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error(`${label} unexpectedly succeeded`);
}

export async function runLiveDryRunRegression(scenarioPath: string): Promise<{
	openai: LiveDryRunResult;
	openrouter: LiveDryRunResult;
	invalidProviderMessage: string;
	invalidModelMessage: string;
}> {
	const scenarioInput = JSON.parse(await readFile(scenarioPath, "utf8")) as unknown;
	const openai = await runLiveDryRunConfig({
		scenarioPath,
		scenarioInput,
		provider: "openai",
		modelId: "gpt-4o-mini",
		maxSteps: 3,
		maxOutputTokens: 256
	});
	const openrouter = await runLiveDryRunConfig({
		scenarioPath,
		scenarioInput,
		provider: "openrouter",
		modelId: "openai/gpt-4o-mini",
		maxSteps: 3,
		maxOutputTokens: 256
	});
	assertSafe(openai);
	assertSafe(openrouter);
	const invalidProviderMessage = await expectFailure("invalid provider", () =>
		runLiveDryRunConfig({ scenarioPath, scenarioInput, provider: "invalid-provider", modelId: "gpt-4o-mini", maxSteps: 3 })
	);
	const invalidModelMessage = await expectFailure("invalid model", () =>
		runLiveDryRunConfig({ scenarioPath, scenarioInput, provider: "openai", modelId: "invalid-model", maxSteps: 3 })
	);
	return { openai, openrouter, invalidProviderMessage, invalidModelMessage };
}

async function main(argv: string[]): Promise<void> {
	const scenarioPath = argv[0];
	if (!scenarioPath) throw new Error("usage: liveDryRunRegression.ts <scenario-json-path>");
	const report = await runLiveDryRunRegression(scenarioPath);
	console.log(`runner live dry-run regression: scenario ${report.openai.scenarioId} parsed`);
	console.log(
		`runner live dry-run regression: openai candidate ok model=${report.openai.model.modelId} api=${report.openai.model.piApi} liveProviderCall=${report.openai.safety.liveProviderCall} envRead=${report.openai.safety.envRead} keyPresenceChecked=${report.openai.safety.keyPresenceChecked}`
	);
	console.log(
		`runner live dry-run regression: openrouter candidate ok model=${report.openrouter.model.modelId} api=${report.openrouter.model.piApi} liveProviderCall=${report.openrouter.safety.liveProviderCall} envRead=${report.openrouter.safety.envRead} keyPresenceChecked=${report.openrouter.safety.keyPresenceChecked}`
	);
	console.log(`runner live dry-run regression: invalid provider rejected message=${report.invalidProviderMessage}`);
	console.log(`runner live dry-run regression: invalid model rejected message=${report.invalidModelMessage}`);
	console.log("runner live dry-run regression: fail-closed checks ok");
}

if (process.argv[1]?.endsWith("liveDryRunRegression.ts")) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(`runner live dry-run regression: failed ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
