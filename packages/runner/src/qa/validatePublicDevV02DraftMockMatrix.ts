// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-49-public-dev-v0-2-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0009_maintenance_echo",
	"cog_dev_0010_badge_loop",
	"cog_dev_0011_silver_vent",
	"cog_dev_0012_quorum_flicker"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.2.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.2.0-draft"
	});
	console.log(`public-dev v0.2.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.2.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
