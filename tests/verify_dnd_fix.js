/**
 * tests/verify_dnd_fix.js
 * Comprehensive verification for Drag-and-Drop snap-back animation fix in scene3d.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sceneSrcPath = path.join(rootDir, 'scene3d.js');
const sceneSrc = fs.readFileSync(sceneSrcPath, 'utf8');

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
console.log(`  SUITE: Static Code Analysis of DND Snap-Back Fix in scene3d.js`);
console.log(`======================================================================`);

// 1. Check handlePointerUp contains this.justDropped tracking
assert(
  sceneSrc.includes('this.justDropped ='),
  'handlePointerUp records this.justDropped on successful drop'
);

// 2. Check syncBoard reads wasDraggedHere and clears this.justDropped
assert(
  sceneSrc.includes('wasDraggedHere') || sceneSrc.includes('justDropped'),
  'syncBoard checks if piece move originated from drag-and-drop'
);

assert(
  sceneSrc.includes('this.justDropped = null'),
  'syncBoard or handlePointerUp clears this.justDropped after processing'
);

// 3. Check that on legal drop, mesh is NOT reset back to originalPos before onPieceDrop
const pointerUpSection = sceneSrc.slice(
  sceneSrc.indexOf('handlePointerUp(event)'),
  sceneSrc.indexOf('handleWheel(event)')
);
const copyIndex = pointerUpSection.indexOf('this.draggedPiece.mesh.position.copy(this.draggedPiece.originalPos)');
const dropIndex = pointerUpSection.indexOf('this.callbacks.onPieceDrop');
assert(
  copyIndex === -1 || copyIndex > dropIndex,
  'handlePointerUp does NOT reset mesh to originalPos before onPieceDrop'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: Mocked Runtime Simulation of Drag-and-Drop vs Click-to-Move`);
console.log(`======================================================================`);

// Setup lightweight Three.js mock for Node.js
class MockVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new MockVector3(this.x, this.y, this.z);
  }
  equals(v) {
    return Math.abs(this.x - v.x) < 0.001 && Math.abs(this.y - v.y) < 0.001 && Math.abs(this.z - v.z) < 0.001;
  }
}

class MockMesh {
  constructor() {
    this.position = new MockVector3();
    this.rotation = { x: 0, y: 0, z: 0, set: () => {} };
    this.scale = new MockVector3(1, 1, 1);
    this.userData = {};
    this.isMesh = true;
    this.castShadow = false;
    this.receiveShadow = false;
  }
  traverse(fn) {
    fn(this);
  }
}

class MockGroup extends MockMesh {
  constructor() {
    super();
    this.children = [];
  }
  add(child) {
    this.children.push(child);
  }
  remove(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
  }
}

const mockTHREE = {
  Vector3: MockVector3,
  Vector2: function(x = 0, y = 0) { this.x = x; this.y = y; },
  Mesh: MockMesh,
  Group: MockGroup,
  Scene: class extends MockGroup {},
  PerspectiveCamera: class {
    constructor() {
      this.position = new MockVector3(0, 8, 8);
      this.aspect = 1;
      this.lookAt = () => {};
      this.updateProjectionMatrix = () => {};
    }
  },
  WebGLRenderer: class {
    constructor() {
      this.domElement = {
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
      };
      this.shadowMap = { enabled: false, type: 0, autoUpdate: false, needsUpdate: false };
      this.render = () => {};
      this.setSize = () => {};
      this.setPixelRatio = () => {};
      this.dispose = () => {};
    }
  },
  Plane: class {
    constructor(n = new MockVector3(0, 1, 0), c = 0) {
      this.normal = n;
      this.constant = c;
    }
    intersectPlane() { return new MockVector3(); }
  },
  Raycaster: class {
    constructor() {
      this.ray = {
        intersectPlane: (plane, target) => {
          target.set(0, 0, 0);
          return target;
        }
      };
    }
    setFromCamera() {}
    intersectObjects() { return []; }
  },
  AmbientLight: class extends MockMesh {},
  HemisphereLight: class extends MockMesh {},
  PointLight: class extends MockMesh {},
  DirectionalLight: class extends MockMesh {
    constructor() {
      super();
      this.shadow = { mapSize: { width: 0, height: 0 }, camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 } };
    }
  },
  Color: class { set() {} },
  BoxGeometry: class {},
  PlaneGeometry: class {},
  CylinderGeometry: class {},
  RingGeometry: class {},
  MeshStandardMaterial: class { constructor() { this.userData = {}; } },
  MeshBasicMaterial: class { constructor() { this.userData = {}; } },
  CanvasTexture: class { constructor() { this.userData = {}; } },
  DoubleSide: 2,
  PCFSoftShadowMap: 1
};

global.THREE = mockTHREE;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.window = {
  THREE: mockTHREE,
  innerWidth: 1024,
  innerHeight: 768,
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id)
};
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    width: 64,
    height: 64,
    getContext: () => ({
      measureText: () => ({ width: 10 }),
      fillText: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1
    }),
    style: {}
  })
};

try {
  const ChessScene3D = require('../scene3d.js');
  const mockContainer = {
    clientWidth: 800,
    clientHeight: 600,
    appendChild: () => {},
    removeChild: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };

  let droppedFrom = null;
  let droppedTo = null;
  let clickedSquare = null;

  const callbacks = {
    onSquareClick: (sq) => { clickedSquare = sq; },
    onPieceDrop: (from, to) => { droppedFrom = from; droppedTo = to; }
  };

  const scene = new ChessScene3D(mockContainer, callbacks);
  assert(Boolean(scene), 'ChessScene3D instantiated with mock environment');

  // Verify initial justDropped state
  assertEqual(scene.justDropped, null, 'scene.justDropped is initially null');

  // Setup mock piece at e2
  const pawnMesh = new MockMesh();
  const e2WorldPos = new MockVector3(0.5, 0, 2.5); // e2: col 4 -> x = -3.5 + 4 = 0.5; row 6 -> z = -3.5 + 6 = 2.5
  pawnMesh.position.copy(e2WorldPos);
  const pieceEntry = { mesh: pawnMesh, type: 'p', color: 'w', square: 'e2' };
  scene.pieceMap.set('e2', pieceEntry);

  // 1. Simulate dragging e2 piece to e4
  const e4WorldPos = new MockVector3(0.5, 0, 0.5); // e4: col 4 -> x = 0.5; row 4 -> z = -3.5 + 4 = 0.5
  scene.draggedPiece = {
    mesh: pawnMesh,
    square: 'e2',
    originalPos: e2WorldPos.clone()
  };
  // Dragged mesh moved above e4
  pawnMesh.position.set(e4WorldPos.x, 0.5, e4WorldPos.z);

  // Release pointer over e4
  scene.pointerDownPos = { x: 100, y: 100 };
  scene.handlePointerUp({ clientX: 100, clientY: 100 });

  // Check drop callback triggered
  assertEqual(droppedFrom, 'e2', 'onPieceDrop received fromSquare: e2');
  assertEqual(droppedTo, 'e4', 'onPieceDrop received toSquare: e4');

  // CRITICAL CHECK: In handlePointerUp, mesh position MUST NOT have snapped back to e2 originalPos!
  assert(
    pawnMesh.position.z !== e2WorldPos.z || pawnMesh.position.x !== e2WorldPos.x,
    'CRITICAL: Pawn mesh did NOT snap back to original e2 position upon drop'
  );

  // Check that this.justDropped is recorded
  assert(
    Boolean(scene.justDropped && scene.justDropped.from === 'e2' && scene.justDropped.to === 'e4'),
    'scene.justDropped correctly records from: e2, to: e4'
  );

  // 2. Now simulate app.js calling syncBoard after engine confirms move
  const mockBoard = Array(8).fill(null).map(() => Array(8).fill(null));
  mockBoard[4][4] = { type: 'p', color: 'w' }; // e4

  scene.syncBoard(mockBoard, { from: 'e2', to: 'e4', piece: 'p' });

  // After syncBoard, pawn should be cleanly positioned at e4
  assertEqual(pawnMesh.position.x, e4WorldPos.x, 'Pawn x position is at e4');
  assertEqual(pawnMesh.position.z, e4WorldPos.z, 'Pawn z position is at e4');
  assertEqual(scene.justDropped, null, 'scene.justDropped cleared to null after syncBoard');

  // Check pieceMap updated
  assert(!scene.pieceMap.has('e2'), 'e2 removed from pieceMap');
  assert(scene.pieceMap.has('e4'), 'e4 present in pieceMap');

} catch (err) {
  console.error('Runtime simulation error:', err);
  assert(false, `Simulation threw an exception: ${err.message}`);
}

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
  console.log(`\n  ALL DND SNAP-BACK FIX CHECKS PASSED WITH ZERO ERRORS!`);
  process.exit(0);
}
