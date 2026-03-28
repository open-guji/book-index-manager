import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { bookIndexApiPlugin } from './server/vite-plugin-api';

/** 数据工作区路径 */
const DATA_WORKSPACE = 'D:/workspace';

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      plugins: [
        react(),
        dts({ include: ['src/'], outDir: 'dist', rollupTypes: true }),
      ],
      build: {
        lib: {
          entry: {
            index: resolve(__dirname, 'src/index.ts'),
            storage: resolve(__dirname, 'src/storage-entry.ts'),
          },
          name: 'BookIndexUI',
          formats: ['es', 'cjs'],
          fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'react/jsx-runtime', /^opencc-js/],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
            },
          },
        },
        outDir: 'dist',
        cssCodeSplit: false,
      },
    };
  }

  return {
    plugins: [
      react(),
      bookIndexApiPlugin(DATA_WORKSPACE),
    ],
    build: {
      outDir: 'dist-app',
      emptyOutDir: true,
    },
  };
});
