import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error Runtime QA uses Node strip-types with explicit TypeScript extensions.
import { TrajectoryRecorder } from '../pi/trajectoryRecorder.ts';

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function readText(path: string): string {
	return readFileSync(join(ROOT, path), 'utf8');
}

function readJson<T>(path: string): T {
	return JSON.parse(readText(path)) as T;
}

function recordAssistantStopReason(stopReason: 'error' | 'aborted') {
	const recorder = new TrajectoryRecorder();
	recorder.recordAgentEvent({
		type: 'message_end',
		message: {
			role: 'assistant',
			content: [{ type: 'text', text: '' }],
			api: 'openai-responses',
			provider: 'openai',
			model: 'gpt-5.4-nano',
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason,
			errorMessage: `${stopReason} fixture`,
			timestamp: 1
		}
	} as never);
	return recorder.getEvents();
}

for (const stopReason of ['error', 'aborted'] as const) {
	const events = recordAssistantStopReason(stopReason);
	assert(events.length === 1, `${stopReason} fixture should produce exactly one trajectory event`);
	assert(events[0]?.kind === 'runner_error', `${stopReason} fixture must be runner_error, not generic model_message`);
	assert(events[0]?.code === (stopReason === 'error' ? 'assistant_error' : 'assistant_aborted'), `${stopReason} fixture code mismatch`);
}

const liveSmokeSource = readText('packages/runner/src/live/liveSmoke.ts');
assert(liveSmokeSource.includes('assistantProof.finalStopReason === "error" || assistantProof.finalStopReason === "aborted"'), 'liveSmoke must classify assistant error/aborted stopReason as provider/runtime error');
assert(liveSmokeSource.includes('onPayload: async') && liveSmokeSource.includes('onResponse: async'), 'liveSmoke must wire provider-boundary hooks');
assert(liveSmokeSource.includes('responseIdHash: sha256Hex(responseId).slice(0, 16)'), 'liveSmoke must hash response ids instead of storing raw ids');

for (const packagePath of ['package.json', 'packages/runner/package.json', 'apps/web/package.json']) {
	const pkg = readJson<{ scripts?: Record<string, string> }>(packagePath);
	for (const [scriptName, script] of Object.entries(pkg.scripts ?? {})) {
		assert(!script.includes('--allow-live-provider-call') && !script.includes('--confirm-live-smoke'), `${packagePath} script ${scriptName} must not perform live calls by default`);
	}
}

console.log('T455 source-trace proof validator: ok trajectoryErrorStopReasons=runner_error providerBoundaryHooks=true responseIdsHashed=true defaultNoLive=true');
