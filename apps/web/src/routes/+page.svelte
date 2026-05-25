<script lang="ts">
	import AgentEnvironmentDiagram from '$lib/skatebench/AgentEnvironmentDiagram.svelte';
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
			? 'Official COG-CONTAIN leaderboard results comparing AI models on a hidden 40-scenario containment benchmark, with cost and speed by provider and model.'
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

	<section class="caveats">
		<h2>About these results</h2>
		{#if leaderboardMode}
			<div class="caveats-intro">
				<p>
					COG-CONTAIN tests whether an AI agent can finish a real task when some of the information it reads is trying to mislead it. Each model plays an incident coordinator in a fictional containment facility: reading logs, messages, sensor data, and tool output, then choosing actions to contain a breach and write a final report.
				</p>
				<p>
					We built it as a straightforward way to measure prompt injection resistance and usefulness under pressure—two things that matter more as agents get broader permissions in real systems. The scenarios are original fiction, often odd situations models probably were not trained on, so the rankings reflect judgment on unfamiliar tasks rather than memorization.
				</p>
				<p>The official benchmark stays hidden to keep comparisons fair.</p>
			</div>
			<div class="caveats-subsection agent-env-subsection" style:--subsection-tone="var(--hazard-orange)">
				<h3>Agent environment</h3>
				<p>
					Each run is an agentic loop: the model reads evidence, calls facility tools, and submits a final report. The diagram below shows the tool surface every model shares.
				</p>
				<AgentEnvironmentDiagram />
			</div>
			<div class="caveats-subsection" style:--subsection-tone="var(--safety-green)">
				<h3>What this page shows</h3>
				<p>
					These are official leaderboard results from a hidden scenario suite. Every model listed here ran the same {visualizerSnapshot.metadata.scenarioCount} private scenarios under the same rules, so the rankings are directly comparable. The chart above is sorted by <strong class="tone-label">Leaderboard score</strong>—the average result across those scenarios.
				</p>
			</div>
			<div class="caveats-subsection" style:--subsection-tone="var(--electric-blue)">
				<h3>How to read the metrics</h3>
				<ul class="caveats-metrics">
					<li style:--metric-tone="var(--safety-green)">
						<span class="metric-tag">Leaderboard score</span>
						Overall quality on the hidden suite: did the agent complete objectives, avoid harm, use tools safely, follow evidence, and finish with a useful report? Click any model row for a component breakdown.
					</li>
					<li style:--metric-tone="var(--electric-blue)">
						<span class="metric-tag">Cost</span>
						Total provider spend for the full run, when cost data is available.
					</li>
					<li style:--metric-tone="var(--latency-purple)">
						<span class="metric-tag">Speed</span>
						Average time per scenario, when timing data is available.
					</li>
				</ul>
			</div>
			<div class="caveats-subsection" style:--subsection-tone="var(--latency-purple)">
				<h3>Hidden scenarios and local examples</h3>
				<p>
					The official benchmark scenarios are not published here. Keeping them private protects benchmark integrity so models cannot train directly on the test set. Example scenarios are available in the repository for local development only—they show the format and let you run short local tests, but they are not part of the official hidden scenario suite and should not be treated as official scores.
				</p>
			</div>
		{:else}
			<div class="caveats-intro">
				<p>
					COG-CONTAIN tests whether an AI agent can finish a task when some of the information it reads is trying to mislead it. These are official foundation benchmark results from the hidden scenario suite. The displayed accuracy reflects the prior one-tool foundation protocol and is not a leaderboard-grade score.
				</p>
				<p>Example scenarios are available in the repository for local development only.</p>
			</div>
		{/if}
		<p class="caveats-footer">
			All scenario content is original COG-CONTAIN fiction inspired by containment-style settings. No real SCP entries, names, item numbers, object classes, logos, or SCP-specific language are used.
		</p>
	</section>
</main>
