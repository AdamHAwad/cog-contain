<script lang="ts">
	import { CustomMark, GridX, GridY, HTMLTooltip, Plot, Text } from 'svelteplot';
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
	import type { PublicSiteSnapshot } from '$lib/skatebench/visualizerData';

	type SnapshotResult = PublicSiteSnapshot['results'][number];

	type Props = {
		results: SnapshotResult[];
		leaderboardMode: boolean;
		displayInput: (result: SnapshotResult) => ModelDisplayInput;
		onPointClick?: (rowId: string) => void;
	};

	let { results, leaderboardMode, displayInput, onPointClick }: Props = $props();

	const performanceData = $derived(
		buildPerformanceData(results, leaderboardMode, (row) => formatFullModelLabel(displayInput(row)))
	);

	let innerWidth = $state(1024);
	const isMobile = $derived(innerWidth <= 820);

	function openDatum(datum: PerformanceDatum) {
		onPointClick?.(datum.rowId);
	}

	function keydownDatum(datum: PerformanceDatum, event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		openDatum(datum);
	}
</script>

<svelte:window bind:innerWidth />

<div class="value-matrix">
	{#if performanceData.length === 0}
		<p class="value-matrix-empty">No models have both cost and {scoreMetricLabel(leaderboardMode).toLowerCase()} data.</p>
	{:else}
		<div class="value-matrix-chart">
			<Plot
				height={500}
				margin={{ ...MATRIX_CHART_MARGIN, right: isMobile ? 20 : MATRIX_CHART_MARGIN.right }}
				x={{
					type: 'log',
					domain: MATRIX_COST_DOMAIN,
					ticks: MATRIX_COST_TICKS,
					tickFormat: (val) => `$${val}`,
					axis: 'bottom',
					label: 'TOTAL COST ($) LOG SCALE',
					labelAnchor: 'center'
				}}
				y={{
					type: 'linear',
					domain: MATRIX_SCORE_DOMAIN,
					ticks: [0, 25, 50, 75, 100],
					tickFormat: (val) => String(val),
					axis: 'left',
					label: scoreAxisLabel(leaderboardMode),
					labelAnchor: 'middle'
				}}
			>
				<GridX stroke="rgba(255,255,255,0.03)" />
				<GridY stroke="rgba(255,255,255,0.03)" />

				<CustomMark data={performanceData} x="totalCost" y="successRate">
					{#snippet mark({ record })}
						{@const datum = record.datum as PerformanceDatum}
						{@const logoUrl = getModelLogo(datum.originalModel)}
						{@const color = getModelColor(datum.originalModel, performanceData)}
						<g
							class="value-matrix-point"
							role="button"
							tabindex="0"
							aria-label={`${datum.model}, ${datum.successRate.toFixed(1)}%, ${currency(datum.totalCost)}`}
							onclick={() => openDatum(datum)}
							onkeydown={(event) => keydownDatum(datum, event)}
						>
							<circle cx={record.x} cy={record.y} r="18" class="value-matrix-hit-area" />
							{#if logoUrl}
								<image
									href={logoUrl}
									x={record.x! - 10}
									y={record.y! - 10}
									width="20"
									height="20"
									class="value-matrix-logo"
								/>
							{:else}
								<circle cx={record.x} cy={record.y} r="6" fill={color} class="value-matrix-fallback-dot" />
							{/if}
						</g>
					{/snippet}
				</CustomMark>

				{#if !isMobile}
					<Text
						data={performanceData}
						x="totalCost"
						y="successRate"
						dx={12}
						dy={4}
						text={(d) => truncateLabel((d as PerformanceDatum).model, 16)}
						textClass="value-matrix-point-label"
						fontSize={10}
						fontWeight={700}
						textTransform="uppercase"
					/>
				{/if}

				{#snippet overlay()}
					<HTMLTooltip data={performanceData} x="totalCost" y="successRate">
						{#snippet children({ datum })}
							{#if datum}
								<div class="value-matrix-tooltip" role="tooltip">
									<p class="value-matrix-tooltip-title">{datum.model}</p>
									<div class="value-matrix-tooltip-body">
										<p>{scoreMetricLabel(leaderboardMode)}: {datum.successRate.toFixed(1)}%</p>
										<p>TOTAL COST: {currency(datum.totalCost)}</p>
										<p>LATENCY: {datum.duration.toFixed(2)}s</p>
									</div>
								</div>
							{/if}
						{/snippet}
					</HTMLTooltip>
				{/snippet}
			</Plot>
		</div>
	{/if}
</div>
