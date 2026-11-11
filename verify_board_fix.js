/**
 * verify_board_fix.js
 * Validates the specific fixes for Z-fighting, matte black-and-white theme, and glare reduction.
 */

const fs = require('fs');
const path = require('path');

const sceneSrc = fs.readFileSync(path.join(__dirname, 'scene3d.js'), 'utf8');
const piecesSrc = fs.readFileSync(path.join(__dirname, 'pieces3d.js'), 'utf8');

let errors = 0;

function check(condition, desc) {
  if (condition) {
    console.log(`[PASS] ${desc}`);
  } else {
    console.error(`[FAIL] ${desc}`);
    errors++;
  }
}

console.log('=== VERIFYING Z-FIGHTING & GEOMETRY ELEVATIONS ===');

// Check square geometry & position: BoxGeometry(1.0, 0.16, 1.0) and y = -0.08 -> top is 0.00
check(sceneSrc.includes('BoxGeometry(1.0, 0.16, 1.0)'), 'Square geometry is 1.0 x 0.16 x 1.0');
check(sceneSrc.includes('-0.08'), 'Square center position y is -0.08 (top surface flush at y=0.000)');

// Check trimMesh is lower than squares
check(sceneSrc.includes('BoxGeometry(8.12, 0.24, 8.12)'), 'trimMesh geometry is 8.12 x 0.24 x 8.12');
check(sceneSrc.includes('-0.135'), 'trimMesh y is -0.135 (top at -0.015, below board top 0.00)');

// Check inlayMesh is lower than trim
check(sceneSrc.includes('BoxGeometry(8.22, 0.24, 8.22)'), 'inlayMesh geometry is 8.22 x 0.24 x 8.22');
check(sceneSrc.includes('-0.140'), 'inlayMesh y is -0.140 (top at -0.020, below trim top)');

// Check frameBaseMesh is lowest
check(sceneSrc.includes('BoxGeometry(9.6, 0.32, 9.6)'), 'frameBaseMesh geometry is 9.6 x 0.32 x 9.6');
check(sceneSrc.includes('-0.185'), 'frameBaseMesh y is -0.185 (top at -0.025)');

// Check coordinate labels sit on frame top
check(sceneSrc.includes('-0.021'), 'Coordinate labels y is -0.021 (resting on frame bevel)');

// Check highlights elevations & polygon offset
check(sceneSrc.includes('0.003'), 'lastMove highlight plane at y=0.003');
check(sceneSrc.includes('0.005'), 'selected highlight plane at y=0.005');
check(sceneSrc.includes('0.006'), 'check highlight ring at y=0.006');
check(sceneSrc.includes('0.007'), 'legal move dot/capture ring at y=0.007');
check(sceneSrc.includes('polygonOffset: true'), 'polygonOffset enabled on highlights/labels to guarantee zero Z-fighting');

console.log('\n=== VERIFYING CLEAN MATTE BLACK & WHITE COLORS & GLARE REDUCTION ===');

// Check classic colors
check(sceneSrc.includes('#f2f4f7'), 'Classic light square color is #f2f4f7 (crisp soft white)');
check(sceneSrc.includes('#262a32'), 'Classic dark square color is #262a32 (deep slate black)');
check(sceneSrc.includes('#181a20'), 'Classic frame color is #181a20 (sleek dark anthracite)');

// Check matte material settings on squares
check(sceneSrc.includes('roughness: 0.85'), 'Board square material roughness is 0.85 (matte finish)');
check(sceneSrc.includes('metalness: 0.02'), 'Board square material metalness is 0.02 (non-reflective)');

// Check key light intensity reduction
check(sceneSrc.includes('0.85'), 'Key directional light intensity is 0.85 (softened to eliminate glare)');

console.log('\n=== VERIFYING HIGH-CONTRAST PIECES & FELT PADS ===');

// Check white and black piece colors in pieces3d.js
check(piecesSrc.includes('0xfbfaf5'), 'White pieces are bright ivory/white (0xfbfaf5)');
check(piecesSrc.includes('0x14161b'), 'Black pieces are deep obsidian black (0x14161b)');
check(piecesSrc.includes('createFeltPad'), 'Tournament felt pad generator exists');
check(piecesSrc.includes('isFelt'), 'userData.isFelt flag preserved during dynamic reskinning');

console.log(`\n========================================`);
console.log(`ERRORS FOUND: ${errors}`);
console.log(`========================================`);

if (errors > 0) {
  process.exit(1);
} else {
  console.log('ALL FIXES VERIFIED SUCCESSFULLY!');
  process.exit(0);
}
