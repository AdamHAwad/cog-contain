import { publicSiteSnapshot } from '$lib/skatebench/siteResultSnapshot';

export const prerender = true;

export function load() {
	return { visualizerSnapshot: publicSiteSnapshot };
}
