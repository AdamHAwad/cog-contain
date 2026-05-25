export type PrngSnapshot = {
	seed: string;
	state: number;
};

function hashSeed(seed: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export class SeededPrng {
	readonly seed: string;
	#state: number;

	constructor(seed: string) {
		this.seed = seed;
		const initial = hashSeed(seed);
		this.#state = initial === 0 ? 0x9e3779b9 : initial;
	}

	nextUint32(): number {
		let value = this.#state;
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		this.#state = value >>> 0;
		return this.#state;
	}

	nextFloat(): number {
		return this.nextUint32() / 0x1_0000_0000;
	}

	fork(label: string): SeededPrng {
		return new SeededPrng(`${this.seed}:${label}:${this.#state}`);
	}

	snapshot(): PrngSnapshot {
		return { seed: this.seed, state: this.#state };
	}
}

export function createSeededPrng(seed: string): SeededPrng {
	return new SeededPrng(seed);
}
