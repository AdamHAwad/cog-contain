import { publicSiteSnapshot } from '$lib/skatebench/siteResultSnapshot';
import type { PublicSiteSnapshot } from '$lib/skatebench/visualizerData';

export const prerender = true;

export function load() {
	return { visualizerSnapshot: publicSiteSnapshot };
}
