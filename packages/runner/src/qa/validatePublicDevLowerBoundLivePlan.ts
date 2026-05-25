import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PLAN_PATH = "artifacts/run-plans/phase-57-public-dev-lower-bound-live-qa-plan/plan.json";
const PRIVATE_SENTINEL_PATH = '.pi/goal-agent-prompts/goal-build-cog-contain-v1-according-to-cog-contain-benchmark-spec-and/cancel-live-image-generation';
const PUBLIC_SENTINEL_PATH = 'docs/qa/no-live-public-sentinel.md';

function hasNoLiveSentinel(): boolean {
	return existsSync(join(ROOT, PRIVATE_SENTINEL_PATH)) || existsSync(join(ROOT, PUBLIC_SENTINEL_PATH));
}
const PACKS = ["v0.1.0", "v0.2.0-draft", "v0.3.0-draft", "v0.4.0-draft", "v0.5.0-draft", "v0.6.0-draft", "v0.7.0-draft", "v0.8.0-draft", "v0.9.0-draft"] as const;
const CLASS_LABELS = ["protocol_documentation", "sensor_camera_evidence", "personnel_authority_comms", "route_evacuation_access", "power_ventilation_infrastructure", "resource_drone_operations"] as const;

declare const process: { cwd(): string; exit(code?: number): never };

type Manifest = { version: string; schemaValidated?: boolean; scenarios: { scenarioId: string; path: string; title: string }[] };
type Plan = {
	planId: string;
	status: string;
	sourceLocalPacks: string[];
	sourceLocalScenarioCount: number;
	sourceLocalCleanCount: number;
	sourceLocalAttackedCount: number;
	allScenarioIds: string[];
	futureProviders: { provider: string; modelId: string }[];
	strictCaps: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; retryCount: number; explicitLiveGuardRequired: boolean };
	representativeSubset: { scenarioId: string; title: string; variant: "clean" | "attacked"; classes: string[]; attackFamilyLabels: string[]; futureRunOnly: boolean }[];
	fullLowerBoundRun: { scenarioCount: number; status: string };
	nonClaims: string[];
	t437LimitationsRetained: string[];
};

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

function readText(path: string): string {
	return readFileSync(join(ROOT, path), "utf8");
}

function assertSafeText(path: string, text: string): void {
	assert(!/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|AKIA[0-9A-Z]{16}|xox[baprs]-/u.test(text), `${path} appears to contain a credential-like value`);
	assert(!/OPENAI_API_KEY\s*=|OPENROUTER_API_KEY\s*=|\.env/u.test(text), `${path} includes env assignment/reference`);
	assert(!/raw provider|raw model transcript|raw trajectory|raw tool arguments|raw observations/iu.test(text), `${path} includes forbidden raw-content reference`);
	assert(!/data:image|base64|\.png/iu.test(text), `${path} includes image/base64 reference`);
}

function variantFromTags(tags: string[]): "clean" | "attacked" {
	return tags.includes("clean") || tags.includes("clean-only") ? "clean" : "attacked";
}

function main(): void {
	const plan = readJson<Plan>(PLAN_PATH);
	assert(plan.planId === "phase-57-public-dev-lower-bound-live-qa-plan", "plan id mismatch");
	assert(plan.status === "no_live_dry_run_plan_only", "plan must be no-live dry-run only");
	assert(JSON.stringify(plan.sourceLocalPacks) === JSON.stringify(PACKS), "pack list mismatch");
	assert(hasNoLiveSentinel(), "T407 image cancellation sentinel must remain");

	const discoveredIds: string[] = [];
	let clean = 0;
	let attacked = 0;
	for (const pack of PACKS) {
		const manifest = readJson<Manifest>(`scenario-packs/public-dev/${pack}/manifest.json`);
		assert(manifest.version === (pack === "v0.1.0" ? "0.1.0" : pack.slice(1)), `manifest version mismatch ${pack}`);
		assert(manifest.schemaValidated === true, `manifest is not schema-validating ${pack}`);
		for (const scenario of manifest.scenarios) {
			const path = `scenario-packs/public-dev/${pack}/${scenario.path}`;
			assert(existsSync(join(ROOT, path)), `missing scenario ${path}`);
			const source = readJson<{ scenarioId: string; title: string; tags?: string[]; packVersion: string }>(path);
			assert(source.scenarioId === scenario.scenarioId, `scenario id mismatch ${path}`);
			assert(source.title === scenario.title, `scenario title mismatch ${path}`);
			assert(source.packVersion === (pack === "v0.1.0" ? "0.1.0" : pack.slice(1)), `scenario pack version mismatch ${path}`);
			const variant = variantFromTags(source.tags ?? []);
			if (variant === "clean") clean += 1;
			else attacked += 1;
			discoveredIds.push(scenario.scenarioId);
		}
	}
	assert(discoveredIds.length === 40, `expected 40 scenario ids, got ${discoveredIds.length}`);
	assert(clean === 10 && attacked === 30, `expected 10 clean / 30 attacked, got ${clean} / ${attacked}`);
	assert(JSON.stringify(discoveredIds) === JSON.stringify(plan.allScenarioIds), "plan scenario ids do not match source manifests");
	assert(plan.sourceLocalScenarioCount === 40 && plan.sourceLocalCleanCount === 10 && plan.sourceLocalAttackedCount === 30, "plan corpus counts mismatch");

	assert(plan.futureProviders.length === 2, "expected two future provider paths");
	assert(plan.futureProviders.some((provider) => provider.provider === "openai" && provider.modelId === "gpt-4o-mini"), "missing OpenAI future path");
	assert(plan.futureProviders.some((provider) => provider.provider === "openrouter" && provider.modelId === "anthropic/claude-3.5-haiku"), "missing OpenRouter future path");
	assert(plan.strictCaps.maxSteps <= 3 && plan.strictCaps.maxOutputTokens <= 256 && plan.strictCaps.timeoutMs <= 60000 && plan.strictCaps.retryCount === 0, "future caps are broader than allowed");
	assert(plan.strictCaps.explicitLiveGuardRequired === true, "explicit live guard must be required");

	assert(plan.representativeSubset.length >= 8, "representative subset too small");
	assert(plan.representativeSubset.some((scenario) => scenario.variant === "clean"), "representative subset needs clean scenario");
	assert(plan.representativeSubset.some((scenario) => scenario.variant === "attacked"), "representative subset needs attacked scenario");
	const subsetClasses = new Set(plan.representativeSubset.flatMap((scenario) => scenario.classes));
	for (const label of CLASS_LABELS) assert(subsetClasses.has(label), `representative subset missing class ${label}`);
	assert(plan.representativeSubset.every((scenario) => scenario.futureRunOnly === true), "representative subset must be future-run only");
	assert(plan.fullLowerBoundRun.scenarioCount === 40 && plan.fullLowerBoundRun.status === "future_expensive_not_executed_in_T439", "full lower-bound run status mismatch");

	for (const claim of ["no live calls", "not leaderboard evidence", "not Phase 12 completion", "not scenario V1 completion", "not public release readiness", "not paper readiness", "not full V1 readiness"]) {
		assert(plan.nonClaims.includes(claim), `missing non-claim ${claim}`);
	}
	assert(plan.t437LimitationsRetained.length >= 3, "T437 limitations must remain visible");
	assertSafeText(PLAN_PATH, readText(PLAN_PATH));
	console.log("public-dev lower-bound live QA plan: ok noLive=true scenarios=40 clean=10 attacked=30 providers=2 caps=strict representativeSubset=8 sentinelPresent=true");
}

try {
	main();
} catch (error) {
	console.error(`public-dev lower-bound live QA plan: failed ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
