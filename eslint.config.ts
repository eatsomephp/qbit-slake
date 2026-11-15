import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';

export default defineConfigWithVueTs(
  { ignores: ['qbit-slake/**', 'qbit-slake-demo/**', 'dev/**', 'coverage/**'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    rules: {
      // shadcn-vue primitives use single-word names (Button, Input, ...)
      'vue/multi-word-component-names': 'off',
      // Optional props typed with TS don't need runtime defaults.
      'vue/require-default-prop': 'off',
      // Never pass API data through axios; the fetch wrapper is the only HTTP client.
      'no-restricted-imports': ['error', { paths: ['axios'] }],
    },
  },
  skipFormatting,
);
