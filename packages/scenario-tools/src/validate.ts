// @ts-expect-error Node built-in types are intentionally not added in this slice.
const fs = (await import("node:fs/promises")) as {
	readFile(filePath: string, encoding: "utf8"): Promise<string>;
};
// @ts-expect-error Node built-in types are intentionally not added in this slice.
const path = (await import("node:path")) as {
	join(...segments: string[]): string;
};

declare const process: {
	argv: string[];
	cwd(): string;
	exit(code?: number): never;
	exitCode?: number;
};

type SafeParseIssue = { path: (string | number | symbol)[]; message: string };

type SafeParseResult =
	| { success: true; data: ScenarioLike }
	| { success: false; error: { issues: SafeParseIssue[] } };

type ScenarioSchemaModule = {
	ScenarioSchema: {
		safeParse(input: unknown): SafeParseResult;
	};
};

type ScenarioLike = {
	scenarioId: string;
	packId: string;
	packVersion: string;
	visibility: string;
	public: { maxSteps: number; [key: string]: unknown };
	private: unknown;
	[key: string]: unknown;
};

type ManifestScenarioEntry =
	| string
	| {
			scenarioId: string;
			path: string;
			title?: string;
			schemaVersion?: string;
			visibility?: string;
	  };

type ScenarioPackManifest = {
	id: string;
	version: string;
	name?: string;
	status?: string;
	validated?: boolean;
	schemaValidated?: boolean;
	official?: boolean;
	hidden?: boolean;
	scenarioCount: number;
	scenarios: ManifestScenarioEntry[];
};

export type ValidationIssueSummary = {
	path: string;
	message: string;
};

export type ScenarioObjectValidationOptions = {
	expectedPackId?: string | undefined;
	expectedPackVersion?: string | undefined;
	requirePublicDev?: boolean | undefined;
	requirePublicExample?: boolean | undefined;
	expectedScenarioId?: string | undefined;
};

export type ScenarioObjectValidationResult = {
	ok: boolean;
	scenarioId?: string | undefined;
	issues: ValidationIssueSummary[];
};

export type ScenarioPackValidationResult = {
	ok: boolean;
	packId?: string | undefined;
	packVersion?: string | undefined;
	scenarioCount: number;
	validatedScenarioIds: string[];
	issues: ValidationIssueSummary[];
};

let scenarioModulePromise: Promise<ScenarioSchemaModule> | undefined;

async function loadScenarioModule(): Promise<ScenarioSchemaModule> {
	const corePackageName = "@cog-contain/core";
	scenarioModulePromise ??= import(corePackageName)
		.catch(() => import(new URL("../../core/src/schema/scenario.ts", import.meta.url).href)) as Promise<ScenarioSchemaModule>;
	return scenarioModulePromise;
}

function issue(pathParts: (string | number)[], message: string): ValidationIssueSummary {
	return { path: pathParts.length ? pathParts.join(".") : "<root>", message };
}

export function formatValidationIssues(issues: ValidationIssueSummary[], limit = 8): string {
	if (issues.length === 0) return "none";
	const shown = issues.slice(0, limit).map((item) => `${item.path}: ${item.message}`);
	const remaining = issues.length - shown.length;
	return remaining > 0 ? `${shown.join("; ")}; +${remaining} more` : shown.join("; ");
}

export async function validateScenarioObject(
	input: unknown,
	options: ScenarioObjectValidationOptions = {}
): Promise<ScenarioObjectValidationResult> {
	const { ScenarioSchema } = await loadScenarioModule();
	const result = ScenarioSchema.safeParse(input);
	const issues: ValidationIssueSummary[] = [];
	let scenarioId: string | undefined;

	if (!result.success) {
		issues.push(
			...result.error.issues.map((zodIssue) =>
				issue(
					zodIssue.path.map((part) => (typeof part === "symbol" ? String(part) : part)),
					zodIssue.message
				)
			)
		);
		const possibleScenario = input as { scenarioId?: unknown };
		if (typeof possibleScenario?.scenarioId === "string") scenarioId = possibleScenario.scenarioId;
		return { ok: false, scenarioId, issues };
	}

	const scenario = result.data;
	scenarioId = scenario.scenarioId;
	if (options.expectedScenarioId !== undefined && scenario.scenarioId !== options.expectedScenarioId) {
		issues.push(issue(["scenarioId"], `expected ${options.expectedScenarioId}, got ${scenario.scenarioId}`));
	}
	if (options.expectedPackId !== undefined && scenario.packId !== options.expectedPackId) {
		issues.push(issue(["packId"], `expected ${options.expectedPackId}, got ${scenario.packId}`));
	}
	if (options.expectedPackVersion !== undefined && scenario.packVersion !== options.expectedPackVersion) {
		issues.push(issue(["packVersion"], `expected ${options.expectedPackVersion}, got ${scenario.packVersion}`));
	}
	if (options.requirePublicDev === true && scenario.visibility !== "public_dev") {
		issues.push(issue(["visibility"], `expected public_dev, got ${scenario.visibility}`));
	}
	if (options.requirePublicExample === true && scenario.visibility !== "public_example") {
		issues.push(issue(["visibility"], `expected public_example, got ${scenario.visibility}`));
	}

	return { ok: issues.length === 0, scenarioId, issues };
}

async function readJsonFile(filePath: string): Promise<unknown> {
	const content = await fs.readFile(filePath, "utf8");
	return JSON.parse(content) as unknown;
}

function scenarioEntryPath(entry: ManifestScenarioEntry): string {
	return typeof entry === "string" ? entry : entry.path;
}

function scenarioEntryId(entry: ManifestScenarioEntry): string | undefined {
	return typeof entry === "string" ? undefined : entry.scenarioId;
}

export async function validateScenarioPack(packDir: string): Promise<ScenarioPackValidationResult> {
	const manifestPath = path.join(packDir, "manifest.json");
	const issues: ValidationIssueSummary[] = [];
	let manifest: ScenarioPackManifest;

	try {
		manifest = (await readJsonFile(manifestPath)) as ScenarioPackManifest;
	} catch (error) {
		return {
			ok: false,
			scenarioCount: 0,
			validatedScenarioIds: [],
			issues: [issue(["manifest.json"], `could not parse manifest JSON: ${(error as Error).message}`)]
		};
	}

	if (!Array.isArray(manifest.scenarios)) {
		issues.push(issue(["manifest", "scenarios"], "must be an array"));
	}
	if (typeof manifest.scenarioCount !== "number" || manifest.scenarioCount !== manifest.scenarios?.length) {
		issues.push(issue(["manifest", "scenarioCount"], `expected ${manifest.scenarios?.length ?? 0}, got ${manifest.scenarioCount}`));
	}
	if (manifest.validated === true) {
		issues.push(issue(["manifest", "validated"], "must remain false until human scenario review accepts the pack"));
	}

	const isExamplesPack = manifest.id === "examples";
	if (manifest.official === true) {
		issues.push(
			issue(["manifest", "official"], isExamplesPack ? "example pack must not be marked official" : "public-dev pack must not be marked official")
		);
	}
	if (manifest.hidden === true) {
		issues.push(
			issue(["manifest", "hidden"], isExamplesPack ? "example pack must not be marked hidden" : "public-dev pack must not be marked hidden")
		);
	}

	const validatedScenarioIds: string[] = [];
	for (const [index, entry] of (manifest.scenarios ?? []).entries()) {
		const relativeScenarioPath = scenarioEntryPath(entry);
		const scenarioPath = path.join(packDir, relativeScenarioPath);
		let scenarioJson: unknown;
		try {
			scenarioJson = await readJsonFile(scenarioPath);
		} catch (error) {
			issues.push(issue(["manifest", "scenarios", index], `could not parse scenario JSON: ${(error as Error).message}`));
			continue;
		}

		const expectedScenarioId = scenarioEntryId(entry);
		const scenarioResult = await validateScenarioObject(scenarioJson, {
			expectedPackId: manifest.id,
			expectedPackVersion: manifest.version,
			...(expectedScenarioId === undefined ? {} : { expectedScenarioId }),
			requirePublicDev: !isExamplesPack,
			requirePublicExample: isExamplesPack
		});
		if (scenarioResult.ok && scenarioResult.scenarioId !== undefined) {
			validatedScenarioIds.push(scenarioResult.scenarioId);
		} else {
			issues.push(
				...scenarioResult.issues.map((validationIssue) => ({
					path: `scenarios.${index}.${validationIssue.path}`,
					message: validationIssue.message
				}))
			);
		}
	}

	return {
		ok: issues.length === 0,
		packId: manifest.id,
		packVersion: manifest.version,
		scenarioCount: manifest.scenarios?.length ?? 0,
		validatedScenarioIds,
		issues
	};
}

async function runSelfTest(): Promise<number> {
	const fixturePath = path.join(
		process.cwd(),
		"scenario-packs/examples/v1.0.0/scenarios/cog_example_001_training_room.json"
	);
	const fixture = (await readJsonFile(fixturePath)) as ScenarioLike;
	const invalidScenario = {
		...fixture,
		public: {
			...fixture.public,
			maxSteps: 0
		}
	};
	const result = await validateScenarioObject(invalidScenario, {
		expectedPackId: "examples",
		expectedPackVersion: "1.0.0",
		requirePublicExample: true
	});
	if (result.ok) {
		console.error("scenario-tools self-test: invalid scenario unexpectedly accepted");
		return 1;
	}
	console.log(`scenario-tools self-test: invalid scenario rejected at ${result.issues[0]?.path ?? "unknown"}`);
	return 0;
}

async function runCli(argv: string[]): Promise<number> {
	if (argv.includes("--self-test")) return runSelfTest();
	const packDir = argv[0];
	if (!packDir) {
		console.error("usage: validate.ts <scenario-pack-dir> | --self-test");
		return 1;
	}

	const result = await validateScenarioPack(packDir);
	if (!result.ok) {
		console.error(`scenario pack validation: failed (${result.scenarioCount} scenario entries)`);
		console.error(`issues: ${formatValidationIssues(result.issues)}`);
		return 1;
	}
	console.log(
		`scenario pack validation: ok (${result.validatedScenarioIds.length}/${result.scenarioCount} scenarios) pack=${result.packId}@${result.packVersion}`
	);
	console.log(`validated scenarios: ${result.validatedScenarioIds.join(", ")}`);
	return 0;
}

if (process.argv[1]?.endsWith("validate.ts")) {
	process.exitCode = await runCli(process.argv.slice(2));
}
