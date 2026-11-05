'use strict';

const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const base = require('./base.js');

module.exports = [
  ...base,
  {
    files: ['**/*.tsx', '**/*.jsx'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'new-cap': 'off',
    },
  },
];
