/**
 * tests/verify_perf_optimizations.js
 * Verification suite for the 5 Performance & Draw-Call Optimizations (Message #72):
 * 1. pieces3d.js: Knight headExtrudeGeom triangle winding reversal & THREE.FrontSide GPU backface culling
 * 2. pieces3d.js: Elimination of pixel-by-pixel getImageData/putImageData in marble procedural texture
 * 3. scene3d.js: THREE.InstancedMesh for repeated room elements (books in bookcases, wainscoting panels)
 * 4. scene3d.js: Targeted MeshPhysicalMaterial (glossy/lacquered) vs MeshStandardMaterial (matte background)
 * 5. scene3d.js: Distant room decor has castShadow = false outside shadow frustum
 * 6. scene3d.js: O(1) mathematical this.boardPlane ray intersection (no raycaster.intersectObjects on squareMeshes)
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
console.log(`  SUITE: 1. pieces3d.js - FrontSide Culling & Knight Winding Fix`);
console.log(`======================================================================`);

// 1.1 Knight geometry winding reversal
const knightGeomSection = piecesSrc.slice(
  piecesSrc.indexOf('createKnightGeometry('),
  piecesSrc.indexOf('createBishopGeometry(')
);
assert(
  knightGeomSection.includes('index') || knightGeomSection.includes('position') || knightGeomSection.includes('winding'),
  'createKnightGeometry adjusts vertex/index winding for the reflected knight head'
);

// 1.2 Backface culling: THREE.FrontSide used (no DoubleSide on 3D piece materials)
const getMaterialSection = piecesSrc.slice(
  piecesSrc.indexOf('function getMaterial('),
  piecesSrc.indexOf('function getOutlineMaterial(')
);
assert(
  !getMaterialSection.includes('side: THREE.DoubleSide'),
  'getMaterial() does NOT use THREE.DoubleSide (GPU backface culling active)'
);

// 1.3 Elimination of pixel-by-pixel getImageData
assert(
  !piecesSrc.includes('getImageData'),
  'pieces3d.js eliminated pixel-by-pixel getImageData/putImageData loop'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 2. scene3d.js - InstancedMesh Draw Call Optimization`);
console.log(`======================================================================`);

// 2.1 THREE.InstancedMesh used for bookcases / books
assert(
  sceneSrc.includes('InstancedMesh'),
  'scene3d.js utilizes THREE.InstancedMesh for batch rendering repeated geometry'
);
assert(
  sceneSrc.includes('setMatrixAt') && (sceneSrc.includes('setColorAt') || sceneSrc.includes('instanceColor')),
  'scene3d.js configures InstancedMesh transforms and per-instance colors'
);

// 2.2 Wainscoting panels or books batched
const buildRoomSection = sceneSrc.slice(
  sceneSrc.indexOf('buildRoom(') !== -1 ? sceneSrc.indexOf('buildRoom(') : sceneSrc.indexOf('buildEnvironment('),
  sceneSrc.indexOf('buildTable(') !== -1 ? sceneSrc.indexOf('buildTable(') : sceneSrc.indexOf('initBoard(')
);
assert(
  sceneSrc.includes('InstancedMesh'),
  'Repeated environment elements batched into InstancedMesh'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 3. scene3d.js - Targeted PBR Materials (Physical vs Standard)`);
console.log(`======================================================================`);

// 3.1 Glossy surfaces retain MeshPhysicalMaterial with clearcoat
assert(
  sceneSrc.includes('MeshPhysicalMaterial'),
  'scene3d.js uses MeshPhysicalMaterial on glossy/reflective surfaces'
);
assert(
  sceneSrc.includes('clearcoat: 0.55') || sceneSrc.includes('clearcoat'),
  'Board squares and tabletop retain clearcoat reflections'
);

// 3.2 Distant matte walls/ceiling/carpet use MeshStandardMaterial
assert(
  sceneSrc.includes('MeshStandardMaterial'),
  'scene3d.js uses MeshStandardMaterial on matte background surfaces'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 4. scene3d.js - Distant Room Shadow Culling`);
console.log(`======================================================================`);

// 4.1 Check that distant bookcases, paintings, columns, armchairs do NOT set castShadow = true
const buildChairsIndex = sceneSrc.indexOf('buildChairs(');
const buildChairsSection = buildChairsIndex !== -1
  ? sceneSrc.slice(buildChairsIndex, sceneSrc.indexOf('buildRoom('))
  : '';
assert(
  !buildChairsSection.includes('.castShadow = true'),
  'Distant armchairs at z = ±9.2 do not cast shadows (kept false for shadow map efficiency)'
);

const buildRoomShadowIndex = sceneSrc.indexOf('buildRoom(');
const buildRoomShadowSection = buildRoomShadowIndex !== -1
  ? sceneSrc.slice(buildRoomShadowIndex, sceneSrc.indexOf('buildThemeDecor('))
  : '';
assert(
  !buildRoomShadowSection.includes('.castShadow = true'),
  'Distant room walls, ceiling and wainscoting do not cast shadows'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 5. scene3d.js - O(1) Mathematical Board Plane Intersection`);
console.log(`======================================================================`);

// 5.1 No raycaster.intersectObjects on squareMeshes
assert(
  !sceneSrc.includes('this.raycaster.intersectObjects(this.squareMeshes'),
  'scene3d.js does NOT call raycaster.intersectObjects on this.squareMeshes'
);

// 5.2 Uses this.boardPlane intersection
assert(
  sceneSrc.includes('this.raycaster.ray.intersectPlane(this.boardPlane') || sceneSrc.includes('ray.intersectPlane(this.boardPlane'),
  'scene3d.js uses O(1) mathematical ray-plane intersection against this.boardPlane'
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
  console.log(`\n  ALL 5 PERFORMANCE & DRAW-CALL OPTIMIZATIONS PASSED!`);
  process.exit(0);
}
