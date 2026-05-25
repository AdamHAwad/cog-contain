export type RunnerImplementationStatus = "phase-6r-mock-artifact-aggregate-import-foundation";

export type RunnerModelConfig = {
	provider: "faux";
	modelId: string;
	mode: "mock";
	displayName?: string;
};

export type LiveDryRunProviderId = "openai" | "openrouter" | "anthropic";
export type LiveDryRunMode = "live-dry-run";

export type LiveDryRunModelConfig = {
	mode: LiveDryRunMode;
	provider: LiveDryRunProviderId;
	modelId: string;
	displayName: string;
	piApi: string;
	reasoning: boolean;
	inputModalities: string[];
	contextWindow: number;
	maxTokens: number;
	costPerMillionTokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	baseUrlHost: string;
	credentialEnvName: string;
};

export type LiveDryRunConfig = {
	scenarioPath: string;
	scenarioInput: unknown;
	provider: string;
	modelId: string;
	maxSteps: number;
	maxOutputTokens?: number;
	timeoutMs?: number;
	retryCount?: number;
};

export type LiveDryRunResult = {
	scenarioId: string;
	mode: LiveDryRunMode;
	validated: boolean;
	model: LiveDryRunModelConfig;
	plannedCaps: {
		maxSteps: number;
		maxOutputTokens?: number;
		timeoutMs?: number;
		retryCount?: number;
	};
	plannedToolCount: number;
	safety: {
		envRead: false;
		keyPresenceChecked: false;
		liveProviderCall: false;
		agentPromptCalled: false;
		providerStreamCalled: false;
		directProviderSdk: false;
	};
};

export type RunnerTrajectoryEventKind = "model_message" | "tool_call" | "tool_result" | "state_delta" | "runner_error";

export type RunnerTrajectoryEvent = {
	sequence: number;
	kind: RunnerTrajectoryEventKind;
	label: string;
	role?: string;
	textBlockCount?: number;
	toolCallId?: string;
	toolId?: string;
	argumentKeys?: string[];
	ok?: boolean;
	warningCodes?: string[];
	deltaCount?: number;
	deltaPaths?: string[];
	payloadIds?: string[];
	finalTick?: number;
	ended?: boolean;
	code?: string;
	message?: string;
};

export type RunnerToolResultDetails = {
	toolId: string;
	ok: boolean;
	warningCodes: string[];
	deltaCount: number;
	deltaPaths: string[];
	payloadIds: string[];
	finalTick: number;
	ended: boolean;
};

export type MockScriptId = "orchard-mirror-resistant" | "orchard-mirror-attack-following" | "public-dev-generic";

export type MockOutcomeSummary = {
	scriptId: MockScriptId;
	expectedFailure: boolean;
	expectedFailureReason?: string;
	resistantPathOk?: boolean;
	attackFollowingFailureObserved?: boolean;
	displayRelayCut?: boolean;
	archiveSealed?: boolean;
	droneInspectionComplete?: boolean;
	serviceDoorState?: string;
	attackPayloadObserved?: boolean;
	injectedPayloadIdCount: number;
};

export type MockRunConfig = {
	scenarioPath?: string;
	scenarioInput?: unknown;
	scriptId?: MockScriptId;
	modelScriptLabel?: string;
	maxSteps?: number;
	runId?: string;
};

export type MockArtifactScoreStatus = "scored_foundation" | "scored_foundation_with_unsupported" | "not_scored";

export type MockArtifactScorerVersions = {
	runScoreFoundation: string;
	finalReportQualityFoundation: string;
	scenarioUtilityFoundation: string;
};

export type MockArtifactScoreMetrics = {
	runScoreStatus: string;
	objectiveCompletionStatus: string;
	objectiveCompletionScore: number | null;
	weightedAttackSuccessRate: number | null;
	attackResistanceScore: number | null;
	triggeredPenaltyCount: number;
	unsupportedPenaltyCount: number;
	hardCapCount: number;
	predicateScoreEventCount: number;
	scenarioUtilityStatus: string;
	rawScenarioUtilityScore: number | null;
	cappedScenarioUtilityScore: number | null;
	finalReportQualityStatus: string;
	finalReportQualityScore: number | null;
	unsupportedItemCount: number;
	unsupportedScenarioUtilityCheckCount: number;
	unsupportedFinalReportQualityCheckCount: number;
	scoreEventCount: number;
	objectiveCount: number;
	penaltyCount: number;
};

export type MockArtifactScoreReport =
	| {
			artifactSchemaVersion: string;
			runId: string;
			scenarioId: string;
			mode: "mock";
			status: "scored_foundation" | "scored_foundation_with_unsupported";
			scorerVersions: MockArtifactScorerVersions;
			metrics: MockArtifactScoreMetrics;
			caveats: string[];
	  }
	| {
			artifactSchemaVersion: string;
			runId: string;
			scenarioId: string;
			mode: "mock";
			status: "not_scored";
			metrics: Record<string, never>;
			caveats: string[];
	  };

export type MockArtifactScoreEvent = {
	eventId: string;
	scenarioId: string;
	runId: string;
	itemType: string;
	itemId: string;
	predicateKind: string;
	status: string;
	supported: boolean;
	pointsConsidered: number;
	pointsApplied: number;
	reasonCode: string;
};

export type MockArtifactScoringSummary = {
	scoreReport: MockArtifactScoreReport;
	scoreEvents: MockArtifactScoreEvent[];
};

export type MockArtifactAggregateStatus = "mock_artifact_aggregate_foundation" | "mock_artifact_aggregate_foundation_with_unsupported";

export type MockArtifactAggregateScorerVersion = {
	label: string;
	value: string;
};

export type MockArtifactAggregateHashVerificationSummary = {
	sourceRunCount: number;
	verifiedSourceRunCount: number;
	unverifiedSourceRunCount: number;
	hashMismatchCount: number;
	missingHashCount: number;
};

export type MockArtifactAggregateScoreEventSummary = {
	scoreEventRowCount: number;
	objectiveEventCount: number;
	penaltyEventCount: number;
	unsupportedScoreEventCount: number;
};

export type MockArtifactAggregateMetricSummary = {
	meanObjectiveCompletionScore: number | null;
	meanWeightedAttackSuccessRate: number | null;
	meanAttackResistanceScore: number | null;
	totalTriggeredPenaltyCount: number;
	totalUnsupportedPenaltyCount: number;
	totalHardCapCount: number;
	meanRawScenarioUtilityScore: number | null;
	meanCappedScenarioUtilityScore: number | null;
	meanFinalReportQualityScore: number | null;
	totalUnsupportedItemCheckCount: number;
};

export type MockArtifactAggregateUnsupportedRunSummary = {
	runId: string;
	reasonCodes: string[];
};

export type MockArtifactAggregateUnsupportedSummary = {
	unsupportedRunCount: number;
	unsupportedRuns: MockArtifactAggregateUnsupportedRunSummary[];
	reasonCounts: { reasonCode: string; runCount: number }[];
};

export type MockArtifactAggregateReport = {
	artifactAggregateSchemaVersion: string;
	status: MockArtifactAggregateStatus;
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	scenarioIds: string[];
	sourceRunIds: string[];
	sourceArtifactSchemaVersions: string[];
	sourceScorerVersions: MockArtifactAggregateScorerVersion[];
	hashVerificationSummary: MockArtifactAggregateHashVerificationSummary;
	scoreEventSummary: MockArtifactAggregateScoreEventSummary;
	metricSummary: MockArtifactAggregateMetricSummary;
	unsupportedSummary: MockArtifactAggregateUnsupportedSummary;
	caveats: string[];
};

export type MockArtifactAggregateManifest = {
	artifactAggregateSchemaVersion: string;
	reportId: string;
	status: MockArtifactAggregateStatus;
	files: string[];
	fileHashes: Record<string, string>;
	sourceRunCount: number;
	sourceRunIds: string[];
	caveats: string[];
};

export type MockArtifactAggregateWriteConfig = {
	outDir: string;
	runDirs: string[];
	overwrite?: boolean;
};

export type MockArtifactAggregateWriteResult = {
	outDir: string;
	files: string[];
	runCount: number;
	supportedRunCount: number;
	unsupportedRunCount: number;
	reportHash: string;
	manifestHash: string;
};

export type MockRunResult = {
	scenarioId: string;
	model: RunnerModelConfig;
	scriptId: MockScriptId;
	modelScriptLabel: string;
	maxSteps: number;
	finalTick: number;
	eventCount: number;
	modelMessageCount: number;
	toolCallCount: number;
	toolResultCount: number;
	stateDeltaEventCount: number;
	injectedPayloadIds: string[];
	ended: boolean;
	outcomeSummary: MockOutcomeSummary;
	trajectoryEvents: RunnerTrajectoryEvent[];
	scoring?: MockArtifactScoringSummary;
};

export type MockToolScriptStep = {
	toolId: string;
	args: Record<string, unknown>;
	callId: string;
};

export type MockToolScript = {
	scriptId: MockScriptId;
	label: string;
	expectedFailure: boolean;
	expectedFailureReason?: string;
	steps: MockToolScriptStep[];
};

export type ArtifactTrajectoryEvent = {
	eventId: string;
	runId: string;
	step: number;
	tick: number;
	timestamp: string;
	kind: RunnerTrajectoryEventKind;
	payload: Record<string, unknown>;
	hashes: {
		previousEventHash?: string;
		payloadHash: string;
		eventHash: string;
	};
};

export type MockArtifactWriteConfig = {
	runId: string;
	outDir: string;
	scenarioPath: string;
	scenarioInput: unknown;
	result: MockRunResult;
	overwrite?: boolean;
};

export type MockArtifactWriteResult = {
	runId: string;
	outDir: string;
	files: string[];
	trajectoryEventCount: number;
	firstEventHash?: string;
	lastEventHash?: string;
	scenarioPrivateChecksum: string;
};
