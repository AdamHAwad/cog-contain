import { mkdir, readFile, writeFile } from 'node:fs/promises';

const publishedResultUrl = new URL('../../../artifacts/public-results/latest.json', import.meta.url);
const staticResultUrl = new URL('../static/results/latest.json', import.meta.url);

const artifact = JSON.parse(await readFile(publishedResultUrl, 'utf8'));
if (artifact.kind !== 'cog-contain-public-result-summary') throw new Error('invalid public result kind');
if (artifact.official !== true || artifact.leaderboardEligible !== false || artifact.hiddenEvalAccess !== false) throw new Error('published public result must be official with hidden access disabled');
await mkdir(new URL('../static/results', import.meta.url), { recursive: true });
await writeFile(staticResultUrl, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log('prepare public site: ok copied artifacts/public-results/latest.json to static/results/latest.json');
