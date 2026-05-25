// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-51-public-dev-v0-4-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0017_directive_slate",
	"cog_dev_0018_copper_flood",
	"cog_dev_0019_lantern_gauge",
	"cog_dev_0020_turnstile_halo"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.4.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.4.0-draft"
	});
	console.log(`public-dev v0.4.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.4.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
