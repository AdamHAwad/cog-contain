<script lang="ts">
	import IconFileReport from '@tabler/icons-svelte/icons/file-report';
	import IconFileText from '@tabler/icons-svelte/icons/file-text';
	import IconLock from '@tabler/icons-svelte/icons/lock';
	import IconMessages from '@tabler/icons-svelte/icons/messages';
	import IconRadar from '@tabler/icons-svelte/icons/radar';
	import IconRobot from '@tabler/icons-svelte/icons/robot';
	import type { Component } from 'svelte';

	type Tool = {
		label: string;
		tone: string;
		icon: Component<{ size?: number; stroke?: number; color?: string }>;
		linkX: number;
	};

	const tools: Tool[] = [
		{ label: 'Documents', tone: 'var(--safety-green)', icon: IconFileText, linkX: 50 },
		{ label: 'Sensors', tone: 'var(--electric-blue)', icon: IconRadar, linkX: 150 },
		{ label: 'Messages', tone: 'var(--latency-purple)', icon: IconMessages, linkX: 250 },
		{ label: 'Containment', tone: 'var(--hazard-orange)', icon: IconLock, linkX: 350 },
		{ label: 'Final report', tone: 'var(--muted-line)', icon: IconFileReport, linkX: 450 }
	];

	const agentX = 250;
</script>

<figure class="agent-env-diagram" aria-label="Agent connected to facility tools">
	<div class="agent-env-layout">
		<div class="agent-env-agent">
			<div class="agent-env-agent-ring">
				<IconRobot size={26} stroke={1.75} color="var(--hazard-orange)" aria-hidden="true" />
			</div>
			<p class="agent-env-agent-label">Incident agent</p>
		</div>

		<svg class="agent-env-links" viewBox="0 0 500 44" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
			{#each tools as tool (tool.label)}
				<path
					class="agent-env-link"
					d="M {agentX} 2 C {agentX} 18, {tool.linkX} 18, {tool.linkX} 42"
					stroke={tool.tone}
				/>
			{/each}
		</svg>

		<ul class="agent-env-tools">
			{#each tools as tool (tool.label)}
				<li style:--tool-tone={tool.tone}>
					<div class="agent-env-node">
						<tool.icon size={22} stroke={1.75} color={tool.tone} aria-hidden="true" />
					</div>
					<span class="agent-env-label">{tool.label}</span>
				</li>
			{/each}
		</ul>
	</div>
</figure>
