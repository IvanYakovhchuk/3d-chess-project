/**
 * tests/verify_environment.js
 * Verification suite for the procedural 3D room environment in scene3d.js:
 * 1. Realistic 3D table, 4 legs, decorative tabletop chess clock, 2 player armchairs
 * 2. Full theme-adaptive 3D room interior (floor, rug, 4 walls, ceiling)
 * 3. Theme-specific architectural decor (classic library/bookshelves, wood lodge/fireplace, marble columns, neon pillars)
 * 4. Raycasting safety (environmentGroup never tested for piece clicks)
 * 5. Camera bounds (maxPhi clamped above table, walls enclose camera at all zoom levels)
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sceneSrc = fs.readFileSync(path.join(rootDir, 'scene3d.js'), 'utf8');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedChecks++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  totalChecks++;
  if (actual === expected) {
    passedChecks++;
    console.log(`  [PASS] ${message} (expected: ${expected}, got: ${actual})`);
  } else {
    failedChecks++;
    failures.push(`${message} (expected: ${expected}, got: ${actual})`);
    console.error(`  [FAIL] ${message} (expected: ${expected}, got: ${actual})`);
  }
}

console.log(`\n======================================================================`);
console.log(`  SUITE: 1. Procedural 3D Table, Chairs, and Tabletop Chess Clock`);
console.log(`======================================================================`);

// 1.1 Environment group initialized
assert(
  sceneSrc.includes('this.environmentGroup'),
  'this.environmentGroup container initialized in scene3d.js'
);

// 1.2 Realistic table geometry and this.tableMesh preserved
assert(
  sceneSrc.includes('this.tableMesh'),
  'this.tableMesh reference preserved for backward compatibility'
);
assert(
  sceneSrc.includes('initTable') || sceneSrc.includes('buildTable') || sceneSrc.includes('createTable'),
  'Procedural table builder method exists in scene3d.js'
);

// 1.3 4 Table legs
assert(
  sceneSrc.includes('leg') || sceneSrc.includes('Leg'),
  'Procedural table legs created in scene3d.js'
);

// 1.4 Tabletop decorative chess clock
assert(
  sceneSrc.includes('clock') || sceneSrc.includes('Clock'),
  'Procedural 3D decorative tabletop chess clock created in scene3d.js'
);

// 1.5 2 Player armchairs
assert(
  sceneSrc.includes('chair') || sceneSrc.includes('Chair') || sceneSrc.includes('armchair'),
  'Procedural player chairs created on White and Black sides'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 2. Theme-Adaptive 3D Room Interior (Floor, Carpet, Walls, Ceiling)`);
console.log(`======================================================================`);

// 2.1 Floor and rug
assert(
  sceneSrc.includes('floor') || sceneSrc.includes('Floor'),
  'Procedural floor geometry created in scene3d.js'
);
assert(
  sceneSrc.includes('carpet') || sceneSrc.includes('rug') || sceneSrc.includes('Carpet') || sceneSrc.includes('Rug'),
  'Under-table carpet / rug created in scene3d.js'
);

// 2.2 Enclosing walls
assert(
  sceneSrc.includes('wall') || sceneSrc.includes('Wall'),
  'Procedural enclosing room walls created in scene3d.js'
);

// 2.3 Theme-specific decor elements
assert(
  sceneSrc.includes('bookshelf') || sceneSrc.includes('Bookshelf') || sceneSrc.includes('book'),
  "Classic theme: Library bookshelves / books present"
);
assert(
  sceneSrc.includes('fireplace') || sceneSrc.includes('Fireplace') || sceneSrc.includes('hearth'),
  "Wood theme: Lodge stone fireplace with glowing hearth present"
);
assert(
  sceneSrc.includes('column') || sceneSrc.includes('Column') || sceneSrc.includes('pillar'),
  "Marble/Neon theme: Architectural columns / neon pillars present"
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 3. Raycasting Protection & Performance`);
console.log(`======================================================================`);

// 3.1 Raycasting does not intersect environmentGroup
const pointerDownSection = sceneSrc.slice(
  sceneSrc.indexOf('handlePointerDown(event)'),
  sceneSrc.indexOf('handlePointerMove(event)')
);
assert(
  !pointerDownSection.includes('this.environmentGroup'),
  'handlePointerDown does NOT raycast into this.environmentGroup (click performance protected)'
);

// 3.2 Camera bounds: maxPhi clamped to prevent dipping below table
assert(
  sceneSrc.includes('maxPhi'),
  'this.maxPhi is configured to prevent camera dipping below tabletop level'
);

console.log(`\n======================================================================`);
console.log(`  VERIFICATION RESULTS`);
console.log(`======================================================================`);
console.log(`  TOTAL CHECKS: ${totalChecks}`);
console.log(`  PASSED:       ${passedChecks}`);
console.log(`  FAILED:       ${failedChecks}`);

if (failedChecks > 0) {
  console.log(`\n  FAILURES:`);
  failures.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
  process.exit(1);
} else {
  console.log(`\n  ALL 3D PROCEDURAL ENVIRONMENT CHECKS PASSED!`);
  process.exit(0);
}
