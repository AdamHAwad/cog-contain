<script lang="ts">
	import ContainmentMark from '$lib/skatebench/ContainmentMark.svelte';
	import type { VisualizerModelResult } from '$lib/skatebench/visualizerData';

	let { data } = $props();

	type TabId = 'accuracy' | 'cost' | 'speed';

	const tabs: { id: TabId; label: string; tone: string }[] = [
		{ id: 'accuracy', label: 'Accuracy', tone: 'var(--safety-green)' },
		{ id: 'cost', label: 'Cost', tone: 'var(--electric-blue)' },
		{ id: 'speed', label: 'Speed', tone: 'var(--latency-purple)' }
	];

	let activeTab = $state<TabId>('accuracy');
	let selectedRowsOverride = $state<string[] | undefined>(undefined);
	const defaultSelectedRows = $derived(data.visualizerSnapshot.results.slice(0, 6).map((result) => result.rowId));
	const selectedRows = $derived(selectedRowsOverride ?? defaultSelectedRows);

	const repeatCount = 0;
	const visualizerSnapshot = $derived(data.visualizerSnapshot);
	const activeTone = $derived(tabs.find((tab) => tab.id === activeTab)?.tone ?? 'var(--hazard-orange)');
	const filteredResults = $derived(visualizerSnapshot.results.filter((result) => selectedRows.includes(result.rowId)));
	const accuracyRows = $derived([...filteredResults].sort((a, b) => supportedNumber(b.accuracyPercent) - supportedNumber(a.accuracyPercent)));
	const costRows = $derived([...filteredResults].sort((a, b) => supportedNumber(a.totalCostUsd) - supportedNumber(b.totalCostUsd)));
	const speedRows = $derived([...filteredResults].sort((a, b) => supportedNumber(a.averageDurationSeconds) - supportedNumber(b.averageDurationSeconds)));
	const maxAccuracy = $derived(Math.max(1, ...filteredResults.map((result) => supportedNumber(result.accuracyPercent))));
	const maxCost = $derived(Math.max(0.000001, ...filteredResults.map((result) => supportedNumber(result.totalCostUsd))));
	const maxDuration = $derived(Math.max(0.001, ...filteredResults.map((result) => supportedNumber(result.averageDurationSeconds))));

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

	function modelColor(result: Pick<VisualizerModelResult, 'accent'>) {
		if (result.accent === 'green') return 'var(--safety-green)';
		if (result.accent === 'blue') return 'var(--electric-blue)';
		if (result.accent === 'orange') return 'var(--hazard-orange)';
		return 'var(--muted-line)';
	}

	function supportedNumber(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? value : 0;
	}

	function pct(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : 'unsupported';
	}

	function money(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `$${value.toFixed(6)}` : 'unsupported';
	}

	function seconds(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${value.toFixed(3)}s` : 'unsupported';
	}

	function providerName(value: string) {
		if (value === 'openai') return 'OpenAI';
		if (value === 'openrouter') return 'OpenRouter';
		return value;
	}

	function modelName(result: Pick<VisualizerModelResult, 'model' | 'thinkingLevel' | 'providerThinkingEffort'>) {
		const effort = result.providerThinkingEffort ?? result.thinkingLevel;
		return effort ? `${result.model} ${effort}` : result.model;
	}
</script>

<svelte:head>
	<title>COG-CONTAIN | Official Results</title>
	<meta name="description" content="Official COG-CONTAIN benchmark results showing accuracy, cost, and speed by provider and model." />
</svelte:head>

<main class="bench-shell" id="main-content">
	<div class="noise" aria-hidden="true"></div>
	<div class="grid-backdrop" aria-hidden="true"></div>

	<header class="bench-header">
		<div class="brand-lockup">
			<div class="mark-wrap"><ContainmentMark /></div>
			<div>
				<h1 class="stencil">COG<span>CONTAIN</span></h1>
				<p class="data-line"><span></span> Official Results</p>
			</div>
		</div>
		<div class="system-readout" aria-label="Result metadata">
			<p>Models: {visualizerSnapshot.metadata.modelCount}</p>
			<p>Scenarios: {visualizerSnapshot.metadata.scenarioCount}</p>
			<p>Updated: {visualizerSnapshot.metadata.updated}</p>
		</div>
	</header>

	<section class="control-row" aria-label="Result controls">
		<nav class="tabs" aria-label="Metric views">
			{#each tabs as tab (tab.id)}
				<button class:active={activeTab === tab.id} style:--tab-tone={tab.tone} onclick={() => (activeTab = tab.id)}>{tab.label}</button>
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
						<span>{providerName(result.provider)}</span>{modelName(result)}
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
		{:else if activeTab === 'accuracy'}
			<div class="card-heading">
				<h2>Accuracy</h2>
				<p>Percent score from the recorded benchmark artifacts.</p>
			</div>
			<div class="bar-list">
				{#each accuracyRows as result (result.rowId)}
					<div class="bar-row top-row">
						<p class="rank" style:color={modelColor(result)}>{String(result.rank).padStart(2, '0')}</p>
						<p class="model"><span>{providerName(result.provider)}</span>{modelName(result)}</p>
						<div class="track"><i style:width={`${(supportedNumber(result.accuracyPercent) / maxAccuracy) * 100}%`} style:background={modelColor(result)}></i></div>
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
						<p class="model"><span>{providerName(result.provider)}</span>{modelName(result)}</p>
						<div class="track"><i style:width={`${Math.max(3, (supportedNumber(result.totalCostUsd) / maxCost) * 100)}%`} style:background={modelColor(result)}></i></div>
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
						<p class="model"><span>{providerName(result.provider)}</span>{modelName(result)}</p>
						<div class="track"><i style:width={`${Math.max(3, (supportedNumber(result.averageDurationSeconds) / maxDuration) * 100)}%`} style:background={modelColor(result)}></i></div>
						<p class="value">{seconds(result.averageDurationSeconds)}</p>
					</div>
				{/each}
			</div>
		{/if}

		<div class="legend-grid">
			{#each filteredResults as result (result.rowId)}
				<p><span style:color={modelColor(result)}>{result.rank}</span> {providerName(result.provider)} / {modelName(result)}</p>
			{/each}
		</div>
	</section>

	<section class="summary-strip" aria-label="Benchmark summary">
		<div><strong>{visualizerSnapshot.metadata.scenarioCount}</strong><span>scenarios</span></div>
		<div><strong>{repeatCount}</strong><span>repeats</span></div>
		<div><strong>{visualizerSnapshot.metadata.modelCount}</strong><span>models</span></div>
		<div><strong>Official</strong><span>results</span></div>
	</section>

	<section class="caveats">
		<h2>About these results</h2>
		<p>These are official benchmark results from the hidden scenario suite. Example scenarios are available in the repository for local development only.</p>
		<p>All scenario content is original COG-CONTAIN fiction inspired by containment-style settings. No real SCP entries, names, item numbers, object classes, logos, or SCP-specific language are used.</p>
	</section>
</main>
