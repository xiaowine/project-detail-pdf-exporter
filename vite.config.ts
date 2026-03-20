import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	base: '/vue-dist/',
	root: 'vue',
	plugins: [vue()],
	build: {
		outDir: '../vue-dist',
		emptyOutDir: true,
		// In EDA iframe runtime we keep pdfmake in one stable bundle for compatibility.
		chunkSizeWarningLimit: 2500,
		modulePreload: false,
		cssCodeSplit: false,
		rollupOptions: {
			output: {
				entryFileNames: 'assets/index.js',
				chunkFileNames: 'assets/[name].js',
				assetFileNames: (assetInfo) => {
					if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'assets/index.css';
					return 'assets/[name][extname]';
				},
				manualChunks: () => 'index',
			},
		},
	},
});
