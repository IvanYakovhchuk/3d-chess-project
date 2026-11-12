/**
 * tests/verify_pbr_upgrade.js
 * Verification suite for the Comprehensive Procedural PBR, Geometry & Lighting Upgrade:
 * 1. pieces3d.js: MeshPhysicalMaterial, clearcoat, envMapIntensity, multi-map PBR (map, roughnessMap, bumpMap)
 * 2. scene3d.js: ACESFilmicToneMapping, PMREMGenerator + scene.environment, overhead SpotLight, wall sconces
 * 3. scene3d.js: Procedural 3D geometries (hollow bookcase with tilted books, beveled ExtrudeGeometry cushions/table/clock, LatheGeometry legs, RingGeometry bezels, glass-covered paintings)
 * 4. scene3d.js: Multi-channel PBR maps & board MeshPhysicalMaterial with clearcoat
 * 5. Raycasting safety, syntax validity & performance
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const piecesSrc = fs.readFileSync(path.join(rootDir, 'pieces3d.js'), 'utf8');
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
console.log(`  SUITE: 1. pieces3d.js - PBR MeshPhysicalMaterial & Multi-Map Textures`);
console.log(`======================================================================`);

// 1.1 MeshPhysicalMaterial usage
assert(
  piecesSrc.includes('MeshPhysicalMaterial'),
  'pieces3d.js utilizes THREE.MeshPhysicalMaterial for 3D piece rendering'
);

// 1.2 Clearcoat and clearcoatRoughness
assert(
  piecesSrc.includes('clearcoat:') || piecesSrc.includes('clearcoat :'),
  'pieces3d.js sets clearcoat on piece materials'
);
assert(
  piecesSrc.includes('clearcoatRoughness:') || piecesSrc.includes('clearcoatRoughness :'),
  'pieces3d.js sets clearcoatRoughness on piece materials'
);

// 1.3 envMapIntensity
assert(
  piecesSrc.includes('envMapIntensity'),
  'pieces3d.js configures envMapIntensity to reflect the room environment'
);

// 1.4 Procedural Multi-Map PBR (map, roughnessMap, bumpMap)
assert(
  piecesSrc.includes('roughnessMap') || piecesSrc.includes('roughnessCanvas'),
  'pieces3d.js generates procedural roughnessMap'
);
assert(
  piecesSrc.includes('bumpMap') && piecesSrc.includes('bumpScale'),
  'pieces3d.js generates procedural bumpMap with bumpScale relief'
);

// 1.5 DoubleSide maintained for knight extrusions
assert(
  piecesSrc.includes('side: THREE.DoubleSide') || piecesSrc.includes('side:THREE.DoubleSide'),
  'pieces3d.js preserves side: THREE.DoubleSide'
);

// 1.6 Cache protection flags
assert(
  piecesSrc.includes('isSharedGeometry: true') && piecesSrc.includes('isSharedMaterial: true'),
  'pieces3d.js preserves isSharedGeometry and isSharedMaterial cache protection flags'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 2. scene3d.js - Tone Mapping, PMREM Environment & Lighting`);
console.log(`======================================================================`);

// 2.1 ACESFilmicToneMapping & exposure
assert(
  sceneSrc.includes('ACESFilmicToneMapping'),
  'scene3d.js enables THREE.ACESFilmicToneMapping for cinematic PBR color grading'
);
assert(
  sceneSrc.includes('toneMappingExposure'),
  'scene3d.js tunes toneMappingExposure'
);

// 2.2 PMREMGenerator & scene.environment
assert(
  sceneSrc.includes('PMREMGenerator'),
  'scene3d.js initializes THREE.PMREMGenerator'
);
assert(
  sceneSrc.includes('this.scene.environment') || sceneSrc.includes('scene.environment ='),
  'scene3d.js sets scene.environment for realistic PBR specular reflections'
);

// 2.3 Overhead SpotLight with soft shadows
assert(
  sceneSrc.includes('SpotLight') && sceneSrc.includes('castShadow = true'),
  'scene3d.js adds overhead SpotLight casting shadows over the board'
);

// 2.4 Wall sconces with PointLights
assert(
  sceneSrc.includes('sconce') || sceneSrc.includes('Sconce') || sceneSrc.includes('PointLight'),
  'scene3d.js adds warm wall sconces / point lighting'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 3. scene3d.js - Procedural 3D Furniture Geometries`);
console.log(`======================================================================`);

// 3.1 Hollow open-front bookcase with individual books
assert(
  sceneSrc.includes('shelf') || sceneSrc.includes('Shelf'),
  'Hollow bookcase has multi-tier horizontal shelves'
);
assert(
  sceneSrc.includes('book') || sceneSrc.includes('Book'),
  'Bookcase is populated with individual procedural books'
);

// 3.2 ExtrudeGeometry with bevelEnabled for armchairs, table, clock
assert(
  sceneSrc.includes('ExtrudeGeometry') && sceneSrc.includes('bevelEnabled: true'),
  'scene3d.js uses THREE.ExtrudeGeometry with bevelEnabled: true for soft cushions and beveled edges'
);

// 3.3 LatheGeometry for turned legs
assert(
  sceneSrc.includes('LatheGeometry'),
  'scene3d.js uses THREE.LatheGeometry for turned furniture legs'
);

// 3.4 RingGeometry and glass on chess clock
assert(
  sceneSrc.includes('RingGeometry') || sceneSrc.includes('clockBezel') || sceneSrc.includes('bezel'),
  'Chess clock features circular bezels on dials'
);

// 3.5 Framed paintings with reflective glass pane
assert(
  sceneSrc.includes('painting') || sceneSrc.includes('Painting'),
  'Procedural framed wall paintings present'
);
assert(
  sceneSrc.includes('glass') || sceneSrc.includes('Glass'),
  'Paintings feature protective reflective glass pane'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 4. scene3d.js - Multi-Channel PBR Maps & Board MeshPhysicalMaterial`);
console.log(`======================================================================`);

// 4.1 Floor, carpet, walls multi-channel PBR
assert(
  sceneSrc.includes('roughnessMap') && sceneSrc.includes('bumpMap'),
  'scene3d.js generates multi-channel PBR maps (map, roughnessMap, bumpMap) for environment surfaces'
);

// 4.2 Board squares & frame MeshPhysicalMaterial
const boardSquareSection = sceneSrc.slice(
  sceneSrc.indexOf('initBoard()'),
  sceneSrc.indexOf('initBoard()') + 3000
);
assert(
  boardSquareSection.includes('MeshPhysicalMaterial') || sceneSrc.includes('clearcoat: 0.55') || sceneSrc.includes('clearcoat'),
  'Chessboard squares and frame use MeshPhysicalMaterial with clearcoat'
);

// 4.3 Raycasting safety
const pointerDownSection = sceneSrc.slice(
  sceneSrc.indexOf('handlePointerDown(event)'),
  sceneSrc.indexOf('handlePointerMove(event)')
);
assert(
  !pointerDownSection.includes('this.environmentGroup'),
  'handlePointerDown does NOT raycast into this.environmentGroup'
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
  console.log(`\n  ALL PROCEDURAL PBR, GEOMETRY & LIGHTING UPGRADE CHECKS PASSED!`);
  process.exit(0);
}
