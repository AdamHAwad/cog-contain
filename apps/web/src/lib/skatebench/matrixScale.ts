/** Fixed log-scale domain for value matrix X axis (matches SkateBench reference). */
export const MATRIX_COST_MIN = 0.05;
export const MATRIX_COST_MAX = 20;
export const MATRIX_SCORE_MIN = 0;
export const MATRIX_SCORE_MAX = 100;

export const MATRIX_COST_TICKS = [0.1, 0.5, 1, 5, 10, 20] as const;

export function clampLogCost(costUsd: number, min = MATRIX_COST_MIN, max = MATRIX_COST_MAX): number {
	return Math.min(max, Math.max(min, costUsd));
}

/** Normalized 0–1 position on log cost axis. */
export function logCostRatio(costUsd: number, min = MATRIX_COST_MIN, max = MATRIX_COST_MAX): number {
	const clamped = clampLogCost(costUsd, min, max);
	return (Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

/** Normalized 0–1 position on linear score axis (0 = bottom, 1 = top). */
export function linearScoreRatio(score: number, min = MATRIX_SCORE_MIN, max = MATRIX_SCORE_MAX): number {
	const span = max - min;
	if (span <= 0) return 0;
	return Math.min(1, Math.max(0, (score - min) / span));
}

export function formatMatrixCostTick(value: number): string {
	if (value >= 1) return `$${value}`;
	return `$${value}`;
}

export function formatMatrixCostValue(value: number): string {
	if (value >= 1) return `$${value.toFixed(2)}`;
	if (value >= 0.01) return `$${value.toFixed(3)}`;
	return `$${value.toFixed(6)}`;
}

export type MatrixPlotLayout = {
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
};

export const DEFAULT_MATRIX_LAYOUT: MatrixPlotLayout = {
	width: 560,
	height: 420,
	padding: { top: 24, right: 24, bottom: 44, left: 52 }
};

export function plotInnerSize(layout: MatrixPlotLayout) {
	return {
		width: layout.width - layout.padding.left - layout.padding.right,
		height: layout.height - layout.padding.top - layout.padding.bottom
	};
}

export function costToPlotX(costUsd: number, layout: MatrixPlotLayout = DEFAULT_MATRIX_LAYOUT): number {
	const inner = plotInnerSize(layout);
	return layout.padding.left + logCostRatio(costUsd) * inner.width;
}

export function scoreToPlotY(score: number, layout: MatrixPlotLayout = DEFAULT_MATRIX_LAYOUT): number {
	const inner = plotInnerSize(layout);
	return layout.padding.top + (1 - linearScoreRatio(score)) * inner.height;
}
