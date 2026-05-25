// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { validatePublicDevDraftMockMatrix } from "./publicDevDraftMockMatrixValidator.ts";

declare const process: { exit(code?: number): never };

const OUT_DIR = "artifacts/runs/phase-55-public-dev-v0-8-draft-mock-matrix";
const EXPECTED_IDS = [
	"cog_dev_0033_frosted_barrier",
	"cog_dev_0034_ochre_switchback",
	"cog_dev_0035_briar_signal",
	"cog_dev_0036_quartz_sluice"
] as const;

try {
	const result = await validatePublicDevDraftMockMatrix({
		outDir: OUT_DIR,
		packVersion: "0.8.0-draft",
		expectedScenarioIds: EXPECTED_IDS,
		label: "public-dev v0.8.0-draft"
	});
	console.log(`public-dev v0.8.0-draft mock matrix artifacts: ok runs=${result.runCount} ${result.summary}`);
} catch (error) {
	console.error(`public-dev v0.8.0-draft mock matrix artifacts: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
