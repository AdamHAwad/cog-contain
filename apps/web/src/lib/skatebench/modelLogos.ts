import { inferModelLab } from './modelDisplay';

const LAB_LOGO_PATHS: Record<string, string> = {
	openai: '/assets/logos/openai.svg',
	anthropic: '/assets/logos/anthropic.svg',
	google: '/assets/logos/google.svg',
	meta: '/assets/logos/meta.svg',
	mistral: '/assets/logos/mistral.svg',
	deepseek: '/assets/logos/deepseek.svg',
	qwen: '/assets/logos/qwen.svg',
	xai: '/assets/logos/xai.svg'
};

/** Resolve a static logo path for a model row, or undefined for lab-initial fallback. */
export function modelLogoPath(model: string, provider: string): string | undefined {
	const lab = inferModelLab(model, provider).toLowerCase();
	return LAB_LOGO_PATHS[lab];
}

/** Two-letter fallback when no logo asset exists for a lab. */
export function modelLabInitial(model: string, provider: string): string {
	const lab = inferModelLab(model, provider);
	return lab.slice(0, 2).toUpperCase();
}
