import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';

const staticBuild = process.env.COG_CONTAIN_STATIC_BUILD === 'true';
const basePath = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: staticBuild ? adapterStatic({ pages: 'build', assets: 'build', strict: true }) : adapterAuto(),
		paths: {
			base: basePath
		}
	}
};

export default config;
