import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'tests/mocks/react-native.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'tests/mocks/async-storage.ts'),
      'expo-file-system': path.resolve(__dirname, 'tests/mocks/expo-file-system.ts'),
      'expo-sharing': path.resolve(__dirname, 'tests/mocks/expo-sharing.ts'),
    },
  },
});
