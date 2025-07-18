import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	server: {
		host: '0.0.0.0',
		port: 3000,
		proxy: {
			'/api': {
				target: 'http://0.0.0.0:8000',
				changeOrigin: true,
			},
		},
	},
	resolve: {
		dedupe: ['date-fns'],
	},
	optimizeDeps: {
		include: ['date-fns'],
	},
});
