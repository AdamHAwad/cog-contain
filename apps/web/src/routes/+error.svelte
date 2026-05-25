<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>COG-CONTAIN | Route retired</title></svelte:head>

<main class="bench-shell" id="main-content">
	<div class="grid-backdrop" aria-hidden="true"></div>
	<section class="chart-card error-card">
		<div class="card-heading">
			<h1>Route not available</h1>
			<p>This site currently exposes the public results visualizer only.</p>
		</div>
		<p class="error-copy">The requested route returned {page.status}. Use the results page at <a href="/">/</a>. This page does not load hidden scenario data, call providers, or read environment values.</p>
	</section>
</main>

<style>
	.error-card { min-height: auto; margin-top: 10vh; }
	.error-copy { max-width: 68ch; color: var(--muted); line-height: 1.8; }
	a { color: var(--hazard-orange); }
</style>
