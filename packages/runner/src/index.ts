export const COG_CONTAIN_RUNNER_PACKAGE = "@cog-contain/runner" as const;

export type { RunnerImplementationStatus } from "./types";

export const runnerImplementationStatus: import("./types").RunnerImplementationStatus = "phase-6r-mock-artifact-aggregate-import-foundation";

export type {
	ArtifactTrajectoryEvent,
	LiveDryRunConfig,
	LiveDryRunMode,
	LiveDryRunModelConfig,
	LiveDryRunProviderId,
	LiveDryRunResult,
	MockArtifactAggregateHashVerificationSummary,
	MockArtifactAggregateManifest,
	MockArtifactAggregateMetricSummary,
	MockArtifactAggregateReport,
	MockArtifactAggregateScoreEventSummary,
	MockArtifactAggregateScorerVersion,
	MockArtifactAggregateStatus,
	MockArtifactAggregateUnsupportedRunSummary,
	MockArtifactAggregateUnsupportedSummary,
	MockArtifactAggregateWriteConfig,
	MockArtifactAggregateWriteResult,
	MockArtifactScoreEvent,
	MockArtifactScoreMetrics,
	MockArtifactScoreReport,
	MockArtifactScoreStatus,
	MockArtifactScorerVersions,
	MockArtifactScoringSummary,
	MockArtifactWriteConfig,
	MockArtifactWriteResult,
	MockOutcomeSummary,
	MockRunConfig,
	MockRunResult,
	MockScriptId,
	MockToolScript,
	MockToolScriptStep,
	RunnerModelConfig,
	RunnerToolResultDetails,
	RunnerTrajectoryEvent,
	RunnerTrajectoryEventKind
} from "./types";

export {
	createFauxResponsesForToolSequence,
	createOrchardMirrorAttackFollowingMockScript,
	createOrchardMirrorResistantMockScript,
	getOrchardMirrorMockScript,
	listOrchardMirrorMockScripts,
	normalizeMockScriptId
} from "./adapters/mock";
export { runMockPiScenario } from "./pi/piAgentRuntime";
export { buildMockArtifactScoringSummary, MOCK_ARTIFACT_SCORE_SCHEMA_VERSION } from "./scoring/mockArtifactScoreReport";
export {
	buildMockArtifactAggregateReport,
	MOCK_ARTIFACT_AGGREGATE_SCHEMA_VERSION,
	writeMockArtifactAggregateReport
} from "./scoring/mockArtifactAggregateReport";
export { createSimulatorAgentTools } from "./pi/toolRegistryAdapter";
export { summarizeTrajectoryEvents, TrajectoryRecorder } from "./pi/trajectoryRecorder";
export { createHashLinkedTrajectoryEvents, sha256Hex, sha256StableJson, stableJson } from "./artifacts/hashChain";
export { writeMockRunArtifacts } from "./artifacts/artifactWriter";
export { runLiveDryRunConfig, validateLiveDryRunModel } from "./adapters/liveConfig";
export { getRegistryModel, isLiveDryRunProviderId, listRegistryModelIds, listRegistryProviders } from "./adapters/piModelRegistry";
export { runMockRunnerRegression } from "./regression/mockRunnerRegression";
export { runLiveDryRunRegression } from "./regression/liveDryRunRegression";
