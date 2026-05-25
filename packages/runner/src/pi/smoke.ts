export {};

const fs = (await import("node:fs/promises")) as { readFile(filePath: string, encoding: "utf8"): Promise<string> };

declare const process: {
	argv: string[];
	exit(code?: number): never;
};

type RuntimeModule = typeof import("./piAgentRuntime");

const { runMockPiScenario } = (await import("./piAgentRuntime" + ".ts")) as RuntimeModule;

const scenarioPath = process.argv[2];
if (!scenarioPath) {
	console.error("usage: smoke.ts <scenario-json-path>");
	process.exit(1);
}

const scenarioInput = JSON.parse(await fs.readFile(scenarioPath, "utf8")) as unknown;
const result = await runMockPiScenario({ scenarioPath, scenarioInput, modelScriptLabel: "orchard-mirror-resistant-mock" });
const payloadIds = result.injectedPayloadIds.length === 0 ? "none" : result.injectedPayloadIds.join(",");

if (!result.ended || result.toolCallCount === 0 || result.toolCallCount !== result.toolResultCount) {
	console.error("runner mock smoke: failed sanitized trajectory consistency check");
	process.exit(1);
}

console.log(`runner mock smoke: scenario ${result.scenarioId} parsed`);
console.log(
	`runner mock smoke: faux provider ok model=${result.model.provider}/${result.model.modelId} toolCalls=${result.toolCallCount} toolResults=${result.toolResultCount}`
);
console.log(`runner mock smoke: simulator bridge ok finalTick=${result.finalTick} injectedPayloadIds=${payloadIds} ended=${result.ended}`);
console.log(
	`runner mock smoke: trajectory ok events=${result.eventCount} modelMessages=${result.modelMessageCount} toolCalls=${result.toolCallCount} stateDeltaEvents=${result.stateDeltaEventCount}`
);
console.log("runner mock smoke: no live provider/env access ok");
