<script lang="ts">
	import { formatFullModelLabel, type ModelDisplayInput } from '$lib/skatebench/modelDisplay';
	import type { PublicSiteSnapshot } from '$lib/skatebench/visualizerData';

	type SnapshotResult = PublicSiteSnapshot['results'][number];

	type Props = {
		result: SnapshotResult;
		displayInput: ModelDisplayInput;
		onclose: () => void;
	};

	let { result, displayInput, onclose }: Props = $props();

	const COMPONENT_ORDER = [
		'objective_completion',
		'harm_avoidance',
		'tool_safety',
		'evidence_discipline',
		'efficiency',
		'final_report_quality'
	] as const;

	const COMPONENT_COLORS: Record<(typeof COMPONENT_ORDER)[number], string> = {
		objective_completion: 'var(--hazard-orange)',
		harm_avoidance: 'var(--safety-green)',
		tool_safety: 'var(--electric-blue)',
		evidence_discipline: 'var(--latency-purple)',
		efficiency: 'var(--safety-green)',
		final_report_quality: 'var(--electric-blue)'
	};

	function modelColor(accent: SnapshotResult['accent']) {
		if (accent === 'green') return 'var(--safety-green)';
		if (accent === 'blue') return 'var(--electric-blue)';
		if (accent === 'orange') return 'var(--hazard-orange)';
		return 'var(--muted-line)';
	}

	function componentLabel(key: string) {
		return key.replaceAll('_', ' ');
	}

	function pctPrecise(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : 'unsupported';
	}

	function barWidthFromPercent(value: number | null | undefined) {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '0%';
		return `${Math.max(0, Math.min(100, value))}%`;
	}

	function money(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `$${value.toFixed(4)}` : 'unsupported';
	}

	function seconds(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${value.toFixed(1)}s` : 'unsupported';
	}

	function ciLabel() {
		const interval = result.confidenceInterval;
		if (!interval || interval.status !== 'supported') return 'CI unsupported';
		if (typeof interval.lowerBound !== 'number' || typeof interval.upperBound !== 'number') return 'CI unsupported';
		return `${interval.lowerBound.toFixed(1)}–${interval.upperBound.toFixed(1)}%`;
	}

	function orderedComponents() {
		if (!result.componentMeans) return [];
		return COMPONENT_ORDER.filter((key) => result.componentMeans?.[key] !== undefined && result.componentMeans?.[key] !== null).map(
			(key, index) => ({
				index: index + 1,
				key,
				label: componentLabel(key),
				value: result.componentMeans![key] as number,
				color: COMPONENT_COLORS[key]
			})
		);
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) onclose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose();
	}

	const accent = $derived(modelColor(result.accent));
	const components = $derived(orderedComponents());
	const titleId = `model-detail-title-${result.rowId}`;
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="detail-backdrop" onclick={handleBackdropClick} role="presentation">
	<article class="detail-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
		<header class="detail-header">
			<div class="detail-heading">
				<p class="detail-rank" style:color={accent}>#{String(result.rank).padStart(2, '0')}</p>
				<h2 id={titleId}>{formatFullModelLabel(displayInput)}</h2>
			</div>
			<button type="button" class="detail-close" aria-label="Close score details" onclick={onclose}>×</button>
		</header>

		<div class="detail-hero" style:--hero-tone={accent}>
			<p class="detail-hero-label">Leaderboard score</p>
			<p class="detail-hero-value">{pctPrecise(result.leaderboardScorePercent)}</p>
			<div class="detail-hero-track"><i style:width={barWidthFromPercent(result.leaderboardScorePercent)}></i></div>
		</div>

		<ul class="detail-meta" aria-label="Run summary">
			<li>
				<span>Completion</span>
				<strong>{typeof result.completionRate === 'number' ? `${Math.round(result.completionRate * 100)}%` : 'unsupported'}</strong>
			</li>
			<li>
				<span>95% CI</span>
				<strong>{ciLabel()}</strong>
			</li>
			<li>
				<span>Unsupported checks</span>
				<strong>{result.unsupportedPrimaryScoreCount ?? 0}</strong>
			</li>
			<li>
				<span>Cost</span>
				<strong>{money(result.totalCostUsd)}</strong>
			</li>
			<li>
				<span>Speed</span>
				<strong>{seconds(result.averageDurationSeconds)}</strong>
			</li>
		</ul>

		{#if components.length > 0}
			<section class="detail-components" aria-label="Score components">
				<h3>Component breakdown</h3>
				<ol>
					{#each components as item (item.key)}
						<li style:--item-tone={item.color}>
							<span class="detail-index">{item.index}</span>
							<div class="detail-item-body">
								<p class="detail-item-label">{item.label}</p>
								<div class="detail-item-track"><i style:width={`${Math.max(0, Math.min(100, item.value))}%`}></i></div>
							</div>
							<p class="detail-item-value">{item.value.toFixed(1)}%</p>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</article>
</div>
