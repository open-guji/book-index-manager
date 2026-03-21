import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { bookIndexApiPlugin } from './server/vite-plugin-api';

/** WSL 工作区路径（Windows 访问 WSL 文件系统） */
const WSL_WORKSPACE = '//wsl.localhost/Ubuntu/home/lishaodong/workspace';

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
          external: ['react', 'react-dom', 'react/jsx-runtime'],
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
      bookIndexApiPlugin(WSL_WORKSPACE),
    ],
    build: {
      outDir: 'dist-app',
      emptyOutDir: true,
    },
  };
});
