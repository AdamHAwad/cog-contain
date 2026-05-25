export type ModelDisplayInput = {
	provider: string;
	model: string;
	thinkingLevel?: string;
	providerThinkingEffort?: string;
	resultLabel?: string;
	rowId?: string;
};

const LAB_NAMES: Record<string, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	google: 'Google',
	meta: 'Meta',
	mistral: 'Mistral',
	deepseek: 'DeepSeek',
	qwen: 'Qwen',
	xai: 'xAI'
};

function titleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Model lab / organization shown in the UI (never the routing provider). */
export function inferModelLab(model: string, provider: string): string {
	const slash = model.indexOf('/');
	if (slash > 0) {
		const org = model.slice(0, slash).toLowerCase();
		return LAB_NAMES[org] ?? titleCase(org);
	}
	if (provider === 'openai') return 'OpenAI';
	if (provider === 'anthropic') return 'Anthropic';
	if (provider === 'google') return 'Google';
	return LAB_NAMES[provider.toLowerCase()] ?? titleCase(provider);
}

/** Short model id without org prefix, e.g. `claude-opus-4.7`. */
export function displayModelId(model: string): string {
	const slash = model.indexOf('/');
	return slash >= 0 ? model.slice(slash + 1) : model;
}

function anthropicReasoningDisplay(input: ModelDisplayInput): string | undefined {
	const level = input.thinkingLevel;
	const effort = input.providerThinkingEffort;
	const marker = `${input.resultLabel ?? ''} ${input.rowId ?? ''}`;
	if (marker.includes('max-tier-xhigh') || marker.includes('max-tier')) return 'max';
	if (input.model.includes('claude-opus-4.7') && (level === 'xhigh' || effort === 'xhigh')) return 'max';
	if (input.model.includes('claude-opus-4.6') && level === 'xhigh') return 'max';
	const native = effort ?? level;
	if (!native || native === 'off' || native === 'none') return undefined;
	return native;
}

function openaiReasoningDisplay(input: ModelDisplayInput): string | undefined {
	const native = input.providerThinkingEffort ?? input.thinkingLevel;
	if (!native || native === 'off' || native === 'none') return undefined;
	return native;
}

/** Provider-native reasoning label for display (not internal pi thinking level). */
export function displayReasoningLabel(input: ModelDisplayInput): string | undefined {
	const lab = inferModelLab(input.model, input.provider);
	if (lab === 'Anthropic') return anthropicReasoningDisplay(input);
	if (lab === 'OpenAI') return openaiReasoningDisplay(input);
	const native = input.providerThinkingEffort ?? input.thinkingLevel;
	if (!native || native === 'off' || native === 'none') return undefined;
	return native;
}

/** e.g. `claude-opus-4.7 max` or `gpt-5.5 xhigh`. */
export function formatModelLine(input: ModelDisplayInput): string {
	const id = displayModelId(input.model);
	const reasoning = displayReasoningLabel(input);
	return reasoning ? `${id} ${reasoning}` : id;
}

/** e.g. `Anthropic / claude-opus-4.7 max`. */
export function formatFullModelLabel(input: ModelDisplayInput): string {
	return `${inferModelLab(input.model, input.provider)} / ${formatModelLine(input)}`;
}
