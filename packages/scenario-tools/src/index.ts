export const COG_CONTAIN_SCENARIO_TOOLS_PACKAGE = "@cog-contain/scenario-tools" as const;

export type ScenarioToolsImplementationStatus = "phase-3c-validation-cli";

export const scenarioToolsImplementationStatus: ScenarioToolsImplementationStatus = "phase-3c-validation-cli";

export {
	formatValidationIssues,
	validateScenarioObject,
	validateScenarioPack,
	type ScenarioObjectValidationOptions,
	type ScenarioObjectValidationResult,
	type ScenarioPackValidationResult,
	type ValidationIssueSummary
} from "./validate";
