<script lang="ts">
	import { formatFullModelLabel, type ModelDisplayInput } from '$lib/skatebench/modelDisplay';
	import {
		MATRIX_CHART_MARGIN,
		MATRIX_COST_DOMAIN,
		MATRIX_COST_TICKS,
		MATRIX_SCORE_DOMAIN,
		buildPerformanceData,
		currency,
		getModelColor,
		getModelLogo,
		scoreAxisLabel,
		scoreMetricLabel,
		truncateLabel,
		type PerformanceDatum
	} from '$lib/skatebench/skatebenchMatrix';
	import { logCostRatio, linearScoreRatio } from '$lib/skatebench/matrixScale';
	import type { PublicSiteSnapshot } from '$lib/skatebench/visualizerData';

	type SnapshotResult = PublicSiteSnapshot['results'][number];

	type Props = {
		results: SnapshotResult[];
		leaderboardMode: boolean;
		displayInput: (result: SnapshotResult) => ModelDisplayInput;
		onPointClick?: (rowId: string) => void;
	};

	let { results, leaderboardMode, displayInput, onPointClick }: Props = $props();

	const chartWidth = 800;
	const chartHeight = 500;
	const plotLeft = MATRIX_CHART_MARGIN.left + 36;
	const plotTop = MATRIX_CHART_MARGIN.top;
	const plotBottom = chartHeight - MATRIX_CHART_MARGIN.bottom;
	const scoreTicks = [0, 25, 50, 75, 100];

	let hoveredRowId = $state<string | undefined>(undefined);
	let isMobile = $state(false);
	let tooltipPos = $state({ x: 0, y: 0 });

	const plotRight = $derived(chartWidth - (isMobile ? 20 : MATRIX_CHART_MARGIN.right));
	const plotWidth = $derived(plotRight - plotLeft);
	const plotHeight = $derived(plotBottom - plotTop);
	const showPointLabels = $derived(!isMobile);

	const performanceData = $derived(
		buildPerformanceData(results, leaderboardMode, (row) => formatFullModelLabel(displayInput(row)))
	);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-width: 820px)');
		const sync = () => {
			isMobile = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	function plotX(totalCost: number): number {
		return plotLeft + logCostRatio(totalCost, MATRIX_COST_DOMAIN[0], MATRIX_COST_DOMAIN[1]) * plotWidth;
	}

	function plotY(successRate: number): number {
		return plotTop + (1 - linearScoreRatio(successRate, MATRIX_SCORE_DOMAIN[0], MATRIX_SCORE_DOMAIN[1])) * plotHeight;
	}

	function pointFor(datum: PerformanceDatum) {
		return { x: plotX(datum.totalCost), y: plotY(datum.successRate) };
	}

	const hoveredDatum = $derived(performanceData.find((d) => d.rowId === hoveredRowId));

	function updateTooltipPosition(event: PointerEvent) {
		const svg = (event.currentTarget as SVGElement).ownerSVGElement;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		tooltipPos = {
			x: Math.min(Math.max(event.clientX - rect.left + 14, 12), rect.width - 220),
			y: Math.min(Math.max(event.clientY - rect.top - 12, 12), rect.height - 120)
		};
	}

	function handlePointPointer(datum: PerformanceDatum, event: PointerEvent) {
		hoveredRowId = datum.rowId;
		updateTooltipPosition(event);
	}

	function handlePointClick(datum: PerformanceDatum) {
		onPointClick?.(datum.rowId);
	}
</script>

<div class="value-matrix">
	{#if performanceData.length === 0}
		<p class="value-matrix-empty">No models have both cost and {scoreMetricLabel(leaderboardMode).toLowerCase()} data.</p>
	{:else}
		<div class="value-matrix-chart" style:height="{chartHeight}px">
			<svg
				class="value-matrix-svg"
				viewBox="0 0 {chartWidth} {chartHeight}"
				role="img"
				aria-label="Value matrix scatter plot"
				onpointerleave={() => (hoveredRowId = undefined)}
			>
				{#each scoreTicks as tick (tick)}
					{@const y = plotY(tick)}
					<line x1={plotLeft} y1={y} x2={plotRight} y2={y} class="value-matrix-grid" />
					<text x={plotLeft - 8} y={y + 3} class="value-matrix-tick">{tick}</text>
				{/each}

				{#each MATRIX_COST_TICKS as tick (tick)}
					{@const x = plotX(tick)}
					<line x1={x} y1={plotTop} x2={x} y2={plotBottom} class="value-matrix-grid" />
					<text x={x} y={plotBottom + 18} class="value-matrix-tick">${tick}</text>
				{/each}

				<text x={(plotLeft + plotRight) / 2} y={chartHeight - 8} class="value-matrix-axis-label">
					TOTAL COST ($) LOG SCALE
				</text>
				<text
					x={12}
					y={(plotTop + plotBottom) / 2}
					class="value-matrix-axis-label"
					transform="rotate(-90 12 {(plotTop + plotBottom) / 2})"
				>
					{scoreAxisLabel(leaderboardMode)}
				</text>

				{#if hoveredDatum}
					{@const hp = pointFor(hoveredDatum)}
					<line x1={hp.x} y1={plotTop} x2={hp.x} y2={plotBottom} class="value-matrix-crosshair" />
					<line x1={plotLeft} y1={hp.y} x2={plotRight} y2={hp.y} class="value-matrix-crosshair" />
				{/if}

				{#each performanceData as datum (datum.rowId)}
					{@const p = pointFor(datum)}
					{@const logo = getModelLogo(datum.originalModel)}
					{@const active = hoveredRowId === datum.rowId}
					<g
						class="value-matrix-point"
						class:is-active={active}
						transform="translate({p.x}, {p.y})"
						role="button"
						tabindex="0"
						onpointerenter={(event) => handlePointPointer(datum, event)}
						onpointermove={(event) => handlePointPointer(datum, event)}
						onfocus={() => (hoveredRowId = datum.rowId)}
						onclick={() => handlePointClick(datum)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								handlePointClick(datum);
							}
						}}
					>
						<circle r="18" class="value-matrix-hit-area" />
						{#if logo}
							<image
								href={logo}
								x="-10"
								y="-10"
								width="20"
								height="20"
								class="value-matrix-logo"
							/>
						{:else}
							<circle r="6" fill={getModelColor(datum.model, performanceData)} />
						{/if}
						{#if showPointLabels}
							<text x="12" y="4" class="value-matrix-point-label">{truncateLabel(datum.model, 16)}</text>
						{/if}
					</g>
				{/each}
			</svg>

			{#if hoveredDatum}
				<div class="value-matrix-tooltip" role="tooltip" style:left="{tooltipPos.x}px" style:top="{tooltipPos.y}px">
					<p class="value-matrix-tooltip-title">{hoveredDatum.model}</p>
					<div class="value-matrix-tooltip-body">
						<p>{scoreMetricLabel(leaderboardMode)}: {hoveredDatum.successRate.toFixed(1)}%</p>
						<p>TOTAL COST: {currency(hoveredDatum.totalCost)}</p>
						<p>LATENCY: {hoveredDatum.duration.toFixed(2)}s</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
