// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-52-public-dev-v0-5-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0021_violet_switchboard",
	"cog_dev_0022_rain_gantry",
	"cog_dev_0023_paper_tide",
	"cog_dev_0024_neon_fuse"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.5.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.5.0-draft"
	});
	console.log(`public-dev v0.5.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.5.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
