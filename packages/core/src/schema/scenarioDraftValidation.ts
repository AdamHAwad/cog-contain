// @ts-ignore Node's strip-types runtime needs the TypeScript extension for this shared package-root helper import.
import { ScenarioSchema } from "./scenario.ts";

export const SCENARIO_DRAFT_VALIDATION_SCHEMA_VERSION = "phase-36.scenario-draft-validation.v1" as const;
export const SCENARIO_DRAFT_VALIDATOR_VERSION = "cog-contain-scenario-schema.v1" as const;
export const SCENARIO_DRAFT_VALIDATION_MAX_INPUT_CHARS = 200_000 as const;
export const SCENARIO_DRAFT_VALIDATION_MAX_ISSUES = 12 as const;

export type ScenarioDraftValidationStatus = "empty_input" | "input_too_large" | "json_parse_error" | "schema_failed" | "passed";
export type ScenarioDraftValidationSeverity = "info" | "warning" | "error";

export type ScenarioDraftValidationIssueSummary = {
	path: string;
	severity: ScenarioDraftValidationSeverity;
	message: string;
	fixHint?: string;
};

export type ScenarioDraftValidationPreview = {
	scenarioId?: string;
	title?: string;
	packId?: string;
	packVersion?: string;
	visibility?: string;
	tagCount: number;
	publicDocumentCount: number;
	observationCount: number;
	availableToolCount: number;
	privateSectionPresent: boolean;
	privatePayloadCount: number;
	referenceTrajectoryCount: number;
};

export type ScenarioDraftValidationResult = {
	schemaVersion: typeof SCENARIO_DRAFT_VALIDATION_SCHEMA_VERSION;
	status: ScenarioDraftValidationStatus;
	validatorVersion: typeof SCENARIO_DRAFT_VALIDATOR_VERSION;
	issueCounts: Record<ScenarioDraftValidationSeverity, number>;
	issues: ScenarioDraftValidationIssueSummary[];
	preview: ScenarioDraftValidationPreview | null;
	notes: string[];
};

export type ScenarioDraftValidationOptions = {
	expectedScenarioId?: string;
	mode?: "local" | "protected_server_preview";
	maxInputCharacters?: number;
};

export const SCENARIO_DRAFT_LOCAL_VALIDATION_VERSION = SCENARIO_DRAFT_VALIDATION_SCHEMA_VERSION;
export const SCENARIO_DRAFT_LOCAL_VALIDATOR_VERSION = SCENARIO_DRAFT_VALIDATOR_VERSION;
export type ScenarioDraftLocalValidationStatus = ScenarioDraftValidationStatus;
export type ScenarioDraftLocalValidationSeverity = ScenarioDraftValidationSeverity;
export type ScenarioDraftLocalValidationIssueSummary = ScenarioDraftValidationIssueSummary;
export type ScenarioDraftLocalValidationPreview = ScenarioDraftValidationPreview;
export type ScenarioDraftLocalValidationResult = ScenarioDraftValidationResult;

const PRIVATE_PUBLIC_KEY_PATTERN = /(private|evaluator|answer|groundTruth|payload|attack|solution|referenceTrajector)/iu;

function emptyCounts(): Record<ScenarioDraftValidationSeverity, number> {
	return { info: 0, warning: 0, error: 0 };
}

function result(
	status: ScenarioDraftValidationStatus,
	issues: ScenarioDraftValidationIssueSummary[],
	preview: ScenarioDraftValidationPreview | null,
	notes: string[]
): ScenarioDraftValidationResult {
	const issueCounts = emptyCounts();
	for (const issue of issues) issueCounts[issue.severity] += 1;
	return {
		schemaVersion: SCENARIO_DRAFT_VALIDATION_SCHEMA_VERSION,
		status,
		validatorVersion: SCENARIO_DRAFT_VALIDATOR_VERSION,
		issueCounts,
		issues: issues.slice(0, SCENARIO_DRAFT_VALIDATION_MAX_ISSUES),
		preview,
		notes
	};
}

function modeLabel(mode: ScenarioDraftValidationOptions["mode"]): string {
	return mode === "protected_server_preview" ? "protected server validation preview" : "browser-local validation";
}

function sanitizePath(path: readonly unknown[]): string {
	if (path.length === 0) return "(root)";
	return path.map((part) => String(part).replace(/[^a-zA-Z0-9_.-]/gu, "_")).join(".");
}

function sanitizeMessage(message: string): string {
	return message.replace(/[`"'][^`"']{16,}[`"']/gu, "[value]").slice(0, 180);
}

function fixHintForPath(path: string): string {
	if (path === "(root)") return "Check that the pasted text is a complete scenario JSON object.";
	if (path.includes("public")) return "Check the public scenario section shape and required metadata.";
	if (path.includes("private")) return "Check that private evaluator fields use the expected schema without exposing values in UI.";
	return "Check the field type, required value, or array shape for this path.";
}

function previewFromCandidate(candidate: unknown): ScenarioDraftValidationPreview | null {
	if (!candidate || typeof candidate !== "object") return null;
	const record = candidate as Record<string, unknown>;
	const publicSection = record.public && typeof record.public === "object" ? (record.public as Record<string, unknown>) : {};
	const privateSection = record.private && typeof record.private === "object" ? (record.private as Record<string, unknown>) : undefined;
	return {
		...(typeof record.scenarioId === "string" ? { scenarioId: record.scenarioId } : {}),
		...(typeof record.title === "string" ? { title: record.title } : {}),
		...(typeof record.packId === "string" ? { packId: record.packId } : {}),
		...(typeof record.packVersion === "string" ? { packVersion: record.packVersion } : {}),
		...(typeof record.visibility === "string" ? { visibility: record.visibility } : {}),
		tagCount: Array.isArray(record.tags) ? record.tags.length : 0,
		publicDocumentCount: Array.isArray(publicSection.initialDocuments) ? publicSection.initialDocuments.length : 0,
		observationCount: Array.isArray(publicSection.initialObservations) ? publicSection.initialObservations.length : 0,
		availableToolCount: Array.isArray(publicSection.availableTools) ? publicSection.availableTools.length : 0,
		privateSectionPresent: privateSection !== undefined,
		privatePayloadCount: privateSection && Array.isArray(privateSection.adversarialPayloads) ? privateSection.adversarialPayloads.length : 0,
		referenceTrajectoryCount: privateSection && Array.isArray(privateSection.referenceTrajectories) ? privateSection.referenceTrajectories.length : 0
	};
}

function publicLeakageIssues(candidate: unknown): ScenarioDraftValidationIssueSummary[] {
	if (!candidate || typeof candidate !== "object") return [];
	const publicSection = (candidate as Record<string, unknown>).public;
	if (!publicSection || typeof publicSection !== "object") return [];
	const publicKeys = new Set<string>();
	const walk = (value: unknown, prefix: string, depth: number) => {
		if (!value || typeof value !== "object" || depth > 4) return;
		for (const key of Object.keys(value as Record<string, unknown>)) {
			const path = prefix ? `${prefix}.${key}` : key;
			publicKeys.add(path);
			walk((value as Record<string, unknown>)[key], path, depth + 1);
		}
	};
	walk(publicSection, "public", 0);
	return [...publicKeys]
		.filter((path) => PRIVATE_PUBLIC_KEY_PATTERN.test(path))
		.slice(0, 3)
		.map((path) => ({
			path,
			severity: "warning" as const,
			message: "A private/evaluator-style key name appears inside the public section.",
			fixHint: "Move private-only material to the private section before sharing public scenario data."
		}));
}

export function validateScenarioDraftJson(
	input: string,
	expectedScenarioIdOrOptions?: string | ScenarioDraftValidationOptions
): ScenarioDraftValidationResult {
	const options = typeof expectedScenarioIdOrOptions === "string" ? { expectedScenarioId: expectedScenarioIdOrOptions } : expectedScenarioIdOrOptions ?? {};
	const maxInputCharacters = options.maxInputCharacters ?? SCENARIO_DRAFT_VALIDATION_MAX_INPUT_CHARS;
	const label = modeLabel(options.mode);
	if (input.length > maxInputCharacters) {
		return result("input_too_large", [
			{
				path: "(json)",
				severity: "error",
				message: "The pasted scenario JSON is too large for this bounded validation preview.",
				fixHint: "Reduce the input size before running validation. Raw content was not parsed."
			}
		], null, [
			`Input exceeded the bounded ${label} size guard.`,
			"No parsing, persistence, import, export, publication, run, or readiness check was performed."
		]);
	}

	const trimmed = input.trim();
	if (!trimmed) {
		return result("empty_input", [], null, [
			"Paste a complete scenario JSON object, then run validation.",
			`No draft persistence, import, export, publication, run, or readiness path runs for this ${label}.`
		]);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return result("json_parse_error", [
			{
				path: "(json)",
				severity: "error",
				message: "The pasted text is not valid JSON.",
				fixHint: "Check commas, quotes, braces, and that the input is a single JSON object."
			}
		], null, ["Raw parser diagnostics are withheld."]);
	}

	const parseResult = ScenarioSchema.safeParse(parsed);
	const preview = previewFromCandidate(parsed);
	const issues: ScenarioDraftValidationIssueSummary[] = [];

	if (!parseResult.success) {
		for (const issue of parseResult.error.issues.slice(0, SCENARIO_DRAFT_VALIDATION_MAX_ISSUES)) {
			const path = sanitizePath(issue.path);
			issues.push({
				path,
				severity: "error",
				message: sanitizeMessage(issue.message),
				fixHint: fixHintForPath(path)
			});
		}
	}

	if (options.expectedScenarioId && preview?.scenarioId && preview.scenarioId !== options.expectedScenarioId) {
		issues.push({
			path: "scenarioId",
			severity: "warning",
			message: "The pasted scenario identifier does not match the route identifier.",
			fixHint: "Confirm that you are validating the intended scenario before copying metadata elsewhere."
		});
	}

	issues.push(...publicLeakageIssues(parsed));

	if (issues.some((issue) => issue.severity === "error")) {
		return result("schema_failed", issues, preview, [
			`${label} found schema issues. Values are not persisted by this validation preview.`,
			"Issue summaries are bounded and avoid echoing hidden/private scenario prose."
		]);
	}

	return result("passed", issues, previewFromCandidate(parseResult.success ? parseResult.data : parsed), [
		`${label} passed for the pasted JSON object.`,
		"This is a validation preview only; persistence, import, export, publication, run execution, deployment readiness, and full-V1 readiness remain unavailable."
	]);
}
