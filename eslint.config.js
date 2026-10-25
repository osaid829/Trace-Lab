import js from '@eslint/js';

export default [
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**']
  },
  js.configs.recommended
];
