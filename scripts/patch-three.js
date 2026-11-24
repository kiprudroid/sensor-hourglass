/* global __dirname */
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'node_modules', 'three', 'build', 'three.cjs');
if (!fs.existsSync(p)) process.exit(0);
let s = fs.readFileSync(p, 'utf8');
const needle = 'process.emitWarning(';
const guard = 'process.emitWarning && process.emitWarning(';
if (s.includes(needle) && !s.includes(guard)) {
  s = s.replace(needle, guard);
  fs.writeFileSync(p, s);
  console.warn('patched three.cjs for Hermes compatibility');
}
