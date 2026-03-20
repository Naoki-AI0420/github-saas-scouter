const fs = require('fs');
const path = './node_modules/bottleneck/light.js';
let code = fs.readFileSync(path, 'utf8');
if (!code.includes('globalThis.setTimeout')) {
  code = code.replace(/return setTimeout\(resolve, t\)/g, 'return globalThis.setTimeout(resolve, t)');
  fs.writeFileSync(path, code);
  console.log('Patched bottleneck for Node 25 compatibility');
} else {
  console.log('Already patched');
}
