<script lang="ts">
	const agent = { x: 200, y: 44 };
	const tools = [
		{ label: 'Documents', tone: 'var(--safety-green)', x: 56, y: 148, icon: 'documents' },
		{ label: 'Sensors', tone: 'var(--electric-blue)', x: 112, y: 158, icon: 'sensors' },
		{ label: 'Messages', tone: 'var(--latency-purple)', x: 200, y: 164, icon: 'messages' },
		{ label: 'Containment', tone: 'var(--hazard-orange)', x: 288, y: 158, icon: 'containment' },
		{ label: 'Final report', tone: 'var(--muted-line)', x: 344, y: 148, icon: 'report' }
	] as const;
</script>

<figure class="agent-env-diagram" aria-label="Agent connected to facility tools">
	<svg viewBox="0 0 400 228" role="img" aria-hidden="true">
		<defs>
			<linearGradient id="agent-env-glow" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color="oklch(0.72 0.19 45 / 0.35)" />
				<stop offset="100%" stop-color="oklch(0.76 0.18 150 / 0.12)" />
			</linearGradient>
		</defs>

		{#each tools as tool (tool.label)}
			<path
				class="agent-env-link"
				d="M {agent.x} {agent.y + 22} C {agent.x} {agent.y + 52}, {tool.x} {tool.y - 38}, {tool.x} {tool.y - 20}"
				stroke={tool.tone}
			/>
		{/each}

		<circle cx={agent.x} cy={agent.y} r="32" class="agent-env-agent-ring" />
		<circle cx={agent.x} cy={agent.y} r="24" fill="url(#agent-env-glow)" />
		<g transform="translate({agent.x - 14}, {agent.y - 17})" class="agent-env-agent-icon">
			<line x1="14" y1="2" x2="14" y2="5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
			<circle cx="14" cy="1.5" r="1.4" fill="currentColor" />
			<rect x="6" y="5" width="16" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" />
			<circle cx="10.5" cy="10.5" r="1.3" fill="currentColor" />
			<circle cx="17.5" cy="10.5" r="1.3" fill="currentColor" />
			<rect x="7" y="17" width="14" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
			<line x1="4" y1="18" x2="7" y2="18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
			<line x1="22" y1="18" x2="25" y2="18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
		</g>

		{#each tools as tool (tool.label)}
			<g transform="translate({tool.x - 22}, {tool.y - 22})">
				<rect width="44" height="44" rx="10" class="agent-env-node" stroke={tool.tone} />
				<g
					transform="translate(12, 11)"
					stroke={tool.tone}
					fill="none"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#if tool.icon === 'documents'}
						<path d="M4 2 H14 V18 H4 Z" />
						<path d="M7 6 H11 M7 10 H11 M7 14 H9" />
					{:else if tool.icon === 'sensors'}
						<circle cx="10" cy="10" r="2.2" fill={tool.tone} stroke="none" />
						<path
							d="M10 2 V4 M10 16 V18 M2 10 H4 M16 10 H18 M4.8 4.8 L6.2 6.2 M13.8 13.8 L15.2 15.2 M15.2 4.8 L13.8 6.2 M6.2 13.8 L4.8 15.2"
						/>
					{:else if tool.icon === 'messages'}
						<path d="M3 4 H17 V14 H10 L6 17 V14 H3 Z" />
					{:else if tool.icon === 'containment'}
						<rect x="4" y="8" width="12" height="10" rx="2" />
						<path d="M7 8 V6 C7 4.3 8.3 3 10 3 C11.7 3 13 4.3 13 6 V8" />
					{:else}
						<path d="M6 3 H14 L17 6 V17 H3 V6 Z" />
						<path d="M7 11 L9.5 13.5 L14 9" />
					{/if}
				</g>
			</g>
			<text x={tool.x} y={tool.y + 34} class="agent-env-label" fill={tool.tone}>{tool.label}</text>
		{/each}

		<text x={agent.x} y={agent.y + 46} class="agent-env-agent-label">Incident agent</text>
	</svg>
</figure>
