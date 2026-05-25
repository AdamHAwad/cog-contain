import {
	LEADERBOARD_FAILURE_POLICY,
	LEADERBOARD_SCORE_KIND,
	LEADERBOARD_SCORE_VERSION,
	OFFICIAL_LEADERBOARD_RUN_PROTOCOL,
	scoreLeaderboardAttempt,
	type LeaderboardAttemptScore,
	type LeaderboardAttemptStatus,
} from "@cog-contain/core/scoring/leaderboardScore";
import type { ScenarioUtilityFoundationResult } from "@cog-contain/core/scoring/scenarioUtility";

export const LEADERBOARD_SCORE_BUNDLE_SCHEMA_VERSION = "leaderboard-score-bundle.v1" as const;

export type LeaderboardScoreBundle = {
	schemaVersion: typeof LEADERBOARD_SCORE_BUNDLE_SCHEMA_VERSION;
	scoreKind: typeof LEADERBOARD_SCORE_KIND;
	runProtocol: typeof OFFICIAL_LEADERBOARD_RUN_PROTOCOL;
	scoreVersion: typeof LEADERBOARD_SCORE_VERSION;
	runId: string;
	scenarioId: string;
	attemptStatus: LeaderboardAttemptStatus;
	failurePolicy: typeof LEADERBOARD_FAILURE_POLICY;
	primaryScoreSupported: boolean;
	policyScenarioScore: number;
	rawScenarioUtilityScore: number | null;
	cappedScenarioUtilityScore: number | null;
	componentResults: LeaderboardAttemptScore["componentResults"];
	hardCapSummary: LeaderboardAttemptScore["hardCapSummary"];
	unsupportedCheckCount: number;
	scorerVersions: {
		scenarioUtilityFoundation: string;
	};
	caveats: string[];
};

export type BuildLeaderboardScoreBundleInput = {
	runId: string;
	scenarioId: string;
	attemptStatus: LeaderboardAttemptStatus;
	scenarioUtility: ScenarioUtilityFoundationResult | null;
};

const BUNDLE_CAVEATS = [
	"sanitized leaderboard score bundle only",
	"no hidden scenario prose, raw model text, raw provider payload, raw tool payload, env values, or private scoring content",
	"private artifact for official leaderboard aggregation only"
] as const;

export function buildLeaderboardScoreBundle(input: BuildLeaderboardScoreBundleInput): LeaderboardScoreBundle {
	const scored = scoreLeaderboardAttempt({
		scenarioId: input.scenarioId,
		runId: input.runId,
		attemptStatus: input.attemptStatus,
		scenarioUtility: input.scenarioUtility
	});
	return {
		schemaVersion: LEADERBOARD_SCORE_BUNDLE_SCHEMA_VERSION,
		scoreKind: LEADERBOARD_SCORE_KIND,
		runProtocol: OFFICIAL_LEADERBOARD_RUN_PROTOCOL,
		scoreVersion: LEADERBOARD_SCORE_VERSION,
		runId: scored.runId,
		scenarioId: scored.scenarioId,
		attemptStatus: scored.attemptStatus,
		failurePolicy: scored.failurePolicy,
		primaryScoreSupported: scored.primaryScoreSupported,
		policyScenarioScore: scored.policyScenarioScore,
		rawScenarioUtilityScore: scored.rawScenarioUtilityScore,
		cappedScenarioUtilityScore: scored.cappedScenarioUtilityScore,
		componentResults: scored.componentResults,
		hardCapSummary: scored.hardCapSummary,
		unsupportedCheckCount: scored.unsupportedChecks.length,
		scorerVersions: {
			scenarioUtilityFoundation: input.scenarioUtility?.scorerVersion ?? "missing"
		},
		caveats: [...BUNDLE_CAVEATS]
	};
}
