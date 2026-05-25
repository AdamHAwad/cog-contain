<script lang="ts">
	import { formatFullModelLabel, inferModelLab, type ModelDisplayInput } from '$lib/skatebench/modelDisplay';
	import {
		DEFAULT_MATRIX_LAYOUT,
		MATRIX_COST_TICKS,
		costToPlotX,
		formatMatrixCostTick,
		formatMatrixCostValue,
		logCostRatio,
		plotInnerSize,
		scoreToPlotY
	} from '$lib/skatebench/matrixScale';
	import { modelLabInitial, modelLogoPath } from '$lib/skatebench/modelLogos';
	import type { PublicSiteSnapshot } from '$lib/skatebench/visualizerData';

	type SnapshotResult = PublicSiteSnapshot['results'][number];

	type MatrixPoint = {
		result: SnapshotResult;
		rank: number;
		score: number;
		costUsd: number;
		x: number;
		y: number;
		logo?: string;
		initial: string;
	};

	type Props = {
		results: SnapshotResult[];
		leaderboardMode: boolean;
		displayInput: (result: SnapshotResult) => ModelDisplayInput;
		onPointClick?: (rowId: string) => void;
		pctPrecise: (value: number | null | undefined) => string;
		pct: (value: number | null | undefined) => string;
		seconds: (value: number | null | undefined) => string;
		displayRankColor: (rank: number) => string;
	};

	let {
		results,
		leaderboardMode,
		displayInput,
		onPointClick,
		pctPrecise,
		pct,
		seconds,
		displayRankColor
	}: Props = $props();

	const layout = DEFAULT_MATRIX_LAYOUT;
	const inner = $derived(plotInnerSize(layout));
	const scoreGridLines = [0, 25, 50, 75, 100];

	let hoveredRowId = $state<string | undefined>(undefined);
	let tooltipPos = $state({ x: 0, y: 0 });

	function scoreForRow(result: SnapshotResult): number | null {
		const value = leaderboardMode ? result.leaderboardScorePercent : result.accuracyPercent;
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function isEligible(result: SnapshotResult): boolean {
		const score = scoreForRow(result);
		return (
			typeof result.totalCostUsd === 'number' &&
			Number.isFinite(result.totalCostUsd) &&
			result.totalCostUsd > 0 &&
			score !== null
		);
	}

	const matrixPoints = $derived.by(() => {
		const eligible = results.filter(isEligible);
		const sorted = [...eligible].sort((a, b) => (scoreForRow(b) ?? 0) - (scoreForRow(a) ?? 0));
		return sorted.map((result, index): MatrixPoint => {
			const score = scoreForRow(result)!;
			const costUsd = result.totalCostUsd!;
			return {
				result,
				rank: index + 1,
				score,
				costUsd,
				x: costToPlotX(costUsd, layout),
				y: scoreToPlotY(score, layout),
				logo: modelLogoPath(result.model, result.provider),
				initial: modelLabInitial(result.model, result.provider)
			};
		});
	});

	const hoveredPoint = $derived(matrixPoints.find((point) => point.result.rowId === hoveredRowId));

	function scoreLabel() {
		return leaderboardMode ? 'Leaderboard score' : 'Accuracy';
	}

	function formatScore(value: number) {
		return leaderboardMode ? pctPrecise(value) : pct(value);
	}

	function handlePointerEnter(point: MatrixPoint, event: PointerEvent) {
		hoveredRowId = point.result.rowId;
		const target = event.currentTarget as SVGElement;
		const svg = target.ownerSVGElement;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		tooltipPos = {
			x: event.clientX - rect.left + 12,
			y: event.clientY - rect.top - 8
		};
	}

	function handlePointerMove(event: PointerEvent) {
		if (hoveredRowId === undefined) return;
		const svg = (event.currentTarget as SVGElement).ownerSVGElement;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		tooltipPos = {
			x: event.clientX - rect.left + 12,
			y: event.clientY - rect.top - 8
		};
	}

	function handlePointerLeave() {
		hoveredRowId = undefined;
	}

	function handlePointClick(point: MatrixPoint) {
		onPointClick?.(point.result.rowId);
	}

	function handleKeydown(point: MatrixPoint, event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handlePointClick(point);
		}
	}
</script>

<div class="value-matrix">
	{#if matrixPoints.length === 0}
		<p class="value-matrix-empty">No models have both cost and {scoreLabel().toLowerCase()} data for the value matrix.</p>
	{:else}
		<div class="value-matrix-plot-wrap">
			<svg
				class="value-matrix-svg"
				viewBox="0 0 {layout.width} {layout.height}"
				role="img"
				aria-label="Value matrix scatter plot"
				onpointermove={handlePointerMove}
				onpointerleave={handlePointerLeave}
			>
				<defs>
					<pattern id="value-matrix-grid" width={inner.width / 4} height={inner.height / 4} patternUnits="userSpaceOnUse" x={layout.padding.left} y={layout.padding.top}>
						<path
							d="M {inner.width / 4} 0 L 0 0 0 {inner.height / 4}"
							fill="none"
							stroke="oklch(0.95 0.006 240 / 0.06)"
							stroke-width="1"
						/>
					</pattern>
				</defs>

				<rect
					x={layout.padding.left}
					y={layout.padding.top}
					width={inner.width}
					height={inner.height}
					fill="url(#value-matrix-grid)"
				/>
				<rect
					x={layout.padding.left}
					y={layout.padding.top}
					width={inner.width}
					height={inner.height}
					fill="none"
					stroke="var(--hairline)"
					stroke-width="1"
				/>

				{#each scoreGridLines as tick (tick)}
					{@const y = scoreToPlotY(tick, layout)}
					<line
						x1={layout.padding.left}
						y1={y}
						x2={layout.padding.left + inner.width}
						y2={y}
						class="value-matrix-grid-line"
					/>
					<text x={layout.padding.left - 8} y={y + 3} class="value-matrix-axis-tick value-matrix-axis-tick-y">{tick}</text>
				{/each}

				{#each MATRIX_COST_TICKS as tick (tick)}
					{@const x = layout.padding.left + logCostRatio(tick) * inner.width}
					<line
						x1={x}
						y1={layout.padding.top}
						x2={x}
						y2={layout.padding.top + inner.height}
						class="value-matrix-grid-line"
					/>
					<text x={x} y={layout.padding.top + inner.height + 18} class="value-matrix-axis-tick value-matrix-axis-tick-x">
						{formatMatrixCostTick(tick)}
					</text>
				{/each}

				<text
					x={layout.padding.left + inner.width / 2}
					y={layout.height - 6}
					class="value-matrix-axis-label value-matrix-axis-label-x"
				>
					Total cost ($) log scale
				</text>
				<text
					x={16}
					y={layout.padding.top + inner.height / 2}
					class="value-matrix-axis-label value-matrix-axis-label-y"
					transform="rotate(-90 16 {layout.padding.top + inner.height / 2})"
				>
					{leaderboardMode ? 'Leaderboard score (%)' : 'Accuracy (%)'}
				</text>

				{#if hoveredPoint}
					<line
						x1={hoveredPoint.x}
						y1={layout.padding.top}
						x2={hoveredPoint.x}
						y2={layout.padding.top + inner.height}
						class="value-matrix-crosshair"
					/>
					<line
						x1={layout.padding.left}
						y1={hoveredPoint.y}
						x2={layout.padding.left + inner.width}
						y2={hoveredPoint.y}
						class="value-matrix-crosshair"
					/>
				{/if}

				{#each matrixPoints as point (point.result.rowId)}
					{@const active = hoveredRowId === point.result.rowId}
					<g
						class="value-matrix-point"
						class:is-active={active}
						transform="translate({point.x}, {point.y})"
						role="button"
						tabindex="0"
						aria-label="{formatFullModelLabel(displayInput(point.result))}, {formatScore(point.score)}, {formatMatrixCostValue(point.costUsd)}"
						onpointerenter={(event) => handlePointerEnter(point, event)}
						onclick={() => handlePointClick(point)}
						onkeydown={(event) => handleKeydown(point, event)}
					>
						<circle r="16" class="value-matrix-point-halo" />
						{#if point.logo}
							<image href={point.logo} x="-11" y="-11" width="22" height="22" class="value-matrix-point-logo" />
						{:else}
							<circle r="11" class="value-matrix-point-fallback" />
							<text y="4" class="value-matrix-point-initial">{point.initial}</text>
						{/if}
						<text x="14" y="4" class="value-matrix-point-rank">{point.rank}</text>
					</g>
				{/each}
			</svg>

			{#if hoveredPoint}
				<div
					class="value-matrix-tooltip"
					style:left="{Math.min(tooltipPos.x, layout.width - 200)}px"
					style:top="{Math.max(tooltipPos.y - 80, 8)}px"
					role="tooltip"
				>
					<p class="value-matrix-tooltip-rank" style:color={displayRankColor(hoveredPoint.rank)}>
						#{hoveredPoint.rank}
					</p>
					<p class="value-matrix-tooltip-model">
						<span>{inferModelLab(hoveredPoint.result.model, hoveredPoint.result.provider)}</span>
						{formatFullModelLabel(displayInput(hoveredPoint.result))}
					</p>
					<dl>
						<div>
							<dt>{scoreLabel()}</dt>
							<dd>{formatScore(hoveredPoint.score)}</dd>
						</div>
						<div>
							<dt>Total cost</dt>
							<dd>{formatMatrixCostValue(hoveredPoint.costUsd)}</dd>
						</div>
						<div>
							<dt>Speed</dt>
							<dd>{seconds(hoveredPoint.result.averageDurationSeconds)}</dd>
						</div>
					</dl>
				</div>
			{/if}
		</div>

		<ul class="value-matrix-legend" aria-label="Value matrix legend">
			{#each matrixPoints as point (point.result.rowId)}
				<li>
					<span class="value-matrix-legend-rank" style:color={displayRankColor(point.rank)}>{point.rank}</span>
					{#if point.logo}
						<img src={point.logo} alt="" class="value-matrix-legend-logo" width="18" height="18" />
					{:else}
						<span class="value-matrix-legend-fallback">{point.initial}</span>
					{/if}
					<span class="value-matrix-legend-label">{formatFullModelLabel(displayInput(point.result))}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
