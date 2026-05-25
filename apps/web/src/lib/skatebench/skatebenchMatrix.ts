/**
 * Value matrix helpers ported from SkateBench visualizer/app/page.tsx (MIT).
 * https://github.com/T3-Content/skatebench
 */
import type { PublicSiteSnapshot } from './visualizerData';

export type SnapshotResult = PublicSiteSnapshot['results'][number];

/** SkateBench ScatterChart margins. */
export const MATRIX_CHART_MARGIN = { top: 20, right: 120, bottom: 40, left: 0 } as const;

/** SkateBench log-scale X domain and ticks. */
export const MATRIX_COST_DOMAIN: [number, number] = [0.05, 20];
export const MATRIX_COST_TICKS = [0.1, 0.5, 1, 5, 10, 20] as const;
export const MATRIX_SCORE_DOMAIN: [number, number] = [0, 100];

export type PerformanceDatum = {
	model: string;
	originalModel: string;
	successRate: number;
	totalCost: number;
	duration: number;
	rowId: string;
};

export function currency(n: number): string {
	return `$${n.toFixed(2)}`;
}

export function truncateLabel(input: unknown, max = 16): string {
	const label = String(input ?? '');
	if (label.length <= max) return label;
	return `${label.slice(0, Math.max(1, max - 1))}…`;
}

/** SkateBench getModelLogo — match on model display string. */
export function getModelLogo(modelName: string): string | null {
	const model = modelName.toLowerCase();
	if (model.includes('gemini') || model.includes('google')) return '/assets/logos/google.svg';
	if (model.includes('gpt') || model.includes('openai')) return '/assets/logos/openai.svg';
	if (model.includes('claude') || model.includes('anthropic')) return '/assets/logos/anthropic.svg';
	if (model.includes('deepseek')) return '/assets/logos/deepseek.svg';
	if (model.includes('grok') || model.includes('xai')) return '/assets/logos/xai.svg';
	if (model.includes('kimi')) return '/assets/logos/kimi.svg';
	if (model.includes('glm') || model.includes('zhipu')) return '/assets/logos/glm.svg';
	if (model.includes('minimax')) return '/assets/logos/minimax.svg';
	if (model.includes('meta') || model.includes('llama')) return '/assets/logos/meta.svg';
	if (model.includes('mistral')) return '/assets/logos/mistral.svg';
	if (model.includes('qwen')) return '/assets/logos/qwen.svg';
	return null;
}

export function scoreForRow(result: SnapshotResult, leaderboardMode: boolean): number | null {
	const value = leaderboardMode ? result.leaderboardScorePercent : result.accuracyPercent;
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isMatrixEligible(result: SnapshotResult, leaderboardMode: boolean): boolean {
	const score = scoreForRow(result, leaderboardMode);
	return (
		typeof result.totalCostUsd === 'number' &&
		Number.isFinite(result.totalCostUsd) &&
		result.totalCostUsd > 0 &&
		score !== null
	);
}

/** SkateBench performanceData shape, built from published snapshot rows. */
export function buildPerformanceData(
	rows: SnapshotResult[],
	leaderboardMode: boolean,
	displayLabel: (row: SnapshotResult) => string
): PerformanceDatum[] {
	return rows
		.filter((row) => isMatrixEligible(row, leaderboardMode))
		.map((row) => {
			const label = displayLabel(row);
			return {
				model: label.replace(/-/g, ' '),
				originalModel: label,
				successRate: scoreForRow(row, leaderboardMode)!,
				totalCost: row.totalCostUsd!,
				duration:
					typeof row.averageDurationSeconds === 'number' && Number.isFinite(row.averageDurationSeconds)
						? row.averageDurationSeconds
						: 0,
				rowId: row.rowId
			};
		});
}

/** SkateBench getModelColor — top three by success rate in current selection. */
export function getModelColor(modelName: string, data: PerformanceDatum[]): string {
	const topThree = [...data].sort((a, b) => b.successRate - a.successRate).slice(0, 3).map((d) => d.model);
	if (topThree.includes(modelName)) {
		if (topThree[0] === modelName) return 'var(--safety-green)';
		if (topThree[1] === modelName) return 'var(--electric-blue)';
		if (topThree[2] === modelName) return 'var(--hazard-orange)';
	}
	return 'var(--muted-line)';
}

export function scoreAxisLabel(leaderboardMode: boolean): string {
	return leaderboardMode ? 'LEADERBOARD SCORE (%)' : 'ACCURACY (%)';
}

export function scoreMetricLabel(leaderboardMode: boolean): string {
	return leaderboardMode ? 'LEADERBOARD SCORE' : 'ACCURACY';
}
