<script lang="ts">
	import ContainmentMark from '$lib/skatebench/ContainmentMark.svelte';
	import ModelDetailModal from '$lib/skatebench/ModelDetailModal.svelte';
	import {
		formatFullModelLabel,
		formatModelLine,
		inferModelLab
	} from '$lib/skatebench/modelDisplay';
	import type { PublicSiteSnapshot } from '$lib/skatebench/visualizerData';

	type SnapshotResult = PublicSiteSnapshot['results'][number];

	let { data } = $props();

	type TabId = 'leaderboard' | 'accuracy' | 'cost' | 'speed';

	const visualizerSnapshot = $derived(data.visualizerSnapshot);
	const leaderboardMode = $derived(visualizerSnapshot.metadata.leaderboardEligible === true);
	const tabs = $derived(
		leaderboardMode
			? ([
					{ id: 'leaderboard' as const, label: 'Leaderboard score', tone: 'var(--safety-green)' },
					{ id: 'cost' as const, label: 'Cost', tone: 'var(--electric-blue)' },
					{ id: 'speed' as const, label: 'Speed', tone: 'var(--latency-purple)' }
				] satisfies { id: TabId; label: string; tone: string }[])
			: ([
					{ id: 'accuracy' as const, label: 'Accuracy', tone: 'var(--safety-green)' },
					{ id: 'cost' as const, label: 'Cost', tone: 'var(--electric-blue)' },
					{ id: 'speed' as const, label: 'Speed', tone: 'var(--latency-purple)' }
				] satisfies { id: TabId; label: string; tone: string }[])
	);

	let activeTabOverride = $state<TabId | undefined>(undefined);
	const activeTab = $derived(activeTabOverride ?? (leaderboardMode ? 'leaderboard' : 'accuracy'));
	let selectedRowsOverride = $state<string[] | undefined>(undefined);
	let detailModalRowId = $state<string | undefined>(undefined);
	const defaultSelectedRows = $derived(visualizerSnapshot.results.slice(0, 6).map((result) => result.rowId));
	const selectedRows = $derived(selectedRowsOverride ?? defaultSelectedRows);

	const repeatCount = 0;
	const activeTone = $derived(tabs.find((tab) => tab.id === activeTab)?.tone ?? 'var(--hazard-orange)');
	const filteredResults = $derived(visualizerSnapshot.results.filter((result) => selectedRows.includes(result.rowId)));
	const leaderboardRows = $derived(
		[...filteredResults].sort((a, b) => supportedNumber(b.leaderboardScorePercent) - supportedNumber(a.leaderboardScorePercent))
	);
	const accuracyRows = $derived([...filteredResults].sort((a, b) => supportedNumber(b.accuracyPercent) - supportedNumber(a.accuracyPercent)));
	const costRows = $derived([...filteredResults].sort((a, b) => supportedNumber(a.totalCostUsd) - supportedNumber(b.totalCostUsd)));
	const speedRows = $derived([...filteredResults].sort((a, b) => supportedNumber(a.averageDurationSeconds) - supportedNumber(b.averageDurationSeconds)));
	const detailResult = $derived(
		detailModalRowId === undefined ? undefined : visualizerSnapshot.results.find((result) => result.rowId === detailModalRowId)
	);

	/** Fixed chart axes so bar width is not normalized to the current top row. */
	const costAxisMaxUsd = 20;
	const speedAxisMaxSeconds = 300;

	function toggleRow(rowId: string) {
		const current = selectedRowsOverride ?? defaultSelectedRows;
		selectedRowsOverride = current.includes(rowId) ? current.filter((item) => item !== rowId) : [...current, rowId];
	}

	function selectAll() {
		selectedRowsOverride = visualizerSnapshot.results.map((result) => result.rowId);
	}

	function clearSelection() {
		selectedRowsOverride = [];
	}

	function modelColor(result: Pick<SnapshotResult, 'accent'>) {
		if (result.accent === 'green') return 'var(--safety-green)';
		if (result.accent === 'blue') return 'var(--electric-blue)';
		if (result.accent === 'orange') return 'var(--hazard-orange)';
		return 'var(--muted-line)';
	}

	function supportedNumber(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? value : 0;
	}

	/** Bar fill uses absolute 0–100% scale, not relative to the top row on the chart. */
	function barWidthFromPercent(value: number | null | undefined) {
		const pct = supportedNumber(value);
		return `${Math.max(0, Math.min(100, pct))}%`;
	}

	function barWidthFromAxis(value: number | null | undefined, axisMax: number) {
		if (axisMax <= 0) return '0%';
		const pct = (supportedNumber(value) / axisMax) * 100;
		return `${Math.max(0, Math.min(100, pct))}%`;
	}

	function pct(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : 'unsupported';
	}

	function pctPrecise(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : 'unsupported';
	}

	function money(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `$${value.toFixed(6)}` : 'unsupported';
	}

	function seconds(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${value.toFixed(3)}s` : 'unsupported';
	}

	function displayInput(result: SnapshotResult) {
		return {
			provider: result.provider,
			model: result.model,
			thinkingLevel: result.thinkingLevel,
			providerThinkingEffort: result.providerThinkingEffort,
			rowId: result.rowId
		};
	}

	function openDetail(rowId: string) {
		detailModalRowId = rowId;
	}

	function closeDetail() {
		detailModalRowId = undefined;
	}
</script>

<svelte:head>
	<title>COG-CONTAIN | Official Results</title>
	<meta
		name="description"
		content={leaderboardMode
			? 'Official COG-CONTAIN leaderboard results showing versioned scenario utility scores, cost, and speed by provider and model.'
			: 'Official COG-CONTAIN benchmark results showing accuracy, cost, and speed by provider and model.'}
	/>
</svelte:head>

<main class="bench-shell" id="main-content">
	<div class="noise" aria-hidden="true"></div>
	<div class="grid-backdrop" aria-hidden="true"></div>

	<header class="bench-header">
		<div class="brand-lockup">
			<div class="mark-wrap"><ContainmentMark /></div>
			<div>
				<h1 class="stencil">COG<span>CONTAIN</span></h1>
				<p class="data-line"><span></span> {leaderboardMode ? 'Official Leaderboard Results' : 'Official Results'}</p>
			</div>
		</div>
		<div class="system-readout" aria-label="Result metadata">
			<p>Models: {visualizerSnapshot.metadata.modelCount}</p>
			<p>Scenarios: {visualizerSnapshot.metadata.scenarioCount}</p>
			<p>Updated: {visualizerSnapshot.metadata.updated}</p>
			{#if leaderboardMode && visualizerSnapshot.metadata.runProtocol}
				<p>Protocol: {visualizerSnapshot.metadata.runProtocol}</p>
			{/if}
		</div>
	</header>

	<section class="control-row" aria-label="Result controls">
		<nav class="tabs" aria-label="Metric views">
			{#each tabs as tab (tab.id)}
				<button class:active={activeTab === tab.id} style:--tab-tone={tab.tone} onclick={() => (activeTabOverride = tab.id)}>{tab.label}</button>
			{/each}
		</nav>
		<details class="filter-menu">
			<summary>Filter models [{selectedRows.length}/{visualizerSnapshot.results.length}]</summary>
			<div class="filter-panel">
				<div class="filter-actions">
					<button onclick={selectAll}>Select all</button>
					<button onclick={clearSelection}>Clear</button>
				</div>
				{#each visualizerSnapshot.results as result (result.rowId)}
					<label>
						<input type="checkbox" checked={selectedRows.includes(result.rowId)} onchange={() => toggleRow(result.rowId)} />
						<span>{inferModelLab(result.model, result.provider)}</span> {formatModelLine(displayInput(result))}
					</label>
				{/each}
			</div>
		</details>
	</section>

	<section class="chart-card" style:--active-tone={activeTone}>
		{#if filteredResults.length === 0}
			<div class="card-heading empty-state">
				<h2>No results yet</h2>
				<p>Run the example benchmark locally to see your own results here.</p>
			</div>
		{:else if activeTab === 'leaderboard'}
			<div class="card-heading">
				<h2>Leaderboard score</h2>
				<p>Average score across the official 40-scenario benchmark. Click a model row for score breakdown.</p>
			</div>
			<div class="bar-list">
				{#each leaderboardRows as result (result.rowId)}
					<button type="button" class="bar-row top-row clickable" onclick={() => openDetail(result.rowId)}>
						<p class="rank" style:color={modelColor(result)}>{String(result.rank).padStart(2, '0')}</p>
						<p class="model"><span>{inferModelLab(result.model, result.provider)}</span> {formatModelLine(displayInput(result))}</p>
						<div class="track"><i style:width={barWidthFromPercent(result.leaderboardScorePercent)} style:background={modelColor(result)}></i></div>
						<p class="value">{pctPrecise(result.leaderboardScorePercent)}</p>
					</button>
				{/each}
			</div>
		{:else if activeTab === 'accuracy'}
			<div class="card-heading">
				<h2>Accuracy</h2>
				<p>{leaderboardMode ? 'Foundation accuracy is not the primary leaderboard metric.' : 'Percent score from the recorded benchmark artifacts.'}</p>
			</div>
			<div class="bar-list">
				{#each accuracyRows as result (result.rowId)}
					<div class="bar-row top-row">
						<p class="rank" style:color={modelColor(result)}>{String(result.rank).padStart(2, '0')}</p>
						<p class="model"><span>{inferModelLab(result.model, result.provider)}</span> {formatModelLine(displayInput(result))}</p>
						<div class="track"><i style:width={barWidthFromPercent(result.accuracyPercent)} style:background={modelColor(result)}></i></div>
						<p class="value">{pct(result.accuracyPercent)}</p>
					</div>
				{/each}
			</div>
		{:else if activeTab === 'cost'}
			<div class="card-heading">
				<h2>Cost</h2>
				<p>Total provider cost for the recorded run.</p>
			</div>
			<div class="bar-list">
				{#each costRows as result (result.rowId)}
					<div class="bar-row">
						<p class="rank" style:color={modelColor(result)}>{String(result.rank).padStart(2, '0')}</p>
						<p class="model"><span>{inferModelLab(result.model, result.provider)}</span> {formatModelLine(displayInput(result))}</p>
						<div class="track"><i style:width={barWidthFromAxis(result.totalCostUsd, costAxisMaxUsd)} style:background={modelColor(result)}></i></div>
						<p class="value">{money(result.totalCostUsd)}</p>
					</div>
				{/each}
			</div>
		{:else if activeTab === 'speed'}
			<div class="card-heading">
				<h2>Speed</h2>
				<p>Average time per scenario.</p>
			</div>
			<div class="bar-list">
				{#each speedRows as result (result.rowId)}
					<div class="bar-row">
						<p class="rank" style:color={modelColor(result)}>{String(result.rank).padStart(2, '0')}</p>
						<p class="model"><span>{inferModelLab(result.model, result.provider)}</span> {formatModelLine(displayInput(result))}</p>
						<div class="track"><i style:width={barWidthFromAxis(result.averageDurationSeconds, speedAxisMaxSeconds)} style:background={modelColor(result)}></i></div>
						<p class="value">{seconds(result.averageDurationSeconds)}</p>
					</div>
				{/each}
			</div>
		{/if}

		<div class="legend-grid">
			{#each filteredResults as result (result.rowId)}
				<p><span style:color={modelColor(result)}>{result.rank}</span> {formatFullModelLabel(displayInput(result))}</p>
			{/each}
		</div>
	</section>

	{#if detailResult}
		<ModelDetailModal result={detailResult} displayInput={displayInput(detailResult)} onclose={closeDetail} />
	{/if}

	<section class="summary-strip" aria-label="Benchmark summary">
		<div><strong>{visualizerSnapshot.metadata.scenarioCount}</strong><span>scenarios</span></div>
		<div><strong>{repeatCount}</strong><span>repeats</span></div>
		<div><strong>{visualizerSnapshot.metadata.modelCount}</strong><span>models</span></div>
		<div><strong>{leaderboardMode ? 'Leaderboard' : 'Official'}</strong><span>results</span></div>
	</section>

	<section class="caveats">
		<h2>About these results</h2>
		{#if leaderboardMode}
			<p>These are official leaderboard results from the hidden scenario suite quality benchmark protocol ({visualizerSnapshot.metadata.scoreKind ?? 'leaderboard-score-v1'}).</p>
		{:else}
			<p>These are official foundation benchmark results from the hidden scenario suite. The displayed accuracy reflects the prior one-tool foundation protocol and is not a leaderboard-grade score.</p>
		{/if}
		<p>Example scenarios are available in the repository for local development only.</p>
		<p>All scenario content is original COG-CONTAIN fiction inspired by containment-style settings. No real SCP entries, names, item numbers, object classes, logos, or SCP-specific language are used.</p>
	</section>
</main>
