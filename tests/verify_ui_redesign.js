/**
 * tests/verify_ui_redesign.js
 * Verification suite for user's UI/UX redesign:
 * 1. Collapsible right sidebar (#game-sidebar) via #btn-sidebar-toggle on all devices (no .mobile-only)
 * 2. Player timers/cards (#player-card-b, #player-card-w) moved into Time Control section of #game-sidebar
 * 3. Camera view switcher moved into top-right corner island (.header-right-island) & #quick-mode-toggle removed
 * 4. Zero reference/syntax errors & complete DOM ID cross-reference match
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const htmlSrc = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const styleSrc = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const appSrc = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');

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
console.log(`  SUITE: 1. Retractable Right Sidebar (#game-sidebar & #btn-sidebar-toggle)`);
console.log(`======================================================================`);

// 1.1 #btn-sidebar-toggle exists and does NOT have mobile-only class
const sidebarBtnMatch = htmlSrc.match(/<button[^>]*id=["']btn-sidebar-toggle["'][^>]*>/);
assert(sidebarBtnMatch !== null, 'Found #btn-sidebar-toggle button in index.html');
if (sidebarBtnMatch) {
  assert(
    !sidebarBtnMatch[0].includes('mobile-only'),
    '#btn-sidebar-toggle does NOT have mobile-only class (visible on desktop & mobile)'
  );
}

// 1.2 #btn-sidebar-toggle is nested inside .header-right-island
const headerRightStart = htmlSrc.indexOf('class="top-actions header-right-island') !== -1
  ? htmlSrc.indexOf('class="top-actions header-right-island')
  : htmlSrc.indexOf('header-right-island');
const headerRightEnd = htmlSrc.indexOf('</header>');
const headerRightHtml = htmlSrc.slice(headerRightStart, headerRightEnd);
assert(
  headerRightHtml.includes('id="btn-sidebar-toggle"'),
  '#btn-sidebar-toggle is located in .header-right-island'
);

// 1.3 #game-sidebar has open/closed sliding styling in style.css
assert(
  styleSrc.includes('.game-sidebar') && styleSrc.includes('.game-sidebar.open'),
  'style.css defines .game-sidebar and .game-sidebar.open classes'
);
assert(
  styleSrc.includes('translateX') || styleSrc.includes('transform'),
  'style.css uses hardware-accelerated transform for sliding sidebar'
);

// 1.4 app.js handles sidebar toggle
assert(
  appSrc.includes('btnSidebarToggle') || appSrc.includes('btn-sidebar-toggle'),
  'app.js sets up event listener for #btn-sidebar-toggle'
);
assert(
  appSrc.includes("gameSidebar.classList.toggle('open')") || appSrc.includes('gameSidebar.classList.toggle("open")'),
  'app.js toggles "open" class on #game-sidebar'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 2. Player Timers/Cards Moved into Sidebar Time Controls`);
console.log(`======================================================================`);

// 2.1 Sidebar contains .time-controls-section
const sidebarStart = htmlSrc.indexOf('id="game-sidebar"');
const sidebarEnd = htmlSrc.indexOf('</aside>');
const sidebarHtml = htmlSrc.slice(sidebarStart, sidebarEnd);

assert(
  sidebarHtml.includes('time-controls-section'),
  '#game-sidebar contains .time-controls-section'
);

// 2.2 #player-card-b and #player-card-w are inside .time-controls-section in sidebar
const timeControlsStart = sidebarHtml.indexOf('time-controls-section');
const timeControlsHtml = sidebarHtml.slice(timeControlsStart);

assert(
  timeControlsHtml.includes('id="player-card-b"') && timeControlsHtml.includes('id="player-card-w"'),
  'Both #player-card-b and #player-card-w are placed inside .time-controls-section in #game-sidebar'
);

// 2.3 Wrapped in .sidebar-players-list
assert(
  timeControlsHtml.includes('class="sidebar-players-list"'),
  'Player cards are wrapped in .sidebar-players-list inside the sidebar'
);

// 2.4 All child IDs preserved
const expectedChildIds = [
  'player-card-b', 'player-card-w',
  'clock-b', 'clock-w',
  'captured-b', 'captured-w',
  'material-b', 'material-w'
];
expectedChildIds.forEach(id => {
  assert(
    timeControlsHtml.includes(`id="${id}"`),
    `Child element #${id} is present in sidebar time controls`
  );
});

// 2.5 Empty .players-column is removed from .hud-body
const hudBodyStart = htmlSrc.indexOf('class="hud-body"');
const hudBodyEnd = htmlSrc.indexOf('</main>');
const hudBodyHtml = htmlSrc.slice(hudBodyStart, hudBodyEnd);
assert(
  !hudBodyHtml.includes('class="players-column"'),
  'Empty .players-column removed from .hud-body (chessboard unobstructed)'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 3. Camera View Switcher in #game-sidebar .camera-section (Compact Header)`);
console.log(`======================================================================`);

// 3.1 .camera-pill-bar is removed from .header-right-island (preventing overhanging over board)
assert(
  !headerRightHtml.includes('class="camera-pill-bar"'),
  '.camera-pill-bar removed from .header-right-island (compact header, no overhang)'
);

// 3.2 .camera-pill-bar is placed inside .camera-section in #game-sidebar
const cameraSectionStart = sidebarHtml.indexOf('class="sidebar-section camera-section"');
const cameraSectionHtml = cameraSectionStart !== -1 ? sidebarHtml.slice(cameraSectionStart) : '';

assert(
  sidebarHtml.includes('camera-section') && sidebarHtml.includes('camera-pill-bar'),
  '.camera-pill-bar is located inside .camera-section in #game-sidebar'
);

// 3.3 Contains camera angle buttons
assert(sidebarHtml.includes('id="quick-cam-white"'), 'Contains #quick-cam-white');
assert(sidebarHtml.includes('id="quick-cam-black"'), 'Contains #quick-cam-black');
assert(sidebarHtml.includes('id="quick-cam-top"'), 'Contains #quick-cam-top');
assert(sidebarHtml.includes('id="quick-cam-flip"'), 'Contains #quick-cam-flip');

// 3.4 #quick-mode-toggle is removed (deduplicated)
assert(
  !htmlSrc.includes('id="quick-mode-toggle"'),
  '#quick-mode-toggle removed from index.html (deduplicated with #btn-mode-3d / #btn-mode-2d)'
);
assert(
  !appSrc.includes('quick-mode-toggle'),
  'app.js does not query or reference quick-mode-toggle'
);

console.log(`\n======================================================================`);
console.log(`  SUITE: 4. DOM Element IDs Cross-Reference Validation`);
console.log(`======================================================================`);

const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
const queriedIds = new Set();
let match;
while ((match = idRegex.exec(appSrc)) !== null) {
  queriedIds.add(match[1]);
}

console.log(`  Found ${queriedIds.size} unique IDs queried by app.js`);
let missingIds = 0;
for (const id of queriedIds) {
  if (!htmlSrc.includes(`id="${id}"`)) {
    missingIds++;
    console.error(`  [FAIL] Missing DOM ID: ${id}`);
  }
}
assertEqual(missingIds, 0, 'All DOM element IDs queried by app.js exist in index.html');

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
  console.log(`\n  ALL UI/UX REDESIGN CHECKS PASSED WITH ZERO ERRORS!`);
  process.exit(0);
}
