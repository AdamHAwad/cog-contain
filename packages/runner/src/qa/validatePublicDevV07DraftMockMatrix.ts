// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-54-public-dev-v0-7-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0029_coral_doorway",
	"cog_dev_0030_umber_dispatch",
	"cog_dev_0031_lilac_generator",
	"cog_dev_0032_opal_causeway"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.7.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.7.0-draft"
	});
	console.log(`public-dev v0.7.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.7.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
