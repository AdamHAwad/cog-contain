import type { VisualizerSnapshot } from './visualizerData';

type PublicSiteSnapshot = {
	metadata: Pick<VisualizerSnapshot['metadata'], 'modelCount' | 'scenarioCount' | 'updated'>;
	results: Pick<VisualizerSnapshot['results'][number], 'rowId' | 'rank' | 'model' | 'provider' | 'accuracyPercent' | 'totalCostUsd' | 'averageDurationSeconds' | 'accent'>[];
};

export const publicSiteSnapshot: PublicSiteSnapshot = {
	metadata: {
		modelCount: 2,
		scenarioCount: 40,
		updated: '2026-05-25'
	},
	results: [
		{
			rowId: 'official-openai-gpt-5.4-mini-rerun',
			rank: 1,
			model: 'gpt-5.4-mini',
			provider: 'openai',
			accuracyPercent: 47.62202380952381,
			totalCostUsd: 0.011882249999999995,
			averageDurationSeconds: 1.044,
			accent: 'green'
		},
		{
			rowId: 'official-openai-gpt-5.4-nano',
			rank: 2,
			model: 'gpt-5.4-nano',
			provider: 'openai',
			accuracyPercent: 47.62202380952381,
			totalCostUsd: 0.004081600000000002,
			averageDurationSeconds: 1.481,
			accent: 'blue'
		}
	]
};
