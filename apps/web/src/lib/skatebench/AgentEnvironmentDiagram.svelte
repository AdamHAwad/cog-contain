<script lang="ts">
	import IconFileReport from '@tabler/icons-svelte/icons/file-report';
	import IconFileText from '@tabler/icons-svelte/icons/file-text';
	import IconLock from '@tabler/icons-svelte/icons/lock';
	import IconMessages from '@tabler/icons-svelte/icons/messages';
	import IconRadar from '@tabler/icons-svelte/icons/radar';
	import IconRobot from '@tabler/icons-svelte/icons/robot';

	const links = [
		{ tone: 'var(--safety-green)', linkX: 50 },
		{ tone: 'var(--electric-blue)', linkX: 150 },
		{ tone: 'var(--latency-purple)', linkX: 250 },
		{ tone: 'var(--hazard-orange)', linkX: 350 },
		{ tone: 'var(--muted-line)', linkX: 450 }
	] as const;

	const agentX = 250;
</script>

<figure class="agent-env-diagram" aria-label="Agent connected to facility tools">
	<div class="agent-env-layout">
		<div class="agent-env-agent">
			<div class="agent-env-agent-ring" aria-hidden="true">
				<IconRobot size={26} stroke={1.75} color="var(--hazard-orange)" />
			</div>
			<p class="agent-env-agent-label">Incident agent</p>
		</div>

		<svg class="agent-env-links" viewBox="0 0 500 44" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
			{#each links as link (link.linkX)}
				<path
					class="agent-env-link"
					d="M {agentX} 2 C {agentX} 18, {link.linkX} 18, {link.linkX} 42"
					stroke={link.tone}
				/>
			{/each}
		</svg>

		<ul class="agent-env-tools">
			<li style:--tool-tone="var(--safety-green)">
				<div class="agent-env-node" aria-hidden="true"><IconFileText size={22} stroke={1.75} color="var(--safety-green)" /></div>
				<span class="agent-env-label">Documents</span>
			</li>
			<li style:--tool-tone="var(--electric-blue)">
				<div class="agent-env-node" aria-hidden="true"><IconRadar size={22} stroke={1.75} color="var(--electric-blue)" /></div>
				<span class="agent-env-label">Sensors</span>
			</li>
			<li style:--tool-tone="var(--latency-purple)">
				<div class="agent-env-node" aria-hidden="true"><IconMessages size={22} stroke={1.75} color="var(--latency-purple)" /></div>
				<span class="agent-env-label">Messages</span>
			</li>
			<li style:--tool-tone="var(--hazard-orange)">
				<div class="agent-env-node" aria-hidden="true"><IconLock size={22} stroke={1.75} color="var(--hazard-orange)" /></div>
				<span class="agent-env-label">Containment</span>
			</li>
			<li style:--tool-tone="var(--muted-line)">
				<div class="agent-env-node" aria-hidden="true"><IconFileReport size={22} stroke={1.75} color="var(--muted-line)" /></div>
				<span class="agent-env-label">Final report</span>
			</li>
		</ul>
	</div>
</figure>
