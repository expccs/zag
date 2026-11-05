'use strict';

// Marks dist/esm as ES modules so Node resolves the "import" condition
// correctly even though the package itself is "type": "commonjs".
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const target = join(__dirname, '..', 'dist', 'esm', 'package.json');
writeFileSync(target, `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
