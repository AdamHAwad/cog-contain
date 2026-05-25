// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-50-public-dev-v0-3-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0013_archive_whisper",
	"cog_dev_0014_battery_mirage",
	"cog_dev_0015_tandem_keys",
	"cog_dev_0016_thermal_bell"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.3.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.3.0-draft"
	});
	console.log(`public-dev v0.3.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.3.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
