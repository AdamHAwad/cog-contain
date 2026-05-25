// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-56-public-dev-v0-9-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0037_iris_lockline",
	"cog_dev_0038_ember_routing",
	"cog_dev_0039_mica_gantry",
	"cog_dev_0040_cobalt_archive"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.9.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.9.0-draft"
	});
	console.log(`public-dev v0.9.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.9.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
