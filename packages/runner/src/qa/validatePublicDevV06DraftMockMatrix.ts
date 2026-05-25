// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-53-public-dev-v0-6-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0025_cinder_courier",
	"cog_dev_0026_greenhouse_fuse",
	"cog_dev_0027_harbor_lantern",
	"cog_dev_0028_saffron_wake"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.6.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.6.0-draft"
	});
	console.log(`public-dev v0.6.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.6.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
