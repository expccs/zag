'use strict';

const metarhia = require('eslint-config-metarhia');
const tseslint = require('typescript-eslint');

const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

const scopeToTs = (config) => ({ ...config, files: config.files ?? TS_FILES });

module.exports = [
  {
    ignores: ['**/node_modules/', '**/dist/', '**/dev-dist/', '**/.turbo/'],
  },
  ...metarhia,
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module' },
    rules: { strict: 'off' },
  },
  ...tseslint.configs.recommended.map(scopeToTs),
  {
    files: TS_FILES,
    languageOptions: { sourceType: 'module' },
    rules: {
      strict: 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Formatting is owned by prettier; keep only what it cannot express.
      'no-extra-parens': 'off',
      quotes: ['error', 'single', { avoidEscape: true }],
      'max-len': [
        'error',
        {
          code: 80,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      // Web manifests, HTTP headers and CCS payloads use snake_case keys.
      camelcase: ['error', { properties: 'never' }],
    },
  },
];
