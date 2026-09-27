// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Platform-specific modules may only be imported inside src/platform (ADR 0006).
const PLATFORM_MODULES = ['expo-secure-store', 'expo-speech', 'expo-sqlite', 'expo-audio', 'expo-camera', 'expo-video', 'expo-file-system', 'expo-background-task', 'whisper.rn'];

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: PLATFORM_MODULES.map((name) => ({ name, message: 'Use an adapter from @/platform instead (ADR 0006).' })) },
      ],
    },
  },
]);
