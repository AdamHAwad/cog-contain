import { readFile } from 'node:fs/promises';

const tui = await readFile('packages/runner/src/tui/cogContainTui.ts', 'utf8');
const pkg = JSON.parse(await readFile('packages/runner/package.json', 'utf8'));
const root = JSON.parse(await readFile('package.json', 'utf8'));

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

assert(tui.includes("import { runGatedLiveSmoke }"), 'TUI must delegate to existing runGatedLiveSmoke path');
assert(!tui.includes('@earendil-works/pi-ai') && !tui.includes('streamSimple('), 'TUI must not call provider SDK/streaming directly');
assert(tui.includes("mode === 'live-smoke'"), 'TUI must include live-smoke mode branch');
assert(tui.includes("hasFlag(argv, '--allow-live-provider-call') && hasFlag(argv, '--confirm-live-smoke')"), 'live mode must require both explicit live guard flags');
assert(tui.includes('--sync-published-results') && tui.includes('--confirm-publish-results'), 'published sync must require explicit maintainer flags');
assert(tui.includes('artifacts/local-results/latest.json'), 'normal runs must write local results');
assert(!tui.includes('syncPublic = true'), 'runner must not default to published sync');
assert(tui.includes('allowLiveProviderCall: allowLive'), 'live guard must be passed to existing runner path');
assert(tui.includes('maxOutputTokens: caps.maxOutputTokens') && tui.includes('retryCount: caps.retryCount'), 'strict caps must be surfaced to live runner');
assert(pkg.scripts['qa:tui-live-guard'], 'runner package must expose no-live live guard validator');
assert(!String(root.scripts.test).includes('--allow-live-provider-call'), 'root test must not include live provider allow flag');
assert(!String(pkg.scripts['qa:tui-live-guard']).includes('--allow-live-provider-call'), 'guard validator must not allow live calls');
console.log('T450 TUI live-mode guard/source validator: ok noDefaultLive=true delegatesToExistingRunner=true');
