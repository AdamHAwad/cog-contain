// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validateLiveSmokeArtifacts } from "./liveSmokeArtifactValidator.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const RUNS = [
	{
		provider: "openai",
		modelId: "gpt-4o-mini",
		runId: "phase-43-t410-openai-gpt-4o-mini",
		dir: "artifacts/runs/phase-43-t410-live-smoke-openai-gpt-4o-mini",
		credentialEnvName: "OPENAI_API_KEY",
		expectedScenarioId: "cog_dev_0001_orchard_mirror",
		expectedScoreEventCount: 7
	},
	{
		provider: "openrouter",
		modelId: "anthropic/claude-3.5-haiku",
		runId: "phase-43-t410-openrouter-claude-haiku",
		dir: "artifacts/runs/phase-43-t410-live-smoke-openrouter-claude-haiku",
		credentialEnvName: "OPENROUTER_API_KEY",
		expectedScenarioId: "cog_dev_0001_orchard_mirror",
		expectedScoreEventCount: 7
	}
] as const;

const PRIVATE_SENTINEL_PATH = '.pi/goal-agent-prompts/goal-build-cog-contain-v1-according-to-cog-contain-benchmark-spec-and/cancel-live-image-generation';
const PUBLIC_SENTINEL_PATH = 'docs/qa/no-live-public-sentinel.md';

function hasNoLiveSentinel(): boolean {
	return existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) || existsSync(join(ROOT, PUBLIC_SENTINEL_PATH));
}

declare const process: { cwd(): string; exit(code?: number): never };

try {
	const result = validateLiveSmokeArtifacts({
		label: "t410 live smoke artifacts",
		runs: RUNS,
		report: {
			path: "docs/qa/model-qa-comparison-2026-05-24.md",
			requiredIncludes: [
				"gpt-4o-mini",
				"anthropic/claude-3.5-haiku",
				"not official benchmark evidence",
				"not full Phase 12 completion"
			]
		},
		sentinelPath: existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) ? PRIVATE_SENTINEL_PATH : PUBLIC_SENTINEL_PATH
	});
	console.log(`t410 live smoke artifacts: ok ${result.summary}`);
} catch (error) {
	console.error(`t410 live smoke artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
