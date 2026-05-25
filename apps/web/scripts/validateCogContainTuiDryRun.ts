import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const path = new URL('../../../artifacts/tui/phase-61-dry-run/summary.json', import.meta.url);
if (!existsSync(path)) throw new Error('missing TUI dry-run summary artifact');
const summary = JSON.parse(await readFile(path, 'utf8'));
if (summary.mode !== 'dry-run') throw new Error('TUI summary must be dry-run');
if (summary.liveCalls !== false) throw new Error('TUI dry-run must report no live calls');
if (summary.envRead !== false) throw new Error('TUI dry-run must report no env reads');
if (!summary.plan || summary.plan.scenarioCount < 1) throw new Error('TUI plan must include scenarios');
if (!Array.isArray(summary.plan.providerProfiles) || summary.plan.providerProfiles.length < 1) throw new Error('TUI plan must include provider profile labels');
console.log(`cog-contain TUI dry-run validator: ok scenarios=${summary.plan.scenarioCount} providers=${summary.plan.providerProfiles.length}`);
