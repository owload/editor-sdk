import { defineConfig } from 'vitest/config';

// Library build (`npm run build`) and unit tests (`npm test`).
export default defineConfig({
  build: {
    sourcemap: true,
    lib: {
      entry: { 'editor-sdk': 'src/index.ts', testing: 'src/testing/index.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'vitest'],
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
