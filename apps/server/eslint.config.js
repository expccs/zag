'use strict';

const base = require('@zag/config/eslint/base');

// Hexagonal layering: `src/app` (domain, ports, use cases) must not know
// the adapters in `src/infrastructure`, the composition root, or any I/O
// library (tsyringe decorators and tokens are allowed). Tests may cross
// the border to use fakes.
const APP_FILES = ['src/app/**/*.ts'];
const TEST_FILES = ['src/**/*.test.ts'];

module.exports = [
  ...base,
  {
    files: APP_FILES,
    ignores: TEST_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/bootstrap'],
              message: 'src/app depends on its ports only (hexagonal).',
            },
            {
              group: ['socket.io', 'socket.io-client', 'node:http', 'ws'],
              message: 'I/O belongs to src/infrastructure adapters.',
            },
          ],
        },
      ],
    },
  },
];
