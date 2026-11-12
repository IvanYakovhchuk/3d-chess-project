/**
 * scene3d.js - Interactive Three.js 3D Chessboard, Lighting, Camera Controller,
 * Raycasting, Highlights, and Piece Move Animations.
 *
 * Implements:
 * - 8x8 Board centered at origin, rank 8 at z=-3.5 to rank 1 at z=+3.5,
 *   file 'a' at x=-3.5 to file 'h' at x=+3.5.
 * - Board bevel & outer frame with algebraic coordinate labels (a-h, 1-8).
 * - Multi-theme support: 'classic', 'marble', 'neon', 'wood'.
 * - Shadow-casting directional lights & ambient/rim lighting.
 * - Smooth orbital camera controls (orbit, zoom, pan) with preset transitions
 *   ('white', 'black', 'top', 'auto') and flipBoard().
 * - Full raycasting for both click-to-move and drag-and-drop.
 * - 3D square highlights for selected square, legal moves (dots & capture rings),
 *   last move glow, and pulsing red check danger indicator.
 * - Smooth piece animations: sliding pieces, parabolic jump arc for knights,
 *   simultaneous rook movements during castling, captures & promotions.
 * - Graceful fallback piece generator if window.ChessPieces3D is loading or unavailable.
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    let threeLib = root.THREE;
    if (!threeLib && typeof require === 'function') {
      try {
        threeLib = require('three');
      } catch (e) {
        threeLib = null;
      }
    }
    module.exports = factory(threeLib);
  } else {
    root.ChessScene3D = factory(root.THREE);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (THREE) {
  'use strict';

  // Constants & Board Mapping
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

  function squareToCoords(square) {
    if (!square || square.length < 2) return null;
    const file = square[0].toLowerCase();
    const rank = square[1];
    const col = FILES.indexOf(file);
    const row = RANKS.indexOf(rank);
    if (col === -1 || row === -1) return null;
    return { row, col };
  }

  function coordsToSquare(row, col) {
    if (row < 0 || row > 7 || col < 0 || col > 7) return null;
    return FILES[col] + RANKS[row];
  }

  function squareToWorld(square) {
    const coords = squareToCoords(square);
    if (!coords) return new THREE.Vector3(0, 0, 0);
    // col 0 ('a') -> -3.5, col 7 ('h') -> +3.5
    // row 0 ('8') -> -3.5, row 7 ('1') -> +3.5
    return new THREE.Vector3(-3.5 + coords.col, 0, -3.5 + coords.row);
  }

  function worldToSquare(x, z) {
    const col = Math.round(x + 3.5);
    const row = Math.round(z + 3.5);
    return coordsToSquare(row, col);
  }

  // Easing functions
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  // Procedural 3D Geometric Helpers (Extrude, Lathe, Shapes & Cornices)
  function createRoundedRectShape(w, d, r) {
    const shape = new THREE.Shape();
    const hw = w / 2, hd = d / 2;
    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    return shape;
  }

  function createTurnedLegPoints(height) {
    const pts = [];
    pts.push(new THREE.Vector2(0.36, 0));
    pts.push(new THREE.Vector2(0.36, -height * 0.10));
    pts.push(new THREE.Vector2(0.28, -height * 0.12));
    pts.push(new THREE.Vector2(0.38, -height * 0.16));
    pts.push(new THREE.Vector2(0.30, -height * 0.20));
    pts.push(new THREE.Vector2(0.38, -height * 0.32));
    pts.push(new THREE.Vector2(0.32, -height * 0.44));
    pts.push(new THREE.Vector2(0.36, -height * 0.55));
    pts.push(new THREE.Vector2(0.28, -height * 0.60));
    pts.push(new THREE.Vector2(0.25, -height * 0.78));
    pts.push(new THREE.Vector2(0.22, -height * 0.90));
    pts.push(new THREE.Vector2(0.34, -height * 0.94));
    pts.push(new THREE.Vector2(0.32, -height * 0.98));
    pts.push(new THREE.Vector2(0.00, -height));
    return pts;
  }

  function createTurnedChairLegPoints(height) {
    const pts = [];
    pts.push(new THREE.Vector2(0.14, 0));
    pts.push(new THREE.Vector2(0.14, -height * 0.15));
    pts.push(new THREE.Vector2(0.11, -height * 0.18));
    pts.push(new THREE.Vector2(0.15, -height * 0.25));
    pts.push(new THREE.Vector2(0.12, -height * 0.30));
    pts.push(new THREE.Vector2(0.15, -height * 0.45));
    pts.push(new THREE.Vector2(0.12, -height * 0.60));
    pts.push(new THREE.Vector2(0.10, -height * 0.85));
    pts.push(new THREE.Vector2(0.13, -height * 0.92));
    pts.push(new THREE.Vector2(0.11, -height * 0.97));
    pts.push(new THREE.Vector2(0.00, -height));
    return pts;
  }

  function createCorniceShape() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.35, 0.20);
    shape.lineTo(0.48, 0.45);
    shape.lineTo(0.65, 0.75);
    shape.lineTo(0.75, 1.00);
    shape.lineTo(0, 1.00);
    shape.closePath();
    return shape;
  }

  // Procedural Canvas Texture Generator for Board Themes & 3D Room Environment
  const TextureCache = {};

  function generateThemeTextures(theme) {
    if (TextureCache[theme]) return TextureCache[theme];

    let lightColor, darkColor, frameColor, tableColor;

    if (theme === 'wood') {
      lightColor = '#e2c59b';
      darkColor = '#703d1e';
      frameColor = '#3c1d0e';
      tableColor = '#4c2816';
    } else if (theme === 'marble') {
      lightColor = '#f5f6f8';
      darkColor = '#1e2126';
      frameColor = '#111317';
      tableColor = '#161920';
    } else if (theme === 'neon') {
      lightColor = '#0d1829';
      darkColor = '#1b0d2a';
      frameColor = '#07090e';
      tableColor = '#090b12';
    } else {
      // Classic: Clean, high-contrast Matte Black & White
      lightColor = '#f2f4f7'; // clean soft pure white
      darkColor = '#262a32';  // deep charcoal/slate black
      frameColor = '#181a20'; // sleek dark anthracite
      tableColor = '#22150f'; // deep rich mahogany
    }

    // Procedural PBR Multi-Map Generator for Squares
    function createSquarePBRTextures(baseColor, isLight, type) {
      const mc = document.createElement('canvas');
      mc.width = 256; mc.height = 256;
      const mg = mc.getContext('2d');
      mg.fillStyle = baseColor;
      mg.fillRect(0, 0, 256, 256);

      const rc = document.createElement('canvas');
      rc.width = 256; rc.height = 256;
      const rg = rc.getContext('2d');
      rg.fillStyle = '#4c4c4c'; // base satin
      rg.fillRect(0, 0, 256, 256);

      const bc = document.createElement('canvas');
      bc.width = 256; bc.height = 256;
      const bg = bc.getContext('2d');
      bg.fillStyle = '#808080'; // neutral height
      bg.fillRect(0, 0, 256, 256);

      if (type === 'wood') {
        mg.fillStyle = isLight ? 'rgba(160, 110, 60, 0.08)' : 'rgba(40, 20, 10, 0.15)';
        rg.fillStyle = 'rgba(255, 255, 255, 0.18)';
        bg.fillStyle = 'rgba(0, 0, 0, 0.15)';
        for (let i = 0; i < 20; i++) {
          const y = (i * 13) % 256;
          mg.fillRect(0, y, 256, 3 + (i % 4));
          rg.fillRect(0, y, 256, 2);
          bg.fillRect(0, y, 256, 1.5);
        }
        mg.strokeStyle = isLight ? 'rgba(120, 80, 40, 0.05)' : 'rgba(0, 0, 0, 0.12)';
        mg.lineWidth = 1.5;
        bg.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        bg.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) {
          mg.beginPath();
          mg.arc(128, -50 + i * 40, 100 + i * 20, 0, Math.PI * 2);
          mg.stroke();
          bg.beginPath();
          bg.arc(128, -50 + i * 40, 100 + i * 20, 0, Math.PI * 2);
          bg.stroke();
        }
      } else if (type === 'marble') {
        rg.fillStyle = '#2b2b2b';
        rg.fillRect(0, 0, 256, 256);
        mg.strokeStyle = isLight ? 'rgba(100, 115, 130, 0.12)' : 'rgba(240, 245, 255, 0.14)';
        mg.lineWidth = 1.2;
        rg.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        rg.lineWidth = 1.5;
        bg.strokeStyle = 'rgba(0, 0, 0, 0.20)';
        bg.lineWidth = 1.2;
        for (let v = 0; v < 4; v++) {
          mg.beginPath(); rg.beginPath(); bg.beginPath();
          let x = (v * 70) % 256;
          let y = 0;
          mg.moveTo(x, y); rg.moveTo(x, y); bg.moveTo(x, y);
          while (y < 256) {
            x += (Math.random() - 0.48) * 14;
            y += 8 + Math.random() * 10;
            mg.lineTo(x, y); rg.lineTo(x, y); bg.lineTo(x, y);
          }
          mg.stroke(); rg.stroke(); bg.stroke();
        }
      } else if (type === 'neon') {
        const glowColor = isLight ? '#00e5ff' : '#d500f9';
        mg.strokeStyle = glowColor;
        mg.lineWidth = 3;
        mg.strokeRect(2, 2, 252, 252);
        mg.fillStyle = isLight ? 'rgba(0, 229, 255, 0.04)' : 'rgba(213, 0, 249, 0.04)';
        mg.fillRect(4, 4, 248, 248);
        rg.fillStyle = '#222222';
        rg.fillRect(0, 0, 256, 256);
        bg.strokeStyle = '#ffffff';
        bg.lineWidth = 2;
        bg.strokeRect(2, 2, 252, 252);
      } else {
        rg.fillStyle = '#484848';
        rg.fillRect(0, 0, 256, 256);
        mg.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)';
        mg.lineWidth = 1;
        mg.strokeRect(0, 0, 256, 256);
        bg.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        bg.lineWidth = 1.5;
        bg.strokeRect(1, 1, 254, 254);
      }

      const map = new THREE.CanvasTexture(mc);
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      map.userData = { isSharedTexture: true };

      const roughnessMap = new THREE.CanvasTexture(rc);
      roughnessMap.wrapS = roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
      roughnessMap.userData = { isSharedTexture: true };

      const bumpMap = new THREE.CanvasTexture(bc);
      bumpMap.wrapS = bumpMap.wrapT = THREE.ClampToEdgeWrapping;
      bumpMap.userData = { isSharedTexture: true };

      return { map, roughnessMap, bumpMap };
    }

    const lightPBR = createSquarePBRTextures(lightColor, true, theme);
    const darkPBR = createSquarePBRTextures(darkColor, false, theme);
    const lightTex = lightPBR.map;
    const darkTex = darkPBR.map;

    // Procedural PBR Multi-Map Generator for Frame
    function createFramePBRTextures(thm) {
      const mc = document.createElement('canvas');
      mc.width = 512; mc.height = 512;
      const mg = mc.getContext('2d');
      mg.fillStyle = frameColor;
      mg.fillRect(0, 0, 512, 512);

      const rc = document.createElement('canvas');
      rc.width = 512; rc.height = 512;
      const rg = rc.getContext('2d');
      rg.fillStyle = '#505050';
      rg.fillRect(0, 0, 512, 512);

      const bc = document.createElement('canvas');
      bc.width = 512; bc.height = 512;
      const bg = bc.getContext('2d');
      bg.fillStyle = '#808080';
      bg.fillRect(0, 0, 512, 512);

      if (thm === 'wood') {
        mg.fillStyle = 'rgba(20, 8, 3, 0.2)';
        rg.fillStyle = 'rgba(255, 255, 255, 0.15)';
        bg.fillStyle = 'rgba(0, 0, 0, 0.15)';
        for (let i = 0; i < 40; i++) {
          mg.fillRect(0, i * 13, 512, 4);
          rg.fillRect(0, i * 13, 512, 2);
          bg.fillRect(0, i * 13, 512, 2);
        }
      } else if (thm === 'marble') {
        mg.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        mg.lineWidth = 2;
        rg.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        rg.lineWidth = 2;
        bg.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        bg.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          mg.beginPath(); rg.beginPath(); bg.beginPath();
          mg.moveTo(i * 90, 0); rg.moveTo(i * 90, 0); bg.moveTo(i * 90, 0);
          mg.lineTo(i * 90 + 60, 512); rg.lineTo(i * 90 + 60, 512); bg.lineTo(i * 90 + 60, 512);
          mg.stroke(); rg.stroke(); bg.stroke();
        }
      } else if (thm === 'neon') {
        mg.strokeStyle = '#00e5ff';
        mg.lineWidth = 4;
        mg.strokeRect(4, 4, 504, 504);
        mg.strokeStyle = '#d500f9';
        mg.strokeRect(12, 12, 488, 488);
        bg.strokeStyle = '#ffffff';
        bg.lineWidth = 3;
        bg.strokeRect(4, 4, 504, 504);
      } else {
        mg.fillStyle = 'rgba(0, 0, 0, 0.25)';
        mg.fillRect(0, 0, 512, 512);
        bg.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        bg.lineWidth = 3;
        bg.strokeRect(4, 4, 504, 504);
      }

      const map = new THREE.CanvasTexture(mc);
      map.userData = { isSharedTexture: true };
      const roughnessMap = new THREE.CanvasTexture(rc);
      roughnessMap.userData = { isSharedTexture: true };
      const bumpMap = new THREE.CanvasTexture(bc);
      bumpMap.userData = { isSharedTexture: true };

      return { map, roughnessMap, bumpMap };
    }

    const framePBR = createFramePBRTextures(theme);
    const frameTex = framePBR.map;

    // Procedural Floor PBR Multi-Map Generator
    function createFloorPBRTextures(thm) {
      const fc = document.createElement('canvas');
      fc.width = 512; fc.height = 512;
      const g = fc.getContext('2d');

      const rc = document.createElement('canvas');
      rc.width = 512; rc.height = 512;
      const rg = rc.getContext('2d');
      rg.fillStyle = '#555555'; // semi-gloss
      rg.fillRect(0, 0, 512, 512);

      const bc = document.createElement('canvas');
      bc.width = 512; bc.height = 512;
      const bg = bc.getContext('2d');
      bg.fillStyle = '#808080';
      bg.fillRect(0, 0, 512, 512);

      if (thm === 'wood') {
        g.fillStyle = '#3a2012';
        g.fillRect(0, 0, 512, 512);
        const plankHeight = 64;
        const plankTones = ['#452615', '#3d2213', '#4e2c19', '#341c0f', '#422414', '#532e1a', '#3c2112', '#492917'];
        for (let r = 0; r < 8; r++) {
          const y = r * plankHeight;
          g.fillStyle = plankTones[r % plankTones.length];
          g.fillRect(0, y, 512, plankHeight - 2);
          g.fillStyle = 'rgba(20, 10, 5, 0.18)';
          for (let s = 0; s < 6; s++) {
            g.fillRect(0, y + 8 + s * 9, 512, 2);
            bg.fillStyle = 'rgba(0, 0, 0, 0.12)';
            bg.fillRect(0, y + 8 + s * 9, 512, 2);
          }
          const shift = (r % 2) * 256;
          g.fillStyle = '#1c0d06';
          g.fillRect(shift, y, 3, plankHeight);
          g.fillRect((shift + 256) % 512, y, 3, plankHeight);
          // Recessed joints
          bg.fillStyle = '#222222';
          bg.fillRect(0, y + plankHeight - 3, 512, 3);
          bg.fillRect(shift, y, 3, plankHeight);
          bg.fillRect((shift + 256) % 512, y, 3, plankHeight);
          rg.fillStyle = '#dddddd'; // matte seams
          rg.fillRect(0, y + plankHeight - 3, 512, 3);
          rg.fillRect(shift, y, 3, plankHeight);
          rg.fillRect((shift + 256) % 512, y, 3, plankHeight);
        }
      } else if (thm === 'marble') {
        g.fillStyle = '#16191f';
        g.fillRect(0, 0, 512, 512);
        const tileSize = 128;
        for (let r = 0; r < 4; r++) {
          for (let col = 0; col < 4; col++) {
            const isWhiteTile = (r + col) % 2 === 0;
            const x = col * tileSize;
            const y = r * tileSize;
            g.fillStyle = isWhiteTile ? '#e8ebf0' : '#222730';
            g.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
            g.strokeStyle = isWhiteTile ? 'rgba(140, 155, 175, 0.22)' : 'rgba(255, 255, 255, 0.12)';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(x + 10, y + 20);
            g.lineTo(x + tileSize - 20, y + tileSize - 15);
            g.stroke();
            // Grout lines
            bg.strokeStyle = '#222222';
            bg.lineWidth = 3;
            bg.strokeRect(x, y, tileSize, tileSize);
            rg.strokeStyle = '#cccccc';
            rg.lineWidth = 3;
            rg.strokeRect(x, y, tileSize, tileSize);
          }
        }
      } else if (thm === 'neon') {
        g.fillStyle = '#060810';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = '#0e1424';
        g.lineWidth = 1;
        for (let i = 0; i < 512; i += 32) {
          g.beginPath();
          g.moveTo(i, 0); g.lineTo(i, 512);
          g.moveTo(0, i); g.lineTo(512, i);
          g.stroke();
        }
        g.strokeStyle = 'rgba(0, 240, 255, 0.45)';
        g.lineWidth = 2;
        for (let i = 0; i <= 512; i += 128) {
          g.beginPath();
          g.moveTo(i, 0); g.lineTo(i, 512);
          g.moveTo(0, i); g.lineTo(512, i);
          g.stroke();
        }
        g.fillStyle = '#00f0ff';
        for (let r = 0; r <= 512; r += 128) {
          for (let c = 0; c <= 512; c += 128) {
            g.fillRect(c - 3, r - 3, 6, 6);
          }
        }
      } else {
        // Classic: Warm rich herringbone oak parquet floor
        g.fillStyle = '#53341c';
        g.fillRect(0, 0, 512, 512);
        const blockTones = ['#6e4627', '#623d21', '#754c2b', '#5a371e', '#694224'];
        const bW = 64;
        const bH = 32;
        for (let r = 0; r < 16; r++) {
          for (let c = 0; c < 8; c++) {
            const x = c * bW;
            const y = r * bH;
            g.fillStyle = blockTones[(r * 3 + c * 2) % blockTones.length];
            g.fillRect(x + 1, y + 1, bW - 2, bH - 2);
            g.fillStyle = 'rgba(30, 15, 5, 0.12)';
            g.fillRect(x + 1, y + 10, bW - 2, 2);
            g.fillRect(x + 1, y + 20, bW - 2, 2);
            bg.strokeStyle = '#2b170e';
            bg.lineWidth = 1.5;
            bg.strokeRect(x, y, bW, bH);
            rg.strokeStyle = '#aaaaaa';
            rg.lineWidth = 1.5;
            rg.strokeRect(x, y, bW, bH);
          }
        }
      }

      const map = new THREE.CanvasTexture(fc);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(8, 8);
      map.userData = { isSharedTexture: true };

      const roughnessMap = new THREE.CanvasTexture(rc);
      roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.repeat.set(8, 8);
      roughnessMap.userData = { isSharedTexture: true };

      const bumpMap = new THREE.CanvasTexture(bc);
      bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
      bumpMap.repeat.set(8, 8);
      bumpMap.userData = { isSharedTexture: true };

      return { map, roughnessMap, bumpMap };
    }

    const floorPBR = createFloorPBRTextures(theme);
    const floorTex = floorPBR.map;

    // Procedural Under-Table Woven Rug / Carpet PBR Multi-Map Generator
    function createCarpetPBRTextures(thm) {
      const cc = document.createElement('canvas');
      cc.width = 512; cc.height = 512;
      const g = cc.getContext('2d');

      const rc = document.createElement('canvas');
      rc.width = 512; rc.height = 512;
      const rg = rc.getContext('2d');
      rg.fillStyle = '#cccccc'; // matte textile
      rg.fillRect(0, 0, 512, 512);

      const bc = document.createElement('canvas');
      bc.width = 512; bc.height = 512;
      const bg = bc.getContext('2d');
      bg.fillStyle = '#808080';
      bg.fillRect(0, 0, 512, 512);

      // High-frequency tactile fabric pile / weave relief
      bg.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let w = 0; w < 512; w += 4) {
        bg.fillRect(w, 0, 2, 512);
        bg.fillRect(0, w, 512, 2);
      }

      if (thm === 'wood') {
        g.fillStyle = '#6b2f1e';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = '#c48733';
        g.lineWidth = 12;
        g.strokeRect(16, 16, 480, 480);
        g.strokeStyle = '#2b170e';
        g.lineWidth = 4;
        g.strokeRect(26, 26, 460, 460);
        g.fillStyle = '#8f4228';
        g.fillRect(40, 40, 432, 432);
        for (let dx = 128; dx <= 384; dx += 128) {
          for (let dy = 128; dy <= 384; dy += 128) {
            g.fillStyle = '#c48733';
            g.beginPath();
            g.moveTo(dx, dy - 40); g.lineTo(dx + 40, dy); g.lineTo(dx, dy + 40); g.lineTo(dx - 40, dy);
            g.closePath();
            g.fill();
            g.fillStyle = '#2b170e';
            g.beginPath();
            g.arc(dx, dy, 14, 0, Math.PI * 2);
            g.fill();
          }
        }
      } else if (thm === 'marble') {
        g.fillStyle = '#1a2233';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = '#c5a059';
        g.lineWidth = 14;
        g.strokeRect(18, 18, 476, 476);
        g.strokeStyle = '#8fa3bf';
        g.lineWidth = 4;
        g.strokeRect(30, 30, 452, 452);
        g.fillStyle = '#242f44';
        g.fillRect(45, 45, 422, 422);
        g.strokeStyle = '#c5a059';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(256, 256, 100, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(256, 256, 60, 0, Math.PI * 2);
        g.stroke();
        for (let a = 0; a < 8; a++) {
          const angle = (a * Math.PI) / 4;
          g.beginPath();
          g.moveTo(256, 256);
          g.lineTo(256 + Math.cos(angle) * 55, 256 + Math.sin(angle) * 55);
          g.stroke();
        }
      } else if (thm === 'neon') {
        g.fillStyle = '#090d16';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = '#00f0ff';
        g.lineWidth = 8;
        g.strokeRect(12, 12, 488, 488);
        g.strokeStyle = '#ff007f';
        g.lineWidth = 3;
        g.strokeRect(24, 24, 464, 464);
        g.strokeStyle = 'rgba(0, 240, 255, 0.6)';
        g.lineWidth = 4;
        g.beginPath();
        for (let h = 0; h < 6; h++) {
          const ang = (h * Math.PI) / 3;
          const x = 256 + Math.cos(ang) * 120;
          const y = 256 + Math.sin(ang) * 120;
          if (h === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
        g.strokeStyle = '#ff007f';
        g.lineWidth = 4;
        [[40, 40], [472, 40], [472, 472], [40, 472]].forEach(([cx, cy]) => {
          g.beginPath();
          g.arc(cx, cy, 18, 0, Math.PI * 2);
          g.stroke();
        });
      } else {
        // Classic: Regal Persian/Oriental carpet (deep burgundy/crimson, ornate gold/navy border)
        g.fillStyle = '#541219';
        g.fillRect(0, 0, 512, 512);
        g.fillStyle = '#162032';
        g.fillRect(16, 16, 480, 480);
        g.fillStyle = '#64161f';
        g.fillRect(48, 48, 416, 416);
        g.strokeStyle = '#d4af37';
        g.lineWidth = 5;
        g.strokeRect(20, 20, 472, 472);
        g.strokeRect(44, 44, 424, 424);
        g.fillStyle = '#162032';
        g.beginPath();
        g.arc(256, 256, 85, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#d4af37';
        g.lineWidth = 4;
        g.stroke();
        g.fillStyle = '#d4af37';
        g.beginPath();
        g.arc(256, 256, 32, 0, Math.PI * 2);
        g.fill();
        const spandrelOffset = 48;
        const spandrelSize = 70;
        g.fillStyle = '#162032';
        [
          [spandrelOffset, spandrelOffset],
          [512 - spandrelOffset - spandrelSize, spandrelOffset],
          [spandrelOffset, 512 - spandrelOffset - spandrelSize],
          [512 - spandrelOffset - spandrelSize, 512 - spandrelOffset - spandrelSize]
        ].forEach(([sx, sy]) => {
          g.fillRect(sx, sy, spandrelSize, spandrelSize);
          g.strokeStyle = '#d4af37';
          g.lineWidth = 2;
          g.strokeRect(sx, sy, spandrelSize, spandrelSize);
        });
      }

      const map = new THREE.CanvasTexture(cc);
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      map.userData = { isSharedTexture: true };

      const roughnessMap = new THREE.CanvasTexture(rc);
      roughnessMap.wrapS = roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
      roughnessMap.userData = { isSharedTexture: true };

      const bumpMap = new THREE.CanvasTexture(bc);
      bumpMap.wrapS = bumpMap.wrapT = THREE.ClampToEdgeWrapping;
      bumpMap.userData = { isSharedTexture: true };

      return { map, roughnessMap, bumpMap };
    }

    const carpetPBR = createCarpetPBRTextures(theme);
    const carpetTex = carpetPBR.map;

    // Procedural Room Wall PBR Multi-Map Generator
    function createWallPBRTextures(thm) {
      const wc = document.createElement('canvas');
      wc.width = 512; wc.height = 512;
      const g = wc.getContext('2d');

      const rc = document.createElement('canvas');
      rc.width = 512; rc.height = 512;
      const rg = rc.getContext('2d');
      rg.fillStyle = '#888888';
      rg.fillRect(0, 0, 512, 512);

      const bc = document.createElement('canvas');
      bc.width = 512; bc.height = 512;
      const bg = bc.getContext('2d');
      bg.fillStyle = '#808080';
      bg.fillRect(0, 0, 512, 512);

      if (thm === 'wood') {
        g.fillStyle = '#482a1a';
        g.fillRect(0, 0, 512, 512);
        const numPlanks = 16;
        const pH = 512 / numPlanks;
        const woodColors = ['#52301e', '#4a2b1b', '#5c3622', '#442718'];
        for (let i = 0; i < numPlanks; i++) {
          g.fillStyle = woodColors[i % woodColors.length];
          g.fillRect(0, i * pH, 512, pH - 2);
          g.fillStyle = 'rgba(20, 10, 5, 0.15)';
          g.fillRect(0, i * pH + 8, 512, 1.5);
          bg.fillStyle = '#222222';
          bg.fillRect(0, (i + 1) * pH - 2, 512, 2);
        }
      } else if (thm === 'marble') {
        g.fillStyle = '#d8dce2';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = 'rgba(90, 105, 125, 0.35)';
        g.lineWidth = 2;
        bg.strokeStyle = '#333333';
        bg.lineWidth = 2;
        const bH = 64;
        for (let r = 0; r < 8; r++) {
          const y = r * bH;
          g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
          bg.beginPath(); bg.moveTo(0, y); bg.lineTo(512, y); bg.stroke();
          const shift = (r % 2) * 128;
          for (let x = shift; x <= 512; x += 256) {
            g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + bH); g.stroke();
            bg.beginPath(); bg.moveTo(x, y); bg.lineTo(x, y + bH); bg.stroke();
          }
        }
        g.fillStyle = '#b8c0cc';
        g.fillRect(0, 384, 512, 128);
        g.strokeStyle = '#8a96a6';
        g.lineWidth = 4;
        g.strokeRect(10, 394, 492, 108);
      } else if (thm === 'neon') {
        g.fillStyle = '#080a12';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = '#141c2e';
        g.lineWidth = 3;
        g.strokeRect(8, 8, 496, 496);
        g.strokeRect(8, 256, 496, 248);
        g.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(24, 60); g.lineTo(180, 60); g.lineTo(220, 100); g.lineTo(488, 100);
        g.moveTo(24, 340); g.lineTo(260, 340); g.lineTo(300, 380); g.lineTo(488, 380);
        g.stroke();
        g.strokeStyle = 'rgba(255, 0, 127, 0.3)';
        g.beginPath();
        g.moveTo(24, 200); g.lineTo(320, 200); g.lineTo(360, 240); g.lineTo(488, 240);
        g.stroke();
      } else {
        // Classic: Rich library study wall (dark walnut boiserie wainscot below, elegant burgundy/taupe damask above)
        g.fillStyle = '#2f2723';
        g.fillRect(0, 0, 512, 300);
        g.fillStyle = 'rgba(0, 0, 0, 0.12)';
        for (let s = 0; s < 512; s += 32) {
          g.fillRect(s, 0, 16, 300);
        }
        g.fillStyle = '#1c1410';
        g.fillRect(0, 296, 512, 12);
        g.fillStyle = '#543621';
        g.fillRect(0, 300, 512, 6);
        g.fillStyle = '#261b14';
        g.fillRect(0, 308, 512, 204);
        rg.fillStyle = '#555555'; // wainscot satin
        rg.fillRect(0, 308, 512, 204);
        for (let p = 0; p < 2; p++) {
          const px = 20 + p * 246;
          g.fillStyle = '#1e140d';
          g.fillRect(px, 324, 226, 172);
          g.strokeStyle = '#472b19';
          g.lineWidth = 3;
          g.strokeRect(px + 4, 328, 218, 164);
          bg.strokeStyle = '#aaaaaa';
          bg.lineWidth = 3;
          bg.strokeRect(px + 4, 328, 218, 164);
        }
      }

      const map = new THREE.CanvasTexture(wc);
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(4, 1);
      map.userData = { isSharedTexture: true };

      const roughnessMap = new THREE.CanvasTexture(rc);
      roughnessMap.wrapS = THREE.RepeatWrapping;
      roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.repeat.set(4, 1);
      roughnessMap.userData = { isSharedTexture: true };

      const bumpMap = new THREE.CanvasTexture(bc);
      bumpMap.wrapS = THREE.RepeatWrapping;
      bumpMap.wrapT = THREE.RepeatWrapping;
      bumpMap.repeat.set(4, 1);
      bumpMap.userData = { isSharedTexture: true };

      return { map, roughnessMap, bumpMap };
    }

    const wallPBR = createWallPBRTextures(theme);
    const wallTex = wallPBR.map;

    // Procedural Realistic Tabletop PBR Multi-Map Generator
    function createTablePBRTextures(thm) {
      const tc = document.createElement('canvas');
      tc.width = 512; tc.height = 512;
      const g = tc.getContext('2d');

      const rc = document.createElement('canvas');
      rc.width = 512; rc.height = 512;
      const rg = rc.getContext('2d');
      rg.fillStyle = '#484848';
      rg.fillRect(0, 0, 512, 512);

      const bc = document.createElement('canvas');
      bc.width = 512; bc.height = 512;
      const bg = bc.getContext('2d');
      bg.fillStyle = '#808080';
      bg.fillRect(0, 0, 512, 512);

      if (thm === 'wood') {
        g.fillStyle = '#4c2816';
        g.fillRect(0, 0, 512, 512);
        g.fillStyle = 'rgba(20, 10, 5, 0.18)';
        for (let i = 0; i < 40; i++) {
          g.fillRect(0, i * 13, 512, 4);
          bg.fillRect(0, i * 13, 512, 2);
        }
        g.strokeStyle = 'rgba(255, 200, 150, 0.08)';
        g.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc(256, -100 + i * 80, 200 + i * 40, 0, Math.PI * 2);
          g.stroke();
        }
      } else if (thm === 'marble') {
        g.fillStyle = '#14171d';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = 'rgba(220, 230, 245, 0.22)';
        g.lineWidth = 1.5;
        rg.fillStyle = '#242424';
        rg.fillRect(0, 0, 512, 512);
        for (let v = 0; v < 5; v++) {
          g.beginPath();
          let x = (v * 100) % 512;
          let y = 0;
          g.moveTo(x, y);
          while (y < 512) {
            x += (Math.random() - 0.48) * 20;
            y += 12 + Math.random() * 14;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      } else if (thm === 'neon') {
        g.fillStyle = '#090b12';
        g.fillRect(0, 0, 512, 512);
        g.strokeStyle = '#00f0ff';
        g.lineWidth = 4;
        g.strokeRect(6, 6, 500, 500);
        g.strokeStyle = 'rgba(255, 0, 127, 0.4)';
        g.lineWidth = 2;
        g.strokeRect(18, 18, 476, 476);
      } else {
        g.fillStyle = '#22150f';
        g.fillRect(0, 0, 512, 512);
        g.fillStyle = 'rgba(0, 0, 0, 0.22)';
        for (let i = 0; i < 512; i += 8) {
          g.fillRect(0, i, 512, 3);
          bg.fillRect(0, i, 512, 2);
        }
        g.strokeStyle = 'rgba(80, 45, 25, 0.15)';
        g.lineWidth = 2;
        g.strokeRect(8, 8, 496, 496);
      }

      const map = new THREE.CanvasTexture(tc);
      map.userData = { isSharedTexture: true };
      const roughnessMap = new THREE.CanvasTexture(rc);
      roughnessMap.userData = { isSharedTexture: true };
      const bumpMap = new THREE.CanvasTexture(bc);
      bumpMap.userData = { isSharedTexture: true };

      return { map, roughnessMap, bumpMap };
    }

    const tablePBR = createTablePBRTextures(theme);
    const tableTex = tablePBR.map;

    // Procedural 3D Chess Clock Dial Texture
    function createClockDialTexture() {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const g = c.getContext('2d');

      g.fillStyle = '#f8f6f0';
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();

      g.strokeStyle = '#c5a059';
      g.lineWidth = 8;
      g.stroke();

      g.strokeStyle = '#222222';
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6;
        const r1 = 104;
        const r2 = i % 3 === 0 ? 84 : 94;
        g.lineWidth = i % 3 === 0 ? 4 : 2;
        g.beginPath();
        g.moveTo(128 + Math.cos(angle) * r1, 128 + Math.sin(angle) * r1);
        g.lineTo(128 + Math.cos(angle) * r2, 128 + Math.sin(angle) * r2);
        g.stroke();
      }

      // Red time trouble flag
      g.fillStyle = '#dc2626';
      g.beginPath();
      g.moveTo(128, 128);
      g.lineTo(95, 45);
      g.lineTo(110, 40);
      g.closePath();
      g.fill();

      // Hour hand
      g.strokeStyle = '#18181b';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(128, 128);
      g.lineTo(128 + Math.cos(-Math.PI / 4) * 55, 128 + Math.sin(-Math.PI / 4) * 55);
      g.stroke();

      // Minute hand
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(128, 128);
      g.lineTo(128 + Math.cos(-Math.PI / 1.8) * 82, 128 + Math.sin(-Math.PI / 1.8) * 82);
      g.stroke();

      // Center cap
      g.fillStyle = '#c5a059';
      g.beginPath();
      g.arc(128, 128, 7, 0, Math.PI * 2);
      g.fill();

      const cdTex = new THREE.CanvasTexture(c);
      cdTex.userData = { isSharedTexture: true };
      return cdTex;
    }

    // Procedural Classical Painting Texture for Study Wall Decor (Rich Chiaroscuro Oil Paintings)
    function createPaintingTexture(idx) {
      const pc = document.createElement('canvas');
      pc.width = 512;
      pc.height = 340;
      const g = pc.getContext('2d');

      if (idx === 0) {
        // Dramatic Sunset Alpine Valley & Lake Reflection
        const grad = g.createLinearGradient(0, 0, 0, 340);
        grad.addColorStop(0, '#e11d48');
        grad.addColorStop(0.28, '#f59e0b');
        grad.addColorStop(0.55, '#38bdf8');
        grad.addColorStop(0.85, '#0f172a');
        grad.addColorStop(1, '#020617');
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 340);

        // Distant majestic peaks
        g.fillStyle = '#1e293b';
        g.beginPath();
        g.moveTo(0, 210);
        g.lineTo(100, 100);
        g.lineTo(210, 200);
        g.lineTo(320, 80);
        g.lineTo(440, 190);
        g.lineTo(512, 140);
        g.lineTo(512, 340);
        g.lineTo(0, 340);
        g.closePath();
        g.fill();

        // Foreground dark pine ridges
        g.fillStyle = '#0f172a';
        g.beginPath();
        g.moveTo(0, 260);
        g.lineTo(150, 190);
        g.lineTo(300, 270);
        g.lineTo(512, 210);
        g.lineTo(512, 340);
        g.lineTo(0, 340);
        g.closePath();
        g.fill();

        // Lake water mirror reflection
        g.fillStyle = '#090d16';
        g.fillRect(0, 230, 512, 110);
        const lakeGlow = g.createLinearGradient(0, 230, 0, 340);
        lakeGlow.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
        lakeGlow.addColorStop(0.6, 'rgba(225, 29, 72, 0.2)');
        lakeGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
        g.fillStyle = lakeGlow;
        g.fillRect(140, 230, 180, 110);
      } else {
        // Classical Grandmaster's Study Portrait
        const grad = g.createRadialGradient(256, 150, 20, 256, 170, 260);
        grad.addColorStop(0, '#78350f');
        grad.addColorStop(0.4, '#451a03');
        grad.addColorStop(0.8, '#1c1917');
        grad.addColorStop(1, '#0c0a09');
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 340);

        // Dignified seated silhouette
        g.fillStyle = '#171513';
        g.beginPath();
        g.arc(256, 115, 48, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(160, 320);
        g.lineTo(205, 160);
        g.lineTo(307, 160);
        g.lineTo(352, 320);
        g.closePath();
        g.fill();

        // Warm candlelight glow on mahogany table with chess piece
        g.fillStyle = '#fbbf24';
        g.beginPath();
        g.arc(320, 220, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#d97706';
        g.fillRect(240, 248, 16, 28);
      }

      const pTex = new THREE.CanvasTexture(pc);
      pTex.userData = { isSharedTexture: true };
      return pTex;
    }

    const clockDialTex = createClockDialTexture();
    const paintingTex1 = createPaintingTexture(0);
    const paintingTex2 = createPaintingTexture(1);

    TextureCache[theme] = {
      lightColor,
      darkColor,
      frameColor,
      tableColor,
      lightTex,
      lightRoughnessTex: lightPBR.roughnessMap,
      lightBumpTex: lightPBR.bumpMap,
      darkTex,
      darkRoughnessTex: darkPBR.roughnessMap,
      darkBumpTex: darkPBR.bumpMap,
      frameTex,
      frameRoughnessTex: framePBR.roughnessMap,
      frameBumpTex: framePBR.bumpMap,
      floorTex,
      floorRoughnessTex: floorPBR.roughnessMap,
      floorBumpTex: floorPBR.bumpMap,
      carpetTex,
      carpetRoughnessTex: carpetPBR.roughnessMap,
      carpetBumpTex: carpetPBR.bumpMap,
      wallTex,
      wallRoughnessTex: wallPBR.roughnessMap,
      wallBumpTex: wallPBR.bumpMap,
      tableTex,
      tableRoughnessTex: tablePBR.roughnessMap,
      tableBumpTex: tablePBR.bumpMap,
      clockDialTex,
      paintingTex1,
      paintingTex2
    };
    return TextureCache[theme];
  }

  // Fallback Procedural Staunton Chess Piece Mesh Generator
  // Used whenever window.ChessPieces3D is not yet available.
  function createFallbackPieceMesh(type, color, theme) {
    const group = new THREE.Group();
    group.name = `piece_${color}_${type}`;

    let primaryColor, roughness, metalness;
    if (theme === 'neon') {
      primaryColor = color === 'w' ? 0x00f0ff : 0xff007f;
      roughness = 0.2;
      metalness = 0.8;
    } else if (theme === 'wood') {
      primaryColor = color === 'w' ? 0xdeb887 : 0x5a2d14;
      roughness = 0.45;
      metalness = 0.05;
    } else if (theme === 'marble') {
      primaryColor = color === 'w' ? 0xf0f2f5 : 0x22252a;
      roughness = 0.18;
      metalness = 0.1;
    } else {
      // Classic: Crisp Ivory White vs Deep Obsidian Black
      primaryColor = color === 'w' ? 0xfbfaf5 : 0x14161b;
      roughness = color === 'w' ? 0.35 : 0.32;
      metalness = color === 'w' ? 0.02 : 0.08;
    }

    const material = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: roughness,
      metalness: metalness
    });

    if (theme === 'neon') {
      material.emissive = new THREE.Color(color === 'w' ? 0x005577 : 0x770044);
      material.emissiveIntensity = 0.4;
    }

    // Helper to add turned lathe/cylinder elements
    function addPart(geo, y, rx = 0, ry = 0, rz = 0) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.y = y;
      if (rx) mesh.rotation.x = rx;
      if (ry) mesh.rotation.y = ry;
      if (rz) mesh.rotation.z = rz;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }

    // Base pedestal for all pieces
    addPart(new THREE.CylinderGeometry(0.38, 0.42, 0.12, 24), 0.06);
    addPart(new THREE.CylinderGeometry(0.32, 0.38, 0.08, 24), 0.15);

    if (type === 'p') {
      // Pawn
      addPart(new THREE.CylinderGeometry(0.18, 0.30, 0.45, 20), 0.40);
      addPart(new THREE.TorusGeometry(0.20, 0.04, 12, 24), 0.64, Math.PI / 2);
      addPart(new THREE.SphereGeometry(0.20, 20, 16), 0.82);
    } else if (type === 'r') {
      // Rook
      addPart(new THREE.CylinderGeometry(0.24, 0.32, 0.65, 20), 0.48);
      addPart(new THREE.CylinderGeometry(0.32, 0.26, 0.20, 20), 0.88);
      // Castle battlements (crenellations)
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const b = addPart(new THREE.BoxGeometry(0.12, 0.12, 0.12), 1.02);
        b.position.x = Math.cos(angle) * 0.22;
        b.position.z = Math.sin(angle) * 0.22;
      }
    } else if (type === 'n') {
      // Knight
      addPart(new THREE.CylinderGeometry(0.24, 0.32, 0.38, 20), 0.35);
      // Sculpted horse neck & head
      const head = addPart(new THREE.BoxGeometry(0.26, 0.45, 0.36), 0.72);
      head.rotation.x = -0.2;
      const muzzle = addPart(new THREE.BoxGeometry(0.22, 0.22, 0.30), 0.65);
      muzzle.position.z = 0.20;
      // Ears
      const ear1 = addPart(new THREE.ConeGeometry(0.06, 0.16, 8), 1.0);
      ear1.position.set(-0.08, 0.98, -0.05);
      const ear2 = addPart(new THREE.ConeGeometry(0.06, 0.16, 8), 1.0);
      ear2.position.set(0.08, 0.98, -0.05);
    } else if (type === 'b') {
      // Bishop
      addPart(new THREE.CylinderGeometry(0.20, 0.32, 0.65, 20), 0.50);
      addPart(new THREE.TorusGeometry(0.22, 0.04, 12, 24), 0.82, Math.PI / 2);
      addPart(new THREE.SphereGeometry(0.22, 20, 16), 1.04);
      addPart(new THREE.SphereGeometry(0.06, 12, 10), 1.28);
    } else if (type === 'q') {
      // Queen
      addPart(new THREE.CylinderGeometry(0.22, 0.34, 0.80, 20), 0.56);
      addPart(new THREE.TorusGeometry(0.26, 0.04, 12, 24), 0.98, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.32, 0.22, 0.24, 20), 1.12);
      // Coronet crown pearls
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const pearl = addPart(new THREE.SphereGeometry(0.05, 10, 8), 1.26);
        pearl.position.x = Math.cos(angle) * 0.28;
        pearl.position.z = Math.sin(angle) * 0.28;
      }
      addPart(new THREE.SphereGeometry(0.09, 12, 10), 1.28);
    } else if (type === 'k') {
      // King
      addPart(new THREE.CylinderGeometry(0.24, 0.36, 0.90, 20), 0.62);
      addPart(new THREE.TorusGeometry(0.28, 0.05, 12, 24), 1.08, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.34, 0.24, 0.28, 20), 1.24);
      // King's 3D Cross Finial
      addPart(new THREE.BoxGeometry(0.08, 0.26, 0.08), 1.50);
      addPart(new THREE.BoxGeometry(0.22, 0.08, 0.08), 1.54);
    }

    return group;
  }

  // Fallback Procedural 2D Chess Piece Mesh Generator (Lichess cburnett / Chess.com Neo style)
  function createFallbackPiece2DMesh(type, color, theme) {
    const group = new THREE.Group();
    group.name = `piece_2d_${color}_${type}`;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const isWhite = color === 'w';
    let pieceFill, pieceStroke, detailStroke, haloStroke;

    if (theme === 'neon') {
      pieceFill = isWhite ? '#00ffff' : '#ff007f';
      pieceStroke = '#ffffff';
      detailStroke = isWhite ? '#003344' : '#ffffff';
      haloStroke = isWhite ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 0, 127, 0.4)';
    } else if (theme === 'wood') {
      pieceFill = isWhite ? '#fdf6e7' : '#2c1609';
      pieceStroke = isWhite ? '#3d2516' : '#0a0c0e';
      detailStroke = isWhite ? '#3d2516' : '#ecd8b8';
      haloStroke = isWhite ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.75)';
    } else {
      // Classic & Marble: High contrast Lichess cburnett style
      pieceFill = isWhite ? '#ffffff' : '#1e2229';
      pieceStroke = isWhite ? '#141619' : '#0a0c0e';
      detailStroke = isWhite ? '#141619' : '#f1f5f9';
      haloStroke = isWhite ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.75)';
    }

    // 100% transparent background (NO circle or puck)
    ctx.clearRect(0, 0, size, size);

    // Helper to draw base for pieces
    function drawBase(y1, y2, w1, w2) {
      ctx.beginPath();
      ctx.moveTo(256 - w1 / 2, y1);
      ctx.lineTo(256 + w1 / 2, y1);
      ctx.lineTo(256 + w2 / 2, y2);
      ctx.lineTo(256 - w2 / 2, y2);
      ctx.closePath();
    }

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    function renderPiecePaths() {
      if (type === 'p') {
        // Pawn: Double-banded base, curved neck, collar, large round head
        ctx.beginPath();
        // Base
        ctx.moveTo(140, 445);
        ctx.lineTo(372, 445);
        ctx.lineTo(365, 415);
        ctx.lineTo(147, 415);
        ctx.closePath();
        // Pedestal step
        ctx.moveTo(158, 415);
        ctx.lineTo(354, 415);
        ctx.lineTo(340, 390);
        ctx.lineTo(172, 390);
        ctx.closePath();
        // Neck & waist
        ctx.moveTo(172, 390);
        ctx.quadraticCurveTo(225, 310, 222, 245);
        ctx.lineTo(290, 245);
        ctx.quadraticCurveTo(287, 310, 340, 390);
        ctx.closePath();
        // Collar bead
        ctx.moveTo(212, 245);
        ctx.lineTo(300, 245);
        ctx.lineTo(296, 225);
        ctx.lineTo(216, 225);
        ctx.closePath();
        // Head
        ctx.arc(256, 155, 62, 0, Math.PI * 2);
        ctx.closePath();
      } else if (type === 'r') {
        // Rook: Two-tier base, straight tower body, flared cornice, 3 merlons / 2 crenels
        ctx.beginPath();
        // Base
        ctx.moveTo(132, 445);
        ctx.lineTo(380, 445);
        ctx.lineTo(370, 412);
        ctx.lineTo(142, 412);
        ctx.closePath();
        // Tier 2
        ctx.moveTo(152, 412);
        ctx.lineTo(360, 412);
        ctx.lineTo(350, 385);
        ctx.lineTo(162, 385);
        ctx.closePath();
        // Tower body
        ctx.moveTo(164, 385);
        ctx.lineTo(172, 215);
        ctx.lineTo(340, 215);
        ctx.lineTo(348, 385);
        ctx.closePath();
        // Cornice & 3 merlons
        ctx.moveTo(145, 215);
        ctx.lineTo(367, 215);
        ctx.lineTo(367, 105);
        ctx.lineTo(322, 105);
        ctx.lineTo(322, 145);
        ctx.lineTo(280, 145);
        ctx.lineTo(280, 105);
        ctx.lineTo(232, 105);
        ctx.lineTo(232, 145);
        ctx.lineTo(190, 145);
        ctx.lineTo(190, 105);
        ctx.lineTo(145, 105);
        ctx.closePath();
      } else if (type === 'n') {
        // Knight: Lichess side profile facing LEFT (-X)
        ctx.beginPath();
        ctx.moveTo(140, 445);
        ctx.lineTo(372, 445);
        ctx.lineTo(362, 412);
        ctx.lineTo(150, 412);
        ctx.lineTo(162, 390);
        ctx.lineTo(346, 390);
        // Chest curve rising left
        ctx.quadraticCurveTo(240, 360, 205, 305);
        ctx.quadraticCurveTo(180, 260, 120, 245); // snout tip
        ctx.quadraticCurveTo(115, 230, 130, 220); // upper muzzle
        ctx.lineTo(210, 210); // cheek
        ctx.lineTo(225, 125); // ear back
        ctx.lineTo(252, 75);  // left ear tip
        ctx.lineTo(270, 115); // between ears
        ctx.lineTo(290, 78);  // right ear tip
        ctx.lineTo(305, 120); // ear base
        // Sweeping arched mane back
        ctx.quadraticCurveTo(385, 200, 355, 390);
        ctx.closePath();
      } else if (type === 'b') {
        // Bishop: Tiered base, collar band, mitre dome, top finial orb
        ctx.beginPath();
        ctx.moveTo(136, 445);
        ctx.lineTo(376, 445);
        ctx.lineTo(366, 412);
        ctx.lineTo(146, 412);
        ctx.closePath();
        ctx.moveTo(156, 412);
        ctx.lineTo(356, 412);
        ctx.lineTo(342, 385);
        ctx.lineTo(170, 385);
        ctx.closePath();
        // Lower waist
        ctx.moveTo(172, 385);
        ctx.quadraticCurveTo(215, 360, 218, 335);
        ctx.lineTo(294, 335);
        ctx.quadraticCurveTo(297, 360, 340, 385);
        ctx.closePath();
        // Mitre dome
        ctx.moveTo(205, 335);
        ctx.lineTo(307, 335);
        ctx.bezierCurveTo(380, 290, 350, 150, 256, 125);
        ctx.bezierCurveTo(162, 150, 132, 290, 205, 335);
        ctx.closePath();
        // Apex orb
        ctx.arc(256, 100, 22, 0, Math.PI * 2);
        ctx.closePath();
      } else if (type === 'q') {
        // Queen: Tiered base, wide 5-pointed coronet with deep scallops & 5 pearls
        ctx.beginPath();
        ctx.moveTo(132, 445);
        ctx.lineTo(380, 445);
        ctx.lineTo(370, 412);
        ctx.lineTo(142, 412);
        ctx.closePath();
        ctx.moveTo(152, 412);
        ctx.lineTo(360, 412);
        ctx.lineTo(346, 385);
        ctx.lineTo(166, 385);
        ctx.closePath();
        // Coronet body
        ctx.moveTo(170, 385);
        ctx.lineTo(125, 185); // point 1
        ctx.quadraticCurveTo(165, 240, 185, 155); // point 2
        ctx.quadraticCurveTo(225, 230, 256, 135); // point 3 (center peak)
        ctx.quadraticCurveTo(287, 230, 327, 155); // point 4
        ctx.quadraticCurveTo(347, 240, 387, 185); // point 5
        ctx.lineTo(342, 385);
        ctx.closePath();
        // 5 pearls on peaks
        const queenPearls = [
          [125, 172], [185, 142], [256, 122], [327, 142], [387, 172]
        ];
        queenPearls.forEach(([px, py]) => {
          ctx.moveTo(px + 16, py);
          ctx.arc(px, py, 16, 0, Math.PI * 2);
        });
      } else if (type === 'k') {
        // King: Tiered base, collar band, royal dome lobes, upright cross (+)
        ctx.beginPath();
        ctx.moveTo(132, 445);
        ctx.lineTo(380, 445);
        ctx.lineTo(370, 412);
        ctx.lineTo(142, 412);
        ctx.closePath();
        ctx.moveTo(152, 412);
        ctx.lineTo(360, 412);
        ctx.lineTo(346, 385);
        ctx.lineTo(166, 385);
        ctx.closePath();
        // Waist
        ctx.moveTo(170, 385);
        ctx.quadraticCurveTo(215, 365, 218, 340);
        ctx.lineTo(294, 340);
        ctx.quadraticCurveTo(297, 365, 342, 385);
        ctx.closePath();
        // Symmetrical crown lobes
        ctx.moveTo(205, 340);
        ctx.lineTo(307, 340);
        ctx.bezierCurveTo(395, 280, 355, 175, 256, 195);
        ctx.bezierCurveTo(157, 175, 117, 280, 205, 340);
        ctx.closePath();
        // Upright cross finial (+)
        ctx.rect(242, 65, 28, 95);
        ctx.rect(212, 90, 88, 26);
      }
    }

    // Step 1: Draw outer halo stroke for Black pieces (makes piece pop on black squares)
    if (!isWhite) {
      renderPiecePaths();
      ctx.lineWidth = 22;
      ctx.strokeStyle = haloStroke;
      ctx.stroke();
    }

    // Step 2: Fill silhouette with soft drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    renderPiecePaths();
    ctx.fillStyle = pieceFill;
    ctx.fill();

    // Step 3: Draw crisp main outer contour stroke
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 15;
    ctx.strokeStyle = pieceStroke;
    ctx.stroke();

    // Step 4: Draw interior detail engraving lines (Lichess cburnett style)
    ctx.lineWidth = 9;
    ctx.strokeStyle = detailStroke;
    ctx.beginPath();

    if (type === 'p') {
      // Pawn head highlight arc & collar line
      ctx.arc(245, 145, 38, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.moveTo(224, 235);
      ctx.lineTo(288, 235);
      ctx.stroke();
    } else if (type === 'r') {
      // Rook arrow-slit & horizontal bands
      ctx.moveTo(175, 235);
      ctx.lineTo(337, 235);
      ctx.moveTo(172, 370);
      ctx.lineTo(340, 370);
      ctx.moveTo(256, 265);
      ctx.lineTo(256, 340);
      ctx.stroke();
    } else if (type === 'n') {
      // Knight almond eye, nostril, and mane locks
      ctx.fillStyle = detailStroke;
      ctx.beginPath();
      ctx.ellipse(172, 228, 9, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      // Nostril notch
      ctx.arc(134, 238, 4, 0, Math.PI * 2);
      ctx.fill();
      // Curved jaw & mane lines
      ctx.beginPath();
      ctx.moveTo(145, 252);
      ctx.quadraticCurveTo(195, 265, 222, 285);
      ctx.moveTo(250, 155);
      ctx.quadraticCurveTo(285, 230, 280, 320);
      ctx.stroke();
    } else if (type === 'b') {
      // Bishop central cross (+) & mitre seam
      ctx.moveTo(256, 185);
      ctx.lineTo(256, 260);
      ctx.moveTo(234, 218);
      ctx.lineTo(278, 218);
      ctx.moveTo(195, 320);
      ctx.quadraticCurveTo(256, 335, 317, 320);
      ctx.stroke();
    } else if (type === 'q') {
      // Queen cushion arc & waist line
      ctx.moveTo(182, 365);
      ctx.quadraticCurveTo(256, 380, 330, 365);
      ctx.moveTo(205, 265);
      ctx.quadraticCurveTo(256, 290, 307, 265);
      ctx.stroke();
    } else if (type === 'k') {
      // King crown lobe lines & collar band
      ctx.moveTo(185, 365);
      ctx.quadraticCurveTo(256, 380, 327, 365);
      ctx.moveTo(215, 285);
      ctx.quadraticCurveTo(256, 310, 297, 285);
      ctx.stroke();
    }

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    // Flat transparent plane resting cleanly on the board at y = 0.015
    const planeGeo = new THREE.PlaneGeometry(0.88, 0.88);
    const planeMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(planeGeo, planeMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.015;
    mesh.userData = { isFace: true };
    group.add(mesh);

    group.userData = {
      type: type,
      color: color,
      theme: theme,
      mode: '2d',
      is2D: true,
      height: 0.04
    };

    return group;
  }

  /**
   * Main ChessScene3D Class
   */
  class ChessScene3D {
    constructor(containerEl, callbacks = {}) {
      if (!containerEl) {
        throw new Error('ChessScene3D: containerEl is required.');
      }
      if (!THREE) {
        THREE = (typeof window !== 'undefined' ? window.THREE : null) || (typeof globalThis !== 'undefined' ? globalThis.THREE : null);
      }
      if (!THREE) {
        throw new Error('ChessScene3D: THREE (Three.js) is not loaded.');
      }

      this.containerEl = containerEl;
      this.callbacks = Object.assign({
        onSquareClick: () => {},
        onPieceDrop: () => {}
      }, callbacks);

      // Config & State
      this.theme = 'classic';
      this.viewMode = '3d'; // '3d' | '2d'
      this.turn = 'w';
      this.isFlipped = false;
      this.squareSize = 1.0;

      // Piece mesh registry: square string -> { mesh, type, color }
      this.pieceMap = new Map();
      this.activeAnimations = [];

      // Camera Spherical State
      this.cameraTarget = new THREE.Vector3(0, 0, 0);
      this.cameraSpherical = {
        radius: 12.0,
        theta: 0.0, // White view is theta = 0 (z = +radius)
        phi: Math.PI / 3.4
      };
      this.targetSpherical = {
        radius: 12.0,
        theta: 0.0,
        phi: Math.PI / 3.4
      };
      this.minRadius = 4.5;
      this.maxRadius = 36.0;
      this.minPhi = 0.08;
      this.maxPhi = Math.PI / 2.15;
      this.dampingFactor = 0.09;

      // Pointer / Raycasting interaction state
      this.pointer = new THREE.Vector2();
      this.raycaster = new THREE.Raycaster();
      this.isPointerDown = false;
      this.pointerDownPos = { x: 0, y: 0 };
      this.pointerButton = 0;
      this.draggedPiece = null; // { mesh, fromSquare, originalPos, planeIntersectOffset }
      this.justDropped = null; // { from, to, dropPos }
      this.interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55); // y = 0.55
      this.hoveredSquare = null;

      // Highlights state
      this.highlightGroup = new THREE.Group();
      this.highlightMeshes = [];
      this.checkPulseMesh = null;

      // Tactical Arrows state (Chess.com style right-click arrows)
      this.drawnArrows = new Map(); // key `${from}->${to}` -> mesh
      this.arrowStartSquare = null;
      this.isRightDraggingArrow = false;
      this.previewArrowMesh = null;
      this.lastPreviewToSquare = null;

      // Performance & Input-latency optimization state
      this.canvasRect = null;
      this.needsRaycast = false;
      this.boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      this.needsRender = true;

      // Scene & Renderer initialization
      this.initScene();
      this.initLights();
      this.initBoard();
      this.initHighlights();
      this.initEvents();
      this.startAnimationLoop();
    }

    /**
     * Initializes Scene, Camera, and WebGLRenderer
     */
    initScene() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x101216);

      const width = this.containerEl.clientWidth || 800;
      const height = this.containerEl.clientHeight || 600;

      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      this.updateCameraPosition(true);

      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.needsRender = true;
      if (THREE.ACESFilmicToneMapping) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.12;
      }
      if (THREE.sRGBEncoding) {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
      this.initEnvironmentMap();

      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.outline = 'none';
      this.renderer.domElement.style.touchAction = 'none';

      // Clear container and append canvas
      this.containerEl.innerHTML = '';
      this.containerEl.appendChild(this.renderer.domElement);
      this.updateCanvasRect();
    }

    /**
     * Generates a procedural IBL environment map via THREE.PMREMGenerator and sets scene.environment
     * Provides subtle natural reflections and ambient bounce to all PBR MeshStandard/MeshPhysical materials
     */
    initEnvironmentMap() {
      if (!THREE.PMREMGenerator) return;
      try {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        const envScene = new THREE.Scene();

        // Dark ambient room enclosure
        const roomBoxGeo = new THREE.BoxGeometry(12, 12, 12);
        const roomBoxMat = new THREE.MeshBasicMaterial({
          color: 0x1a1510,
          side: THREE.BackSide
        });
        const roomBox = new THREE.Mesh(roomBoxGeo, roomBoxMat);
        envScene.add(roomBox);

        // Warm overhead chandelier / ceiling light panel
        const ceilLightGeo = new THREE.PlaneGeometry(5, 5);
        ceilLightGeo.rotateX(Math.PI / 2);
        const ceilLightMat = new THREE.MeshBasicMaterial({ color: 0xfff0dd });
        const ceilLight = new THREE.Mesh(ceilLightGeo, ceilLightMat);
        ceilLight.position.set(0, 5.8, 0);
        envScene.add(ceilLight);

        // Soft warm side bounce panel
        const sideGeo1 = new THREE.PlaneGeometry(4, 5);
        const sideMat1 = new THREE.MeshBasicMaterial({ color: 0xff9944 });
        const side1 = new THREE.Mesh(sideGeo1, sideMat1);
        side1.position.set(-5.8, 1, 0);
        side1.rotation.y = Math.PI / 2;
        envScene.add(side1);

        // Soft cool rim bounce panel
        const sideGeo2 = new THREE.PlaneGeometry(4, 5);
        const sideMat2 = new THREE.MeshBasicMaterial({ color: 0x5577aa });
        const side2 = new THREE.Mesh(sideGeo2, sideMat2);
        side2.position.set(5.8, 1, 0);
        side2.rotation.y = -Math.PI / 2;
        envScene.add(side2);

        const renderTarget = pmremGenerator.fromScene(envScene, 0.04);
        this.scene.environment = renderTarget.texture;
        this.pmremEnvTex = renderTarget.texture;

        pmremGenerator.dispose();
        roomBoxGeo.dispose();
        roomBoxMat.dispose();
        ceilLightGeo.dispose();
        ceilLightMat.dispose();
        sideGeo1.dispose();
        sideMat1.dispose();
        sideGeo2.dispose();
        sideMat2.dispose();
      } catch (err) {
        console.warn('ChessScene3D: PMREMGenerator environment map setup failed', err);
      }
    }

    /**
     * Caches the bounding client rect of the canvas to avoid layout reflows on pointer events
     */
    updateCanvasRect() {
      if (this.renderer && this.renderer.domElement) {
        this.canvasRect = this.renderer.domElement.getBoundingClientRect();
      }
    }

    /**
     * Requests a frame render on-demand. Optionally triggers shadow map recomputation.
     * @param {boolean} [updateShadows=false]
     */
    requestRender(updateShadows = false) {
      this.needsRender = true;
      if (updateShadows && this.renderer && this.renderer.shadowMap) {
        this.renderer.shadowMap.needsUpdate = true;
      }
    }

    /**
     * Initializes shadow-casting directional, ambient, and accent lights
     */
    initLights() {
      this.lightsGroup = new THREE.Group();
      this.scene.add(this.lightsGroup);

      // Ambient Light (subtle fill to preserve 3D contrast & cylindrical self-shading)
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
      this.lightsGroup.add(this.ambientLight);

      // Hemisphere Light (sky/ground color contrast)
      this.hemiLight = new THREE.HemisphereLight(0xfff5ea, 0x181410, 0.45);
      this.hemiLight.position.set(0, 20, 0);
      this.lightsGroup.add(this.hemiLight);

      // Key Directional Light (Soft, glare-free illumination, casts crisp shadows)
      this.mainDirLight = new THREE.DirectionalLight(0xffffff, 0.90);
      this.mainDirLight.position.set(5, 16, 8);
      this.mainDirLight.castShadow = true;
      this.mainDirLight.shadow.mapSize.width = 2048;
      this.mainDirLight.shadow.mapSize.height = 2048;
      this.mainDirLight.shadow.camera.near = 1.0;
      this.mainDirLight.shadow.camera.far = 35.0;
      this.mainDirLight.shadow.camera.left = -6.5;
      this.mainDirLight.shadow.camera.right = 6.5;
      this.mainDirLight.shadow.camera.top = 6.5;
      this.mainDirLight.shadow.camera.bottom = -6.5;
      this.mainDirLight.shadow.bias = -0.0003;
      this.mainDirLight.shadow.normalBias = 0.02;
      this.lightsGroup.add(this.mainDirLight);

      // Overhead Tournament Chandelier SpotLight with soft shadows
      this.overheadSpotLight = new THREE.SpotLight(0xfff2e0, 1.25, 35, Math.PI / 3.2, 0.35, 1.2);
      this.overheadSpotLight.position.set(0, 14.0, 0);
      this.overheadSpotLight.target.position.set(0, 0, 0);
      this.overheadSpotLight.castShadow = true;
      this.overheadSpotLight.shadow.mapSize.width = 2048;
      this.overheadSpotLight.shadow.mapSize.height = 2048;
      this.overheadSpotLight.shadow.bias = -0.0002;
      if (this.overheadSpotLight.shadow.radius !== undefined) {
        this.overheadSpotLight.shadow.radius = 2.0;
      }
      this.lightsGroup.add(this.overheadSpotLight);
      this.lightsGroup.add(this.overheadSpotLight.target);

      // Rim / Fill Directional Light (opposite side for 3D depth)
      this.rimDirLight = new THREE.DirectionalLight(0xddeeff, 0.55);
      this.rimDirLight.position.set(-6, 10, -7);
      this.lightsGroup.add(this.rimDirLight);

      // Subtle Neon Accent Lights (only active when theme === 'neon')
      this.neonCyanLight = new THREE.PointLight(0x00f0ff, 0, 15);
      this.neonCyanLight.position.set(-5, 4, 5);
      this.lightsGroup.add(this.neonCyanLight);

      this.neonPinkLight = new THREE.PointLight(0xff00bb, 0, 15);
      this.neonPinkLight.position.set(5, 4, -5);
      this.lightsGroup.add(this.neonPinkLight);
    }

    /**
     * Builds the 3D 8x8 Board, wooden/marble bevel frame, and algebraic coordinate labels
     */
    initBoard() {
      this.boardGroup = new THREE.Group();
      this.scene.add(this.boardGroup);

      this.squareMeshes = []; // Array of individual square meshes for raycasting
      this.squareMap = {};    // square string -> square mesh

      const textures = generateThemeTextures(this.theme);

      // Materials for squares - Upgraded to MeshPhysicalMaterial with clearcoat and multi-map PBR
      const matClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

      this.lightSquareMat = new matClass({
        map: textures.lightTex,
        roughnessMap: textures.lightRoughnessTex,
        bumpMap: textures.lightBumpTex,
        bumpScale: 0.012,
        roughness: 0.40,
        metalness: 0.02,
        clearcoat: 0.55,
        clearcoatRoughness: 0.15,
        envMapIntensity: 1.15
      });
      this.darkSquareMat = new matClass({
        map: textures.darkTex,
        roughnessMap: textures.darkRoughnessTex,
        bumpMap: textures.darkBumpTex,
        bumpScale: 0.012,
        roughness: 0.40,
        metalness: 0.02,
        clearcoat: 0.55,
        clearcoatRoughness: 0.15,
        envMapIntensity: 1.15
      });

      // Individual 64 board squares: 1.0 width, 0.16 height, 1.0 depth at y = -0.08
      // Top face is cleanly and exactly at y = 0.000 with zero gaps
      const squareGeo = new THREE.BoxGeometry(1.0, 0.16, 1.0);

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const square = coordsToSquare(row, col);
          const isLight = (row + col) % 2 === 0;

          const mesh = new THREE.Mesh(
            squareGeo,
            isLight ? this.lightSquareMat : this.darkSquareMat
          );
          mesh.position.set(-3.5 + col, -0.08, -3.5 + row);
          mesh.receiveShadow = true;
          mesh.userData = { square, row, col, isLight, isBoardSquare: true };

          this.boardGroup.add(mesh);
          this.squareMeshes.push(mesh);
          this.squareMap[square] = mesh;
        }
      }

      // Board Frame / Border: Top face at y = -0.025 (25mm below square tops, zero Z-fighting)
      this.frameMat = new matClass({
        map: textures.frameTex,
        roughnessMap: textures.frameRoughnessTex,
        bumpMap: textures.frameBumpTex,
        bumpScale: 0.018,
        roughness: 0.45,
        metalness: 0.05,
        clearcoat: 0.55,
        clearcoatRoughness: 0.15,
        envMapIntensity: 1.15
      });

      // Outer frame base
      const frameBaseGeo = new THREE.BoxGeometry(9.6, 0.32, 9.6);
      this.frameBaseMesh = new THREE.Mesh(frameBaseGeo, this.frameMat);
      this.frameBaseMesh.position.y = -0.185;
      this.frameBaseMesh.receiveShadow = true;
      this.boardGroup.add(this.frameBaseMesh);

      // Beveled Border trim around the 8x8 squares: Top face at y = -0.015
      const trimGeo = new THREE.BoxGeometry(8.12, 0.24, 8.12);
      this.trimMat = new THREE.MeshStandardMaterial({
        color: 0x111114,
        roughness: 0.85,
        metalness: 0.05
      });
      const trimMesh = new THREE.Mesh(trimGeo, this.trimMat);
      trimMesh.position.y = -0.135;
      this.boardGroup.add(trimMesh);

      // Outer subtle matte inlay line: Top face at y = -0.020
      const inlayGeo = new THREE.BoxGeometry(8.22, 0.24, 8.22);
      this.inlayMat = new THREE.MeshStandardMaterial({
        color: 0x475569, // subtle matte slate, no blinding metallic gold
        roughness: 0.60,
        metalness: 0.20
      });
      this.inlayMesh = new THREE.Mesh(inlayGeo, this.inlayMat);
      this.inlayMesh.position.y = -0.140;
      this.boardGroup.add(this.inlayMesh);

      // Coordinate Labels (a-h and 1-8 on the wooden/marble board frame)
      this.labelsGroup = new THREE.Group();
      this.boardGroup.add(this.labelsGroup);
      this.buildCoordinateLabels();

      // Master pieces container group
      this.piecesGroup = new THREE.Group();
      this.boardGroup.add(this.piecesGroup);

      // Tactical Arrows container group (Chess.com style right-click arrows)
      this.arrowsGroup = new THREE.Group();
      this.arrowsGroup.position.y = 0.011;
      this.boardGroup.add(this.arrowsGroup);

      // Procedural 3D Environment (Realistic table, chairs, tabletop clock, room interior & theme decor)
      this.initEnvironment(textures);
    }

    /**
     * Builds algebraic coordinate labels a-h and 1-8 on the frame
     */
    buildCoordinateLabels() {
      // Clear any previous labels
      while (this.labelsGroup.children.length > 0) {
        const child = this.labelsGroup.children[0];
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
        if (child.geometry) child.geometry.dispose();
        this.labelsGroup.remove(child);
      }

      let textColor = '#cbd5e1';
      if (this.theme === 'marble') textColor = '#94a3b8';
      else if (this.theme === 'neon') textColor = '#00f0ff';
      else if (this.theme === 'wood') textColor = '#ecc48d';

      function makeLabelTexture(char) {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 128;
        const g = c.getContext('2d');
        g.clearRect(0, 0, 128, 128);
        g.font = 'bold 76px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = textColor;
        g.shadowColor = 'rgba(0, 0, 0, 0.6)';
        g.shadowBlur = 8;
        g.fillText(char, 64, 64);

        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
      }

      const labelPlaneGeo = new THREE.PlaneGeometry(0.48, 0.48);

      // Files 'a'-'h' along south (z = 4.42) facing White
      for (let col = 0; col < 8; col++) {
        const tex = makeLabelTexture(FILES[col]);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1
        });
        const mesh = new THREE.Mesh(labelPlaneGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(-3.5 + col, -0.021, 4.42);
        this.labelsGroup.add(mesh);
      }

      // Files 'a'-'h' along north (z = -4.42) facing Black (rotated 180 deg)
      for (let col = 0; col < 8; col++) {
        const tex = makeLabelTexture(FILES[col]);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1
        });
        const mesh = new THREE.Mesh(labelPlaneGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.PI;
        mesh.position.set(-3.5 + col, -0.021, -4.42);
        this.labelsGroup.add(mesh);
      }

      // Ranks '1'-'8' along west (x = -4.42)
      for (let row = 0; row < 8; row++) {
        const rankChar = RANKS[row];
        const tex = makeLabelTexture(rankChar);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1
        });
        const mesh = new THREE.Mesh(labelPlaneGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.PI / 2;
        mesh.position.set(-4.42, -0.021, -3.5 + row);
        this.labelsGroup.add(mesh);
      }

      // Ranks '1'-'8' along east (x = +4.42)
      for (let row = 0; row < 8; row++) {
        const rankChar = RANKS[row];
        const tex = makeLabelTexture(rankChar);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1
        });
        const mesh = new THREE.Mesh(labelPlaneGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -Math.PI / 2;
        mesh.position.set(4.42, -0.021, -3.5 + row);
        this.labelsGroup.add(mesh);
      }
    }

    /**
     * Initializes the realistic procedural 3D environment container:
     * Table, chairs, tabletop chess clock, room interior (floor, carpet, walls, ceiling) and theme decor.
     */
    initEnvironment(textures) {
      this.environmentGroup = new THREE.Group();
      this.environmentGroup.name = 'environmentGroup';
      this.scene.add(this.environmentGroup);

      this.decorGroup = new THREE.Group();
      this.decorGroup.name = 'decorGroup';
      this.environmentGroup.add(this.decorGroup);

      this.buildTable(textures);
      this.buildChairs(textures);
      this.buildRoom(textures);
      this.buildThemeDecor(this.theme);
    }

    /**
     * Alias for buildTable for API compatibility
     */
    initTable(textures) {
      return this.buildTable(textures);
    }

    /**
     * Builds realistic procedural 3D wooden/marble table with moulded trim, apron skirt,
     * 4 turned legs reaching down to floor at y = -6.8, and tabletop props (dual-dial chess clock).
     */
    buildTable(textures) {
      this.tableGroup = new THREE.Group();
      this.tableGroup.name = 'tableGroup';
      this.environmentGroup.add(this.tableGroup);

      const matClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

      // Table Material with Multi-Channel PBR Maps (Color, Roughness, Bump, Clearcoat)
      this.tableMat = new matClass({
        map: textures.tableTex,
        roughnessMap: textures.tableRoughnessTex || null,
        bumpMap: textures.tableBumpTex || null,
        bumpScale: 0.02,
        color: new THREE.Color(textures.tableColor),
        roughness: this.theme === 'marble' ? 0.35 : 0.52,
        metalness: 0.08,
        clearcoat: this.theme === 'marble' ? 0.65 : 0.45,
        clearcoatRoughness: 0.16
      });

      // Main Tabletop Mesh (ExtrudeGeometry with Chamfered/Beveled Edge, flush at y = -0.345 beneath frameBaseMesh)
      const tableShape = createRoundedRectShape(16.0, 13.6, 0.45);
      const tableExtrudeSettings = {
        steps: 1,
        depth: 0.34,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelOffset: 0,
        bevelSegments: 4
      };
      const tableGeo = new THREE.ExtrudeGeometry(tableShape, tableExtrudeSettings);
      tableGeo.rotateX(Math.PI / 2);

      this.tableMesh = new THREE.Mesh(tableGeo, this.tableMat);
      // Offset so top surface aligns flush at y = -0.345
      this.tableMesh.position.set(0, -0.425, 0);
      this.tableMesh.receiveShadow = true;
      this.tableMesh.castShadow = true;
      this.tableGroup.add(this.tableMesh);

      // Moulded Edge Trim
      const trimGeo = new THREE.BoxGeometry(16.5, 0.16, 14.1);
      const trimMesh = new THREE.Mesh(trimGeo, this.tableMat);
      trimMesh.position.set(0, -0.45, 0);
      trimMesh.receiveShadow = true;
      trimMesh.castShadow = true;
      this.tableGroup.add(trimMesh);

      // Under-Table Apron Skirt
      const skirtGeo = new THREE.BoxGeometry(14.6, 0.60, 12.2);
      const skirtMesh = new THREE.Mesh(skirtGeo, this.tableMat);
      skirtMesh.position.set(0, -1.145, 0);
      skirtMesh.receiveShadow = true;
      skirtMesh.castShadow = true;
      this.tableGroup.add(skirtMesh);

      // Decorative moulded beading along bottom edge of apron skirt
      const beadGeoX = new THREE.BoxGeometry(14.8, 0.08, 0.12);
      const beadGeoZ = new THREE.BoxGeometry(0.12, 0.08, 12.4);
      [-6.12, 6.12].forEach(bz => {
        const bead = new THREE.Mesh(beadGeoX, this.tableMat);
        bead.position.set(0, -1.41, bz);
        bead.receiveShadow = true;
        this.tableGroup.add(bead);
      });
      [-7.32, 7.32].forEach(bx => {
        const bead = new THREE.Mesh(beadGeoZ, this.tableMat);
        bead.position.set(bx, -1.41, 0);
        bead.receiveShadow = true;
        this.tableGroup.add(bead);
      });

      // 4 Turned & Tapered Table Legs (LatheGeometry reaching from apron down to floor at y = -6.8)
      const legPts = createTurnedLegPoints(5.95);
      const legGeo = new THREE.LatheGeometry(legPts, 24);
      const footGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24);
      const legPositions = [
        [-6.6, 5.4],
        [6.6, 5.4],
        [-6.6, -5.4],
        [6.6, -5.4]
      ];

      legPositions.forEach(([lx, lz]) => {
        const tableLeg = new THREE.Mesh(legGeo, this.tableMat);
        tableLeg.position.set(lx, -0.85, lz);
        tableLeg.receiveShadow = true;
        tableLeg.castShadow = true;
        this.tableGroup.add(tableLeg);

        const footMesh = new THREE.Mesh(footGeo, this.tableMat);
        footMesh.position.set(lx, -6.74, lz);
        footMesh.receiveShadow = true;
        footMesh.castShadow = true;
        this.tableGroup.add(footMesh);
      });

      // Tabletop Decorative 3D Dual-Dial Chess Clock
      this.buildChessClock(textures);
    }

    /**
     * Builds decorative procedural 3D analog chess clock on the table side (x = -5.8, y = -0.12, z = 0):
     * ExtrudeGeometry casing with beveled profile, dual sunken dials, RingGeometry brass bezels,
     * protective MeshPhysicalMaterial glass covers, and metallic rocker/plunger buttons.
     */
    buildChessClock(textures) {
      this.clockGroup = new THREE.Group();
      this.clockGroup.name = 'tabletopChessClock';
      this.clockGroup.position.set(-5.8, -0.12, 0);
      this.tableGroup.add(this.clockGroup);

      const matClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

      // Casing body with ExtrudeGeometry and beveled edges
      const clockShape = createRoundedRectShape(1.0, 2.2, 0.12);
      const clockExtrudeSettings = {
        steps: 1,
        depth: 0.38,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 3
      };
      const bodyGeo = new THREE.ExtrudeGeometry(clockShape, clockExtrudeSettings);
      bodyGeo.rotateX(Math.PI / 2);
      bodyGeo.center();

      const bodyMat = new matClass({
        color: this.theme === 'neon' ? 0x121726 : (this.theme === 'wood' ? 0x422212 : 0x361c10),
        roughness: 0.45,
        metalness: 0.15,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      this.clockGroup.add(bodyMesh);

      // Dual clock dials facing +X towards center board
      const dialGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 32);
      dialGeo.rotateZ(Math.PI / 2);
      const dialMat = new THREE.MeshBasicMaterial({ map: textures.clockDialTex });

      // Sunken dials: White dial (z = +0.55) & Black dial (z = -0.55)
      const dialWhite = new THREE.Mesh(dialGeo, dialMat);
      dialWhite.position.set(0.50, 0, 0.55);
      this.clockGroup.add(dialWhite);

      const dialBlack = new THREE.Mesh(dialGeo, dialMat);
      dialBlack.position.set(0.50, 0, -0.55);
      this.clockGroup.add(dialBlack);

      // RingGeometry Brass Bezels framing the dials
      const bezelGeo = new THREE.RingGeometry(0.25, 0.32, 32);
      bezelGeo.rotateY(Math.PI / 2);
      const bezelMat = new matClass({
        color: 0xd4af37,
        roughness: 0.22,
        metalness: 0.88,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1
      });

      const bezelWhite = new THREE.Mesh(bezelGeo, bezelMat);
      bezelWhite.position.set(0.515, 0, 0.55);
      this.clockGroup.add(bezelWhite);

      const bezelBlack = new THREE.Mesh(bezelGeo, bezelMat);
      bezelBlack.position.set(0.515, 0, -0.55);
      this.clockGroup.add(bezelBlack);

      // Protective Glass Covers in front of dials (MeshPhysicalMaterial with clearcoat & transparency)
      const glassGeo = new THREE.CircleGeometry(0.27, 32);
      glassGeo.rotateY(Math.PI / 2);
      const glassMat = new matClass({
        roughness: 0.04,
        metalness: 0.0,
        transmission: 0.88,
        opacity: 0.25,
        transparent: true,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        reflectivity: 0.95
      });

      const glassWhite = new THREE.Mesh(glassGeo, glassMat);
      glassWhite.position.set(0.52, 0, 0.55);
      this.clockGroup.add(glassWhite);

      const glassBlack = new THREE.Mesh(glassGeo, glassMat);
      glassBlack.position.set(0.52, 0, -0.55);
      this.clockGroup.add(glassBlack);

      // Metallic Brass Plungers & Tilted Rocker Bar on top
      const plungerGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.14, 16);
      const plungerMat = new matClass({
        color: 0xd4af37,
        roughness: 0.20,
        metalness: 0.90,
        clearcoat: 0.6
      });

      const plungerWhite = new THREE.Mesh(plungerGeo, plungerMat);
      plungerWhite.position.set(0, 0.26, 0.55);
      this.clockGroup.add(plungerWhite);

      const plungerBlack = new THREE.Mesh(plungerGeo, plungerMat);
      plungerBlack.position.set(0, 0.32, -0.55);
      this.clockGroup.add(plungerBlack);

      // Metallic Rocker connecting lever bar
      const leverGeo = new THREE.BoxGeometry(0.08, 0.04, 1.15);
      const leverMesh = new THREE.Mesh(leverGeo, plungerMat);
      leverMesh.position.set(0, 0.25, 0);
      leverMesh.rotation.x = -0.06;
      this.clockGroup.add(leverMesh);
    }

    /**
     * Builds two procedural player armchairs on White (z = +9.2, facing -Z) and Black (z = -9.2, facing +Z) sides:
     * ExtrudeGeometry beveled seat & backrest cushions, LatheGeometry turned legs,
     * InstancedMesh tufted buttons & spindles, and MeshStandardMaterial with receiveShadow.
     */
    buildChairs(textures) {
      this.chairsGroup = new THREE.Group();
      this.chairsGroup.name = 'playerChairs';
      this.environmentGroup.add(this.chairsGroup);

      let woodCol = 0x2e1910;
      let cushionCol = 0x54141b;
      if (this.theme === 'wood') {
        woodCol = 0x422617;
        cushionCol = 0x2d442b; // forest moss green
      } else if (this.theme === 'marble') {
        woodCol = 0x242830;
        cushionCol = 0x1e2c45; // royal navy
      } else if (this.theme === 'neon') {
        woodCol = 0x0c0e16;
        cushionCol = 0x141a29; // dark cyber
      }

      // Matte / non-clearcoat furniture surfaces use MeshStandardMaterial
      this.chairWoodMat = new THREE.MeshStandardMaterial({
        color: woodCol,
        roughness: 0.55,
        metalness: 0.08
      });
      this.chairCushionMat = new THREE.MeshStandardMaterial({
        color: cushionCol,
        roughness: 0.65,
        metalness: 0.04
      });

      const buttonGeo = new THREE.SphereGeometry(0.07, 12, 10);
      buttonGeo.scale(1.0, 0.4, 1.0);
      const buttonMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cushionCol).multiplyScalar(0.72),
        roughness: 0.75
      });

      const spindlePts = createTurnedChairLegPoints(1.15);
      const spindleGeo = new THREE.LatheGeometry(spindlePts, 12);
      const chairDummy = new THREE.Object3D();

      const createArmchair = () => {
        const chair = new THREE.Group();

        // Cushioned Seat via ExtrudeGeometry with Beveled Chamfer
        const seatShape = createRoundedRectShape(4.2, 4.0, 0.35);
        const seatExtrude = {
          steps: 1,
          depth: 0.38,
          bevelEnabled: true,
          bevelThickness: 0.09,
          bevelSize: 0.09,
          bevelSegments: 4
        };
        const seatGeo = new THREE.ExtrudeGeometry(seatShape, seatExtrude);
        seatGeo.rotateX(Math.PI / 2);
        seatGeo.center();

        const seatMesh = new THREE.Mesh(seatGeo, this.chairCushionMat);
        seatMesh.position.set(0, -3.8, 0);
        seatMesh.receiveShadow = true;
        chair.add(seatMesh);

        // Seat Frame Base
        const frameGeo = new THREE.BoxGeometry(4.2, 0.24, 4.0);
        const frameMesh = new THREE.Mesh(frameGeo, this.chairWoodMat);
        frameMesh.position.set(0, -4.15, 0);
        frameMesh.receiveShadow = true;
        chair.add(frameMesh);

        // 4 Turned Chair Legs (LatheGeometry reaching down to floor at y = -6.8)
        const chairLegPts = createTurnedChairLegPoints(2.65);
        const chairLegGeo = new THREE.LatheGeometry(chairLegPts, 16);
        const chairLegOffsets = [
          [-1.8, 1.7],
          [1.8, 1.7],
          [-1.8, -1.7],
          [1.8, -1.7]
        ];
        chairLegOffsets.forEach(([cx, cz]) => {
          const chairLeg = new THREE.Mesh(chairLegGeo, this.chairWoodMat);
          chairLeg.position.set(cx, -4.15, cz);
          chairLeg.receiveShadow = true;
          chair.add(chairLeg);
        });

        // Supportive Backrest Cushion via ExtrudeGeometry with Bevel
        const backShape = createRoundedRectShape(4.2, 3.8, 0.35);
        const backExtrude = {
          steps: 1,
          depth: 0.36,
          bevelEnabled: true,
          bevelThickness: 0.08,
          bevelSize: 0.08,
          bevelSegments: 4
        };
        const backGeo = new THREE.ExtrudeGeometry(backShape, backExtrude);
        backGeo.center();

        const backrestMesh = new THREE.Mesh(backGeo, this.chairCushionMat);
        backrestMesh.position.set(0, -1.9, -1.8);
        backrestMesh.receiveShadow = true;
        chair.add(backrestMesh);

        // InstancedMesh for 12 Tufted Buttons (6 on seat cushion + 6 on backrest cushion)
        const chairButtons = new THREE.InstancedMesh(buttonGeo, buttonMat, 12);
        chairButtons.receiveShadow = true;
        let btnIdx = 0;

        const seatTuftOffsets = [
          [-1.1, -0.9], [0, -0.9], [1.1, -0.9],
          [-1.1, 0.9], [0, 0.9], [1.1, 0.9]
        ];
        seatTuftOffsets.forEach(([bx, bz]) => {
          chairDummy.position.set(bx, -3.53, bz);
          chairDummy.rotation.set(0, 0, 0);
          chairDummy.scale.set(1, 1, 1);
          chairDummy.updateMatrix();
          chairButtons.setMatrixAt(btnIdx++, chairDummy.matrix);
        });

        const backTufts = [
          [-1.1, -1.3], [1.1, -1.3],
          [-1.1, -1.9], [1.1, -1.9],
          [-1.1, -2.5], [1.1, -2.5]
        ];
        backTufts.forEach(([tx, ty]) => {
          chairDummy.position.set(tx, ty, -1.54);
          chairDummy.rotation.set(Math.PI / 2, 0, 0);
          chairDummy.scale.set(1, 1, 1);
          chairDummy.updateMatrix();
          chairButtons.setMatrixAt(btnIdx++, chairDummy.matrix);
        });
        chairButtons.instanceMatrix.needsUpdate = true;
        chair.add(chairButtons);

        // Curved Armrests on Turned Spindle Supports
        const armRailShape = createRoundedRectShape(0.38, 3.4, 0.08);
        const armRailGeo = new THREE.ExtrudeGeometry(armRailShape, {
          steps: 1,
          depth: 0.14,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.03,
          bevelSegments: 2
        });
        armRailGeo.rotateX(Math.PI / 2);
        armRailGeo.center();

        // InstancedMesh for 4 turned armrest spindles
        const chairSpindles = new THREE.InstancedMesh(spindleGeo, this.chairWoodMat, 4);
        chairSpindles.receiveShadow = true;
        let spIdx = 0;

        [-2.0, 2.0].forEach(ax => {
          const armRail = new THREE.Mesh(armRailGeo, this.chairWoodMat);
          armRail.position.set(ax, -2.20, 0);
          armRail.receiveShadow = true;
          chair.add(armRail);

          [-1.2, 1.2].forEach(sz => {
            chairDummy.position.set(ax, -2.30, sz);
            chairDummy.rotation.set(0, 0, 0);
            chairDummy.scale.set(1, 1, 1);
            chairDummy.updateMatrix();
            chairSpindles.setMatrixAt(spIdx++, chairDummy.matrix);
          });
        });
        chairSpindles.instanceMatrix.needsUpdate = true;
        chair.add(chairSpindles);

        return chair;
      };

      // White player armchair (z = +9.2, facing -Z toward board)
      const whiteChair = createArmchair();
      whiteChair.position.set(0, 0, 9.2);
      whiteChair.rotation.y = Math.PI;
      this.chairsGroup.add(whiteChair);

      // Black player armchair (z = -9.2, facing +Z toward board)
      const blackChair = createArmchair();
      blackChair.position.set(0, 0, -9.2);
      blackChair.rotation.y = 0;
      this.chairsGroup.add(blackChair);
    }

    /**
     * Builds procedural 3D room interior:
     * Multi-channel PBR parquet/marble/timber floor at y = -6.8, tactile woven carpet at y = -6.78,
     * 4 enclosing walls with 3D raised wainscoting boiserie frame mouldings, baseboards,
     * 4 decorative brass wall sconces with warm PointLights, and ceiling at y = +15.2.
     */
    buildRoom(textures) {
      this.roomGroup = new THREE.Group();
      this.roomGroup.name = 'roomGroup';
      this.environmentGroup.add(this.roomGroup);

      const matClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

      // Floor at y = -6.8 (68 x 68) with Multi-Channel PBR Maps
      const floorGeo = new THREE.PlaneGeometry(68.0, 68.0);
      floorGeo.rotateX(-Math.PI / 2);
      this.floorMat = new matClass({
        map: textures.floorTex,
        roughnessMap: textures.floorRoughnessTex || null,
        bumpMap: textures.floorBumpTex || null,
        bumpScale: 0.02,
        roughness: 0.58,
        metalness: 0.08,
        clearcoat: this.theme === 'marble' ? 0.70 : (this.theme === 'wood' ? 0.35 : 0.45),
        clearcoatRoughness: 0.18
      });
      this.floorMesh = new THREE.Mesh(floorGeo, this.floorMat);
      this.floorMesh.position.set(0, -6.8, 0);
      this.floorMesh.receiveShadow = true;
      this.roomGroup.add(this.floorMesh);

      // Under-Table Woven Rug / Carpet (22 x 0.04 x 19 at y = -6.78) - Matte Fabric uses MeshStandardMaterial
      const carpetGeo = new THREE.BoxGeometry(22.0, 0.04, 19.0);
      this.carpetMat = new THREE.MeshStandardMaterial({
        map: textures.carpetTex,
        roughnessMap: textures.carpetRoughnessTex || null,
        bumpMap: textures.carpetBumpTex || null,
        bumpScale: 0.035,
        roughness: 0.90,
        metalness: 0.02
      });
      this.carpetMesh = new THREE.Mesh(carpetGeo, this.carpetMat);
      this.carpetMesh.position.set(0, -6.78, 0);
      this.carpetMesh.receiveShadow = true;
      this.roomGroup.add(this.carpetMesh);

      // 4 Enclosing Walls (Width 68, Height 22, centered at y = 4.2) - Matte Plaster uses MeshStandardMaterial
      this.wallMat = new THREE.MeshStandardMaterial({
        map: textures.wallTex,
        roughnessMap: textures.wallRoughnessTex || null,
        bumpMap: textures.wallBumpTex || null,
        bumpScale: 0.015,
        roughness: 0.85,
        metalness: 0.04
      });

      const wallGeo = new THREE.PlaneGeometry(68.0, 22.0);

      // North Wall (z = -34.0, facing +Z)
      const northWall = new THREE.Mesh(wallGeo, this.wallMat);
      northWall.position.set(0, 4.2, -34.0);
      northWall.receiveShadow = true;
      this.roomGroup.add(northWall);

      // South Wall (z = +34.0, facing -Z)
      const southWall = new THREE.Mesh(wallGeo, this.wallMat);
      southWall.position.set(0, 4.2, 34.0);
      southWall.rotation.y = Math.PI;
      southWall.receiveShadow = true;
      this.roomGroup.add(southWall);

      // West Wall (x = -34.0, facing +X)
      const westWall = new THREE.Mesh(wallGeo, this.wallMat);
      westWall.position.set(-34.0, 4.2, 0);
      westWall.rotation.y = Math.PI / 2;
      westWall.receiveShadow = true;
      this.roomGroup.add(westWall);

      // East Wall (x = +34.0, facing -X)
      const eastWall = new THREE.Mesh(wallGeo, this.wallMat);
      eastWall.position.set(34.0, 4.2, 0);
      eastWall.rotation.y = -Math.PI / 2;
      eastWall.receiveShadow = true;
      this.roomGroup.add(eastWall);

      // 3D Raised Wainscoting Boiserie Frame Mouldings via InstancedMesh (20 Panels, 1 Draw Call)
      const boiserieMat = new THREE.MeshStandardMaterial({
        color: this.theme === 'neon' ? 0x0a0f1d : (this.theme === 'marble' ? 0xe2e6ed : 0x221710),
        roughness: 0.60,
        metalness: 0.08
      });
      const boiserieGeo = new THREE.BoxGeometry(8.0, 3.8, 0.12);
      const boiserieInstanced = new THREE.InstancedMesh(boiserieGeo, boiserieMat, 20);
      boiserieInstanced.receiveShadow = true;

      const panelDummy = new THREE.Object3D();
      let bIdx = 0;

      // North & South walls boiserie
      [-22, -11, 0, 11, 22].forEach(px => {
        panelDummy.position.set(px, -4.2, -33.88);
        panelDummy.rotation.set(0, 0, 0);
        panelDummy.scale.set(1, 1, 1);
        panelDummy.updateMatrix();
        boiserieInstanced.setMatrixAt(bIdx++, panelDummy.matrix);

        panelDummy.position.set(px, -4.2, 33.88);
        panelDummy.rotation.set(0, 0, 0);
        panelDummy.scale.set(1, 1, 1);
        panelDummy.updateMatrix();
        boiserieInstanced.setMatrixAt(bIdx++, panelDummy.matrix);
      });

      // West & East walls boiserie
      [-22, -11, 0, 11, 22].forEach(pz => {
        panelDummy.position.set(-33.88, -4.2, pz);
        panelDummy.rotation.set(0, Math.PI / 2, 0);
        panelDummy.scale.set(1, 1, 1);
        panelDummy.updateMatrix();
        boiserieInstanced.setMatrixAt(bIdx++, panelDummy.matrix);

        panelDummy.position.set(33.88, -4.2, pz);
        panelDummy.rotation.set(0, -Math.PI / 2, 0);
        panelDummy.scale.set(1, 1, 1);
        panelDummy.updateMatrix();
        boiserieInstanced.setMatrixAt(bIdx++, panelDummy.matrix);
      });

      boiserieInstanced.instanceMatrix.needsUpdate = true;
      this.roomGroup.add(boiserieInstanced);

      // Chair Rail Moulding along walls at y = -2.1
      const chairRailN = new THREE.Mesh(new THREE.BoxGeometry(68.0, 0.22, 0.22), boiserieMat);
      chairRailN.position.set(0, -2.1, -33.85);
      this.roomGroup.add(chairRailN);
      const chairRailS = new THREE.Mesh(new THREE.BoxGeometry(68.0, 0.22, 0.22), boiserieMat);
      chairRailS.position.set(0, -2.1, 33.85);
      this.roomGroup.add(chairRailS);

      // 4 Decorative Brass Wall Sconces with warm PointLights (North & South walls at y = 5.5)
      const sconceBrassMat = new matClass({
        color: 0xd4af37,
        roughness: 0.25,
        metalness: 0.85,
        clearcoat: 0.7
      });
      const sconceShadeMat = new matClass({
        color: 0xfffaed,
        emissive: 0xffd180,
        emissiveIntensity: 0.6,
        roughness: 0.3
      });

      const addSconce = (sx, sy, sz, rotY) => {
        const sconceGroup = new THREE.Group();
        sconceGroup.position.set(sx, sy, sz);
        sconceGroup.rotation.y = rotY;

        // Brass Backplate
        const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16), sconceBrassMat);
        bp.rotateX(Math.PI / 2);
        sconceGroup.add(bp);

        // Curved Brass Arm
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12), sconceBrassMat);
        arm.position.set(0, 0.1, 0.35);
        arm.rotateX(Math.PI / 3);
        sconceGroup.add(arm);

        // Frosted Glass Shade / Flame
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 16), sconceShadeMat);
        shade.position.set(0, 0.42, 0.55);
        sconceGroup.add(shade);

        // Warm Accent Point Light
        const sconceLight = new THREE.PointLight(0xffb74d, 0.65, 16);
        sconceLight.position.set(0, 0.55, 0.7);
        sconceGroup.add(sconceLight);

        this.roomGroup.add(sconceGroup);
      };

      addSconce(-16.0, 5.5, -33.8, 0);
      addSconce(16.0, 5.5, -33.8, 0);
      addSconce(-16.0, 5.5, 33.8, Math.PI);
      addSconce(16.0, 5.5, 33.8, Math.PI);

      // Ceiling at y = +15.2 (facing -Y down into room)
      const ceilingGeo = new THREE.PlaneGeometry(68.0, 68.0);
      ceilingGeo.rotateX(Math.PI / 2);
      const ceilingMat = new THREE.MeshStandardMaterial({
        color: this.theme === 'neon' ? 0x05070e : (this.theme === 'marble' ? 0xedf0f5 : 0x2d241e),
        roughness: 0.9,
        metalness: 0.02
      });
      const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
      ceilingMesh.position.set(0, 15.2, 0);
      this.roomGroup.add(ceilingMesh);

      // Baseboard Plinth running along floor perimeter at y = -6.4
      const baseboardMat = new THREE.MeshStandardMaterial({
        color: this.theme === 'neon' ? 0x080c16 : 0x1e150f,
        roughness: 0.6,
        metalness: 0.1
      });
      const bbN = new THREE.Mesh(new THREE.BoxGeometry(68.0, 0.8, 0.3), baseboardMat);
      bbN.position.set(0, -6.4, -33.85);
      this.roomGroup.add(bbN);
      const bbS = new THREE.Mesh(new THREE.BoxGeometry(68.0, 0.8, 0.3), baseboardMat);
      bbS.position.set(0, -6.4, 33.85);
      this.roomGroup.add(bbS);
      const bbW = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 68.0), baseboardMat);
      bbW.position.set(-33.85, -6.4, 0);
      this.roomGroup.add(bbW);
      const bbE = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 68.0), baseboardMat);
      bbE.position.set(33.85, -6.4, 0);
      this.roomGroup.add(bbE);
    }

    /**
     * Builds theme-specific procedural 3D room decor on walls and perimeter:
     * - 'classic': 2 hollow open bookcases with ExtrudeGeometry cornice moulding, 4 shelves,
     *   varied books + tilted leaning books + 2 framed classical oil paintings with glass pane
     * - 'wood': heavy timber ceiling beams + rustic open bookcase + stone fireplace with glowing hearth point light
     * - 'marble': 8 fluted classical Ionic marble columns with plinths & capitals
     * - 'neon': 8 glowing vertical neon light pillars (cyan & magenta) + overhead glowing neon halo ring
     */
    buildThemeDecor(themeName) {
      while (this.decorGroup.children.length > 0) {
        const child = this.decorGroup.children[0];
        this.disposeObject(child);
        this.decorGroup.remove(child);
      }

      const textures = generateThemeTextures(themeName);
      const matClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

      if (themeName === 'classic') {
        // 1. Two hollow open wooden bookshelves ("Шафа для книг") with cornice crown moulding & InstancedMesh books
        const makeBookshelf = (bx, bz, rotY) => {
          const bsGroup = new THREE.Group();
          bsGroup.position.set(bx, 0, bz);
          bsGroup.rotation.y = rotY;

          const shelfWoodMat = new THREE.MeshStandardMaterial({
            color: 0x2c170d,
            roughness: 0.58,
            metalness: 0.08
          });

          // Upright Side Walls (Left & Right)
          const sideGeo = new THREE.BoxGeometry(0.35, 12.0, 1.6);
          const leftSide = new THREE.Mesh(sideGeo, shelfWoodMat);
          leftSide.position.set(-3.82, -0.8, 0);
          leftSide.receiveShadow = true;
          bsGroup.add(leftSide);

          const rightSide = new THREE.Mesh(sideGeo, shelfWoodMat);
          rightSide.position.set(3.82, -0.8, 0);
          rightSide.receiveShadow = true;
          bsGroup.add(rightSide);

          // Back Wall Panel
          const backGeo = new THREE.BoxGeometry(7.6, 12.0, 0.15);
          const backMesh = new THREE.Mesh(backGeo, shelfWoodMat);
          backMesh.position.set(0, -0.8, -0.72);
          backMesh.receiveShadow = true;
          bsGroup.add(backMesh);

          // Base Plinth
          const plinthGeo = new THREE.BoxGeometry(8.2, 0.8, 1.8);
          const plinthMesh = new THREE.Mesh(plinthGeo, shelfWoodMat);
          plinthMesh.position.set(0, -6.4, 0);
          plinthMesh.receiveShadow = true;
          bsGroup.add(plinthMesh);

          // Top Cornice Crown Moulding via ExtrudeGeometry
          const corniceShape = createCorniceShape();
          const corniceGeo = new THREE.ExtrudeGeometry(corniceShape, {
            steps: 1,
            depth: 8.4,
            bevelEnabled: false
          });
          corniceGeo.rotateY(Math.PI / 2);
          corniceGeo.center();
          const corniceMesh = new THREE.Mesh(corniceGeo, shelfWoodMat);
          corniceMesh.position.set(0, 5.3, 0);
          corniceMesh.receiveShadow = true;
          bsGroup.add(corniceMesh);

          // 4 Horizontal Shelves & InstancedMesh Books
          const bookColors = [0x7f1d1d, 0x1e3a8a, 0x14532d, 0x78350f, 0x854d0e, 0x3f3f46, 0x581c87];
          const shelfY = [-4.6, -2.0, 0.6, 3.2];
          const bookTransforms = [];
          const dummyBook = new THREE.Object3D();

          shelfY.forEach((sy, sIdx) => {
            const board = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.22, 1.4), shelfWoodMat);
            board.position.set(0, sy, 0.02);
            board.receiveShadow = true;
            bsGroup.add(board);

            // Populate transforms and colors for books
            let curX = -3.4;
            let bCount = 0;
            while (curX < 3.1 && bCount < 22) {
              const bWidth = 0.22 + ((bCount * 7) % 5) * 0.035;
              const bHeight = 1.35 + ((bCount * 11) % 6) * 0.08;
              const bColor = new THREE.Color(bookColors[(sIdx * 3 + bCount) % bookColors.length]);

              let posX = curX + bWidth / 2;
              let posY = sy + bHeight / 2 + 0.11;
              let posZ = 0.05;
              let rotZ = 0;

              // Tilted leaning book resting naturally against upright
              if (sIdx % 2 === 0 && curX > 2.4 && bCount > 15) {
                rotZ = 0.28;
                curX += bWidth + 0.35;
              } else if (sIdx % 2 === 1 && curX < -2.8 && bCount === 0) {
                posX += 0.1;
                rotZ = -0.25;
                curX += bWidth + 0.30;
              } else {
                curX += bWidth + 0.03;
              }

              bookTransforms.push({
                pos: [posX, posY, posZ],
                rot: [0, 0, rotZ],
                scale: [bWidth, bHeight, 1.1],
                color: bColor
              });
              bCount++;
            }
          });

          // Single InstancedMesh for all books in this bookcase (Massive draw call reduction!)
          const unitBookGeo = new THREE.BoxGeometry(1, 1, 1);
          const bookInstMat = new THREE.MeshStandardMaterial({
            roughness: 0.65,
            metalness: 0.06
          });
          const booksInstancedMesh = new THREE.InstancedMesh(unitBookGeo, bookInstMat, bookTransforms.length);
          booksInstancedMesh.receiveShadow = true;

          bookTransforms.forEach((bt, idx) => {
            dummyBook.position.set(bt.pos[0], bt.pos[1], bt.pos[2]);
            dummyBook.rotation.set(bt.rot[0], bt.rot[1], bt.rot[2]);
            dummyBook.scale.set(bt.scale[0], bt.scale[1], bt.scale[2]);
            dummyBook.updateMatrix();
            booksInstancedMesh.setMatrixAt(idx, dummyBook.matrix);
            booksInstancedMesh.setColorAt(idx, bt.color);
          });
          booksInstancedMesh.instanceMatrix.needsUpdate = true;
          if (booksInstancedMesh.instanceColor) booksInstancedMesh.instanceColor.needsUpdate = true;
          bsGroup.add(booksInstancedMesh);

          return bsGroup;
        };

        this.decorGroup.add(makeBookshelf(-32.6, -8.0, Math.PI / 2));
        this.decorGroup.add(makeBookshelf(32.6, -8.0, -Math.PI / 2));

        // 2. Framed Classical Oil Paintings with Gold Moulded Frame & Protective Glass Layer
        const makeFramedPainting = (px, py, pz, rotY, tex) => {
          const paintGroup = new THREE.Group();
          paintGroup.position.set(px, py, pz);
          paintGroup.rotation.y = rotY;

          // Multi-layer Gold Moulded Frame (distant wall painting - no castShadow)
          const goldMat = new matClass({
            color: 0xd4af37,
            roughness: 0.28,
            metalness: 0.88,
            clearcoat: 0.75,
            clearcoatRoughness: 0.15
          });
          const outerFrame = new THREE.Mesh(new THREE.BoxGeometry(9.2, 6.2, 0.4), goldMat);
          paintGroup.add(outerFrame);

          // Inner Linen Liner (Matte MeshStandardMaterial)
          const linerMat = new THREE.MeshStandardMaterial({ color: 0x221a14, roughness: 0.8 });
          const liner = new THREE.Mesh(new THREE.BoxGeometry(8.4, 5.4, 0.42), linerMat);
          paintGroup.add(liner);

          // Canvas with Classical Painting (Matte MeshStandardMaterial)
          const canvasMat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.72,
            metalness: 0.02
          });
          const canvasMesh = new THREE.Mesh(new THREE.BoxGeometry(8.0, 5.0, 0.44), canvasMat);
          paintGroup.add(canvasMesh);

          // Protective Glass Pane in Front of Canvas
          const glassMat = new matClass({
            clearcoat: 1.0,
            clearcoatRoughness: 0.04,
            opacity: 0.18,
            transparent: true,
            roughness: 0.05,
            reflectivity: 0.90
          });
          const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 5.0), glassMat);
          glassPane.position.set(0, 0, 0.23);
          paintGroup.add(glassPane);

          return paintGroup;
        };

        this.decorGroup.add(makeFramedPainting(0, 4.5, -33.7, 0, textures.paintingTex1));
        this.decorGroup.add(makeFramedPainting(0, 4.5, 33.7, Math.PI, textures.paintingTex2));

      } else if (themeName === 'wood') {
        // 1. Heavy Timber Ceiling Beams (Matte MeshStandardMaterial)
        const beamMat = new THREE.MeshStandardMaterial({
          color: 0x3d2012,
          roughness: 0.70,
          metalness: 0.05
        });
        const beamGeo = new THREE.BoxGeometry(68.0, 1.2, 1.2);
        [-25, -15, -5, 5, 15, 25].forEach(bz => {
          const beam = new THREE.Mesh(beamGeo, beamMat);
          beam.position.set(0, 14.4, bz);
          beam.receiveShadow = true;
          this.decorGroup.add(beam);
        });

        // 2. Rustic Bookshelf on East Wall with Books
        const rusticShelfMat = new THREE.MeshStandardMaterial({
          color: 0x482816,
          roughness: 0.65,
          metalness: 0.04
        });
        const rusticGroup = new THREE.Group();
        rusticGroup.position.set(32.6, -1.8, 0);
        rusticGroup.rotation.y = -Math.PI / 2;

        const eastShelf = new THREE.Mesh(new THREE.BoxGeometry(8.0, 10.0, 1.8), rusticShelfMat);
        eastShelf.receiveShadow = true;
        rusticGroup.add(eastShelf);
        this.decorGroup.add(rusticGroup);

        // 3. Stone Fireplace on West Wall with Glowing Warm Hearth Point Light
        const fireplaceGroup = new THREE.Group();
        fireplaceGroup.position.set(-32.0, 0, 0);
        fireplaceGroup.rotation.y = Math.PI / 2;

        const stoneMat = new THREE.MeshStandardMaterial({
          color: 0x5a5652,
          roughness: 0.85,
          metalness: 0.05
        });
        const mantel = new THREE.Mesh(new THREE.BoxGeometry(9.0, 9.5, 3.5), stoneMat);
        mantel.position.set(0, -2.05, 0);
        mantel.receiveShadow = true;
        fireplaceGroup.add(mantel);

        const fireboxMat = new THREE.MeshStandardMaterial({
          color: 0x141210,
          roughness: 0.95
        });
        const firebox = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.6, 2.5), fireboxMat);
        firebox.position.set(0, -4.8, 0.6);
        fireplaceGroup.add(firebox);

        const hearthMat = new THREE.MeshStandardMaterial({
          color: 0xff3300,
          emissive: 0xff4400,
          emissiveIntensity: 1.8,
          roughness: 0.6
        });
        const hearthMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, 1.6), hearthMat);
        hearthMesh.position.set(0, -6.2, 0.6);
        fireplaceGroup.add(hearthMesh);

        const hearthLight = new THREE.PointLight(0xff7722, 1.4, 25);
        hearthLight.position.set(0, -5.5, 1.8);
        fireplaceGroup.add(hearthLight);

        this.decorGroup.add(fireplaceGroup);

      } else if (themeName === 'marble') {
        // 8 Fluted Classical Marble Ionic Columns with Plinths and Capitals
        const columnMat = new matClass({
          color: 0xedf0f5,
          roughness: 0.32,
          metalness: 0.10,
          clearcoat: 0.70,
          clearcoatRoughness: 0.12
        });
        const columnShaftGeo = new THREE.CylinderGeometry(1.2, 1.2, 21.0, 24);
        const plinthGeo = new THREE.BoxGeometry(3.2, 1.0, 3.2);
        const capitalGeo = new THREE.BoxGeometry(3.4, 1.2, 3.4);

        const columnLocations = [
          [-30, 22], [30, 22],
          [-30, -22], [30, -22],
          [-30, 0], [30, 0],
          [-16, -32], [16, -32]
        ];

        columnLocations.forEach(([cx, cz]) => {
          const colGroup = new THREE.Group();
          colGroup.position.set(cx, 0, cz);

          const plinth = new THREE.Mesh(plinthGeo, columnMat);
          plinth.position.set(0, -6.3, 0);
          plinth.receiveShadow = true;
          colGroup.add(plinth);

          const shaft = new THREE.Mesh(columnShaftGeo, columnMat);
          shaft.position.set(0, 4.2, 0);
          shaft.receiveShadow = true;
          colGroup.add(shaft);

          const capital = new THREE.Mesh(capitalGeo, columnMat);
          capital.position.set(0, 14.6, 0);
          capital.receiveShadow = true;
          colGroup.add(capital);

          this.decorGroup.add(colGroup);
        });

      } else if (themeName === 'neon') {
        // 1. Eight Vertical Glowing Neon Light Pillars (alternating cyan & magenta)
        const pillarLocations = [
          [-32, 20, 0x00f0ff], [32, 20, 0xff007f],
          [-32, -20, 0xff007f], [32, -20, 0x00f0ff],
          [-32, 7, 0x00f0ff], [32, 7, 0xff007f],
          [-32, -7, 0xff007f], [32, -7, 0x00f0ff]
        ];

        const pillarGeo = new THREE.CylinderGeometry(0.35, 0.35, 21.0, 16);

        pillarLocations.forEach(([px, pz, pCol]) => {
          const pMat = new matClass({
            color: pCol,
            emissive: pCol,
            emissiveIntensity: 2.2,
            roughness: 0.2,
            metalness: 0.8,
            clearcoat: 0.6
          });
          const pillar = new THREE.Mesh(pillarGeo, pMat);
          pillar.position.set(px, 4.2, pz);
          this.decorGroup.add(pillar);

          const pLight = new THREE.PointLight(pCol, 0.9, 18);
          pLight.position.set(px > 0 ? px - 1.5 : px + 1.5, 4.2, pz);
          this.decorGroup.add(pLight);
        });

        // 2. Overhead Glowing Neon Halo Ring
        const haloGeo = new THREE.TorusGeometry(14.0, 0.28, 16, 64);
        haloGeo.rotateX(Math.PI / 2);
        const haloMat = new matClass({
          color: 0x00f0ff,
          emissive: 0x00f0ff,
          emissiveIntensity: 2.5,
          roughness: 0.2,
          clearcoat: 0.8
        });
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        haloMesh.position.set(0, 13.5, 0);
        this.decorGroup.add(haloMesh);
      }
    }

    /**
     * Updates materials of table, floor, carpet, walls, and chairs when theme changes
     */
    updateEnvironmentMaterials(textures, themeName) {
      if (this.tableMat) {
        this.tableMat.map = textures.tableTex;
        if (textures.tableRoughnessTex) this.tableMat.roughnessMap = textures.tableRoughnessTex;
        if (textures.tableBumpTex) this.tableMat.bumpMap = textures.tableBumpTex;
        this.tableMat.color.set(textures.tableColor);
        this.tableMat.needsUpdate = true;
      }
      if (this.floorMat) {
        this.floorMat.map = textures.floorTex;
        if (textures.floorRoughnessTex) this.floorMat.roughnessMap = textures.floorRoughnessTex;
        if (textures.floorBumpTex) this.floorMat.bumpMap = textures.floorBumpTex;
        this.floorMat.needsUpdate = true;
      }
      if (this.carpetMat) {
        this.carpetMat.map = textures.carpetTex;
        if (textures.carpetRoughnessTex) this.carpetMat.roughnessMap = textures.carpetRoughnessTex;
        if (textures.carpetBumpTex) this.carpetMat.bumpMap = textures.carpetBumpTex;
        this.carpetMat.needsUpdate = true;
      }
      if (this.wallMat) {
        this.wallMat.map = textures.wallTex;
        if (textures.wallRoughnessTex) this.wallMat.roughnessMap = textures.wallRoughnessTex;
        if (textures.wallBumpTex) this.wallMat.bumpMap = textures.wallBumpTex;
        this.wallMat.needsUpdate = true;
      }
      if (this.chairWoodMat && this.chairCushionMat) {
        let woodCol = 0x2e1910;
        let cushionCol = 0x54141b;
        if (themeName === 'wood') {
          woodCol = 0x422617;
          cushionCol = 0x2d442b;
        } else if (themeName === 'marble') {
          woodCol = 0x242830;
          cushionCol = 0x1e2c45;
        } else if (themeName === 'neon') {
          woodCol = 0x0c0e16;
          cushionCol = 0x141a29;
        }
        this.chairWoodMat.color.set(woodCol);
        this.chairWoodMat.needsUpdate = true;
        this.chairCushionMat.color.set(cushionCol);
        this.chairCushionMat.needsUpdate = true;
      }
    }

    /**
     * Initializes Highlight container group
     */
    initHighlights() {
      this.boardGroup.add(this.highlightGroup);
    }

    /**
     * Highlights squares according to state:
     * @param {Object} options
     *   - selected: 'e2'
     *   - legalMoves: ['e3', 'e4'] or [{ to: 'e4', captured: true }]
     *   - lastMove: { from: 'e2', to: 'e4' } or ['e2', 'e4']
     *   - checkSquare: 'e1'
     */
    highlightSquares(options = {}) {
      this.clearHighlights();

      const { selected, legalMoves, lastMove, checkSquare } = options;

      // 1. Last Move highlights (soft warm yellow / cyan glow on from & to)
      if (lastMove) {
        const fromSquare = typeof lastMove === 'object' && lastMove.from ? lastMove.from : (Array.isArray(lastMove) ? lastMove[0] : null);
        const toSquare = typeof lastMove === 'object' && lastMove.to ? lastMove.to : (Array.isArray(lastMove) ? lastMove[1] : null);

        if (fromSquare) this.createSquareHighlight(fromSquare, 0xfacc15, 0.32, 'fill');
        if (toSquare) this.createSquareHighlight(toSquare, 0xfacc15, 0.40, 'fill');
      }

      // 2. Selected Square highlight (amber / emerald glowing border & fill)
      if (selected) {
        this.createSquareHighlight(selected, 0x10b981, 0.45, 'selected');
      }

      // 3. Legal Moves (dots for empty squares, brackets/rings for captures)
      if (Array.isArray(legalMoves)) {
        for (const move of legalMoves) {
          const targetSquare = typeof move === 'string' ? move : move.to;
          if (!targetSquare) continue;

          // Check if square is occupied
          const isCapture = this.pieceMap.has(targetSquare) || (move.flags && move.flags.capture);

          if (isCapture) {
            this.createCaptureMarker(targetSquare);
          } else {
            this.createMoveDotMarker(targetSquare);
          }
        }
      }

      // 4. Check Square (pulsing danger red aura under the king)
      if (checkSquare) {
        this.createCheckMarker(checkSquare);
      }

      this.requestRender(false);
    }

    /**
     * Clears all active highlights
     */
    clearHighlights() {
      while (this.highlightGroup.children.length > 0) {
        const child = this.highlightGroup.children[0];
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
        if (child.geometry) child.geometry.dispose();
        this.highlightGroup.remove(child);
      }
      this.highlightMeshes = [];
      this.checkPulseMesh = null;
      this.requestRender(false);
    }

    createSquareHighlight(square, hexColor, opacity = 0.4, type = 'fill') {
      const pos = squareToWorld(square);
      const group = new THREE.Group();
      // y = 0.005 for selected, y = 0.003 for lastMove
      const yPos = type === 'selected' ? 0.005 : 0.003;
      group.position.set(pos.x, yPos, pos.z);

      const fillGeo = new THREE.PlaneGeometry(0.96, 0.96);
      const fillMat = new THREE.MeshBasicMaterial({
        color: hexColor,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.rotation.x = -Math.PI / 2;
      group.add(fillMesh);

      if (type === 'selected') {
        // Glowing perimeter border
        const edges = new THREE.EdgesGeometry(fillGeo);
        const lineMat = new THREE.LineBasicMaterial({
          color: hexColor,
          linewidth: 2,
          transparent: true,
          opacity: 0.95,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        });
        const borderMesh = new THREE.LineSegments(edges, lineMat);
        borderMesh.rotation.x = -Math.PI / 2;
        group.add(borderMesh);
      }

      this.highlightGroup.add(group);
      this.highlightMeshes.push(group);
      return group;
    }

    createMoveDotMarker(square) {
      const pos = squareToWorld(square);
      const dotGeo = new THREE.CircleGeometry(0.16, 24);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(pos.x, 0.007, pos.z);

      this.highlightGroup.add(dot);
      this.highlightMeshes.push(dot);
      return dot;
    }

    createCaptureMarker(square) {
      const pos = squareToWorld(square);
      // Sleek hollow ring hugging the piece base at y = 0.007
      const ringGeo = new THREE.RingGeometry(0.36, 0.46, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.007, pos.z);

      this.highlightGroup.add(ring);
      this.highlightMeshes.push(ring);
      return ring;
    }

    createCheckMarker(square) {
      const pos = squareToWorld(square);
      const checkGeo = new THREE.RingGeometry(0.20, 0.48, 32);
      const checkMat = new THREE.MeshBasicMaterial({
        color: 0xff0033,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const checkMesh = new THREE.Mesh(checkGeo, checkMat);
      checkMesh.rotation.x = -Math.PI / 2;
      checkMesh.position.set(pos.x, 0.006, pos.z);

      this.highlightGroup.add(checkMesh);
      this.highlightMeshes.push(checkMesh);
      this.checkPulseMesh = checkMesh;
      return checkMesh;
    }

    /**
     * Builds flat 2D geometry for tactical arrows (straight or Chess.com L-shaped)
     */
    createArrowGeometry(fromSquare, toSquare) {
      const fromPos = squareToWorld(fromSquare);
      const toPos = squareToWorld(toSquare);
      const fromCoords = squareToCoords(fromSquare);
      const toCoords = squareToCoords(toSquare);
      if (!fromCoords || !toCoords) return null;

      const dCol = toCoords.col - fromCoords.col;
      const dRow = toCoords.row - fromCoords.row;
      const isStraight = (dCol === 0 || dRow === 0 || Math.abs(dCol) === Math.abs(dRow));

      const w = 0.18;
      const w2 = w / 2;
      const hw = 0.42;
      const hw2 = hw / 2;
      const hl = 0.36;

      const positions = [];

      function addTri(p1, p2, p3) {
        positions.push(p1.x, 0, p1.z, p2.x, 0, p2.z, p3.x, 0, p3.z);
      }

      function addQuad(p1, p2, p3, p4) {
        addTri(p1, p2, p3);
        addTri(p1, p3, p4);
      }

      if (isStraight) {
        const dx = toPos.x - fromPos.x;
        const dz = toPos.z - fromPos.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) return null;

        const ux = dx / len;
        const uz = dz / len;
        const nx = -uz;
        const nz = ux;

        const sx = fromPos.x + ux * 0.20;
        const sz = fromPos.z + uz * 0.20;
        const bx = toPos.x - ux * hl;
        const bz = toPos.z - uz * hl;
        const tx = toPos.x - ux * 0.05;
        const tz = toPos.z - uz * 0.05;

        const p1 = { x: sx - nx * w2, z: sz - nz * w2 };
        const p2 = { x: sx + nx * w2, z: sz + nz * w2 };
        const p3 = { x: bx + nx * w2, z: bz + nz * w2 };
        const p4 = { x: bx - nx * w2, z: bz - nz * w2 };
        addQuad(p1, p2, p3, p4);

        const h1 = { x: bx - nx * hw2, z: bz - nz * hw2 };
        const h2 = { x: bx + nx * hw2, z: bz + nz * hw2 };
        const h3 = { x: tx, z: tz };
        addTri(h1, h2, h3);
      } else {
        // L-shaped arrow ("стрілка буквою Г")
        // Choose elbow along the longer leg first:
        // if Math.abs(dRow) >= Math.abs(dCol), elbow is (x1, z2); else (x2, z1)
        let bx, bz;
        if (Math.abs(dRow) >= Math.abs(dCol)) {
          bx = fromPos.x;
          bz = toPos.z;
        } else {
          bx = toPos.x;
          bz = fromPos.z;
        }

        // Segment 1: fromPos -> B
        const d1x = bx - fromPos.x;
        const d1z = bz - fromPos.z;
        const len1 = Math.hypot(d1x, d1z);
        if (len1 < 0.001) return null;
        const u1x = d1x / len1;
        const u1z = d1z / len1;
        const n1x = -u1z;
        const n1z = u1x;

        // Segment 2: B -> toPos
        const d2x = toPos.x - bx;
        const d2z = toPos.z - bz;
        const len2 = Math.hypot(d2x, d2z);
        if (len2 < 0.001) return null;
        const u2x = d2x / len2;
        const u2z = d2z / len2;
        const n2x = -u2z;
        const n2z = u2x;

        const s = n1x * u2x + n1z * u2z; // turn direction (+1 or -1)

        // Shaft 1 start
        const sx = fromPos.x + u1x * 0.20;
        const sz = fromPos.z + u1z * 0.20;
        const s1_left = { x: sx - n1x * w2, z: sz - n1z * w2 };
        const s1_right = { x: sx + n1x * w2, z: sz + n1z * w2 };

        // Elbow diagonal corners
        const p_inner = {
          x: bx + s * w2 * u2x - w2 * u1x,
          z: bz + s * w2 * u2z - w2 * u1z
        };
        const p_outer = {
          x: bx - s * w2 * u2x + w2 * u1x,
          z: bz - s * w2 * u2z + w2 * u1z
        };

        if (s > 0) {
          addQuad(s1_left, s1_right, p_inner, p_outer);
        } else {
          addQuad(s1_right, s1_left, p_inner, p_outer);
        }

        // Shaft 2 end (head base)
        const kx = toPos.x - u2x * hl;
        const kz = toPos.z - u2z * hl;
        const k2_left = { x: kx - n2x * w2, z: kz - n2z * w2 };
        const k2_right = { x: kx + n2x * w2, z: kz + n2z * w2 };

        if (s > 0) {
          addQuad(p_outer, p_inner, k2_left, k2_right);
        } else {
          addQuad(p_outer, p_inner, k2_right, k2_left);
        }

        // Arrowhead pointing along Segment 2 into toSquare
        const h1 = { x: kx - n2x * hw2, z: kz - n2z * hw2 };
        const h2 = { x: kx + n2x * hw2, z: kz + n2z * hw2 };
        const tip = { x: toPos.x - u2x * 0.05, z: toPos.z - u2z * 0.05 };
        addTri(h1, h2, tip);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      return geo;
    }

    createArrowMesh(fromSquare, toSquare, isPreview = false) {
      const geo = this.createArrowGeometry(fromSquare, toSquare);
      if (!geo) return null;

      const mat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: isPreview ? 0.55 : 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { fromSquare, toSquare, isPreview };
      return mesh;
    }

    drawArrow(fromSquare, toSquare) {
      if (!fromSquare || !toSquare || fromSquare === toSquare) return null;
      const key = `${fromSquare}->${toSquare}`;
      if (this.drawnArrows.has(key)) return this.drawnArrows.get(key);

      const mesh = this.createArrowMesh(fromSquare, toSquare, false);
      if (!mesh) return null;

      this.arrowsGroup.add(mesh);
      this.drawnArrows.set(key, mesh);
      this.requestRender(false);
      return mesh;
    }

    removeArrow(fromSquare, toSquare) {
      const key = `${fromSquare}->${toSquare}`;
      const mesh = this.drawnArrows.get(key);
      if (!mesh) return false;

      this.arrowsGroup.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      this.drawnArrows.delete(key);
      this.requestRender(false);
      return true;
    }

    toggleArrow(fromSquare, toSquare) {
      if (!fromSquare || !toSquare || fromSquare === toSquare) return false;
      const key = `${fromSquare}->${toSquare}`;
      if (this.drawnArrows.has(key)) {
        this.removeArrow(fromSquare, toSquare);
        return false;
      } else {
        this.drawArrow(fromSquare, toSquare);
        return true;
      }
    }

    clearArrows() {
      if (this.previewArrowMesh) {
        this.arrowsGroup.remove(this.previewArrowMesh);
        if (this.previewArrowMesh.geometry) this.previewArrowMesh.geometry.dispose();
        if (this.previewArrowMesh.material) this.previewArrowMesh.material.dispose();
        this.previewArrowMesh = null;
        this.lastPreviewToSquare = null;
      }

      if (!this.drawnArrows || this.drawnArrows.size === 0) return;

      for (const mesh of this.drawnArrows.values()) {
        this.arrowsGroup.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      }
      this.drawnArrows.clear();
      this.requestRender(false);
    }

    /**
     * Instantiates a piece mesh using window.ChessPieces3D or fallback
     */
    createPieceMesh(type, color) {
      if (this.viewMode === '2d') {
        if (window.ChessPieces3D && typeof window.ChessPieces3D.createPiece2DMesh === 'function') {
          const mesh = window.ChessPieces3D.createPiece2DMesh(type, color, this.theme);
          if (mesh) return mesh;
        }
        if (window.ChessPieces3D && typeof window.ChessPieces3D.createPieceMesh === 'function') {
          const mesh = window.ChessPieces3D.createPieceMesh(type, color, this.theme, '2d');
          if (mesh) return mesh;
        }
        return createFallbackPiece2DMesh(type, color, this.theme);
      }

      // 3D Mode
      if (window.ChessPieces3D && typeof window.ChessPieces3D.createPieceMesh === 'function') {
        const mesh = window.ChessPieces3D.createPieceMesh(type, color, this.theme, '3d');
        if (mesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          return mesh;
        }
      }
      return createFallbackPieceMesh(type, color, this.theme);
    }

    /**
     * Synchronizes 3D pieces with the engine 8x8 board representation and plays smooth animations:
     * - Sliding pieces
     * - Parabolic jump arc for Knights
     * - Simultaneous Rook movement for Castling
     * - Disappearing captured pieces
     * - Pawn promotions
     *
     * @param {Array<Array>} board - 8x8 array (row 0=rank 8, row 7=rank 1; col 0=file 'a', col 7=file 'h')
     * @param {Object} lastMove - { from: 'e2', to: 'e4', piece: 'p', rookMove: { from, to }, ... }
     */
    syncBoard(board, lastMove = null) {
      if (!Array.isArray(board)) return;

      // Clear tactical arrows on any board move
      this.clearArrows();

      // Extract move details if provided
      const fromSquare = lastMove ? (lastMove.from || null) : null;
      const toSquare = lastMove ? (lastMove.to || null) : null;
      const movingPieceType = lastMove ? (lastMove.piece || null) : null;
      const rookMove = lastMove ? (lastMove.rookMove || null) : null;

      // Check if this was a castling move without explicit rookMove provided
      let castleRookMove = rookMove;
      if (!castleRookMove && fromSquare && toSquare) {
        if (fromSquare === 'e1' && toSquare === 'g1') castleRookMove = { from: 'h1', to: 'f1' };
        else if (fromSquare === 'e1' && toSquare === 'c1') castleRookMove = { from: 'a1', to: 'd1' };
        else if (fromSquare === 'e8' && toSquare === 'g8') castleRookMove = { from: 'h8', to: 'f8' };
        else if (fromSquare === 'e8' && toSquare === 'c8') castleRookMove = { from: 'a8', to: 'd8' };
      }

      // Check if this move was just executed via user drag-and-drop
      const wasDraggedHere = Boolean(
        this.justDropped &&
        this.justDropped.from === fromSquare &&
        this.justDropped.to === toSquare
      );
      this.justDropped = null;

      // Handle animated move
      const animatedSquares = new Set();

      if (fromSquare && toSquare && this.pieceMap.has(fromSquare)) {
        const pieceEntry = this.pieceMap.get(fromSquare);
        const mesh = pieceEntry.mesh;
        const fromPos = squareToWorld(fromSquare);
        const toPos = squareToWorld(toSquare);
        const isKnight = pieceEntry.type === 'n' || movingPieceType === 'n';

        // Detect captured piece (including en-passant)
        let capturedMesh = null;
        if (this.pieceMap.has(toSquare)) {
          capturedMesh = this.pieceMap.get(toSquare).mesh;
        } else if (pieceEntry.type === 'p' && fromSquare[0] !== toSquare[0]) {
          const epSquare = toSquare[0] + fromSquare[1];
          if (this.pieceMap.has(epSquare)) {
            capturedMesh = this.pieceMap.get(epSquare).mesh;
            this.pieceMap.delete(epSquare);
            animatedSquares.add(epSquare);
          }
        }

        if (wasDraggedHere) {
          // Piece was already placed at toSquare by drag-and-drop: do NOT animate from fromSquare
          const yPos = this.viewMode === '2d' ? 0.02 : 0;
          mesh.position.set(toPos.x, yPos, toPos.z);
          if (this.viewMode === '2d') {
            mesh.rotation.y = this.isFlipped ? Math.PI : 0;
          }

          // Handle promotion visual update immediately if needed
          if (lastMove && lastMove.promotion) {
            this.replaceWithPromotedPiece(toSquare, lastMove.promotion, pieceEntry.color);
          }
        } else {
          // Animate main piece (for Click-to-Move, AI moves, etc.)
          this.animatePieceMove({
            mesh: mesh,
            fromPos: fromPos,
            toPos: toPos,
            isKnight: isKnight,
            duration: isKnight ? 380 : 280,
            onComplete: () => {
              mesh.position.copy(toPos);
              // Handle promotion visual update
              if (lastMove && lastMove.promotion) {
                this.replaceWithPromotedPiece(toSquare, lastMove.promotion, pieceEntry.color);
              }
            }
          });
        }

        // Update pieceMap registration
        this.pieceMap.delete(fromSquare);
        this.pieceMap.set(toSquare, pieceEntry);
        animatedSquares.add(fromSquare);
        animatedSquares.add(toSquare);

        // Animate simultaneous castling rook if applicable
        if (castleRookMove && this.pieceMap.has(castleRookMove.from)) {
          const rookEntry = this.pieceMap.get(castleRookMove.from);
          const rookFromPos = squareToWorld(castleRookMove.from);
          const rookToPos = squareToWorld(castleRookMove.to);

          this.animatePieceMove({
            mesh: rookEntry.mesh,
            fromPos: rookFromPos,
            toPos: rookToPos,
            isKnight: false,
            duration: 280,
            onComplete: () => {
              rookEntry.mesh.position.copy(rookToPos);
            }
          });

          this.pieceMap.delete(castleRookMove.from);
          this.pieceMap.set(castleRookMove.to, rookEntry);
          animatedSquares.add(castleRookMove.from);
          animatedSquares.add(castleRookMove.to);
        }

        // Animate capture dissolution
        if (capturedMesh) {
          this.animateCaptureDissolve(capturedMesh);
        }
      } else {
        this.justDropped = null;
      }

      // Synchronize the full board state
      const targetMap = new Map(); // square -> { type, color }
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col];
          if (piece) {
            const sq = coordsToSquare(row, col);
            targetMap.set(sq, { type: piece.type, color: piece.color });
          }
        }
      }

      // Remove pieces no longer on board (that are not currently animating)
      for (const [sq, entry] of this.pieceMap.entries()) {
        if (!targetMap.has(sq) && !animatedSquares.has(sq)) {
          this.piecesGroup.remove(entry.mesh);
          this.disposeObject(entry.mesh);
          this.pieceMap.delete(sq);
        }
      }

      // Add or update pieces
      for (const [sq, target] of targetMap.entries()) {
        if (animatedSquares.has(sq)) continue;

        const existing = this.pieceMap.get(sq);
        const yPos = this.viewMode === '2d' ? 0.02 : 0;
        if (existing && existing.type === target.type && existing.color === target.color) {
          // Exactly matches, verify position
          const worldPos = squareToWorld(sq);
          existing.mesh.position.set(worldPos.x, yPos, worldPos.z);
          if (this.viewMode === '2d') {
            existing.mesh.rotation.y = this.isFlipped ? Math.PI : 0;
          }
        } else {
          // Replace or create piece
          if (existing) {
            this.piecesGroup.remove(existing.mesh);
            this.disposeObject(existing.mesh);
            this.pieceMap.delete(sq);
          }

          const newMesh = this.createPieceMesh(target.type, target.color);
          const worldPos = squareToWorld(sq);
          newMesh.position.set(worldPos.x, yPos, worldPos.z);
          if (this.viewMode === '2d') {
            newMesh.rotation.y = this.isFlipped ? Math.PI : 0;
          } else if (target.type === 'n' && target.color === 'b') {
            newMesh.rotation.y = Math.PI;
          }
          newMesh.userData = { square: sq, type: target.type, color: target.color, mode: this.viewMode };

          this.piecesGroup.add(newMesh);
          this.pieceMap.set(sq, {
            mesh: newMesh,
            type: target.type,
            color: target.color
          });
        }
      }

      this.requestRender(true);
    }

    /**
     * Executes smooth piece movement animation (sliding or knight parabolic arc)
     */
    animatePieceMove({ mesh, fromPos, toPos, isKnight, duration = 300, onComplete = null }) {
      const startTime = performance.now();
      const arcHeight = isKnight ? 1.25 : 0.0;

      const animation = {
        mesh,
        fromPos: fromPos.clone(),
        toPos: toPos.clone(),
        isKnight,
        arcHeight,
        startTime,
        duration,
        onComplete,
        update: (now) => {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / duration, 1.0);
          const easeT = isKnight ? t : easeOutCubic(t);

          mesh.position.x = fromPos.x + (toPos.x - fromPos.x) * easeT;
          mesh.position.z = fromPos.z + (toPos.z - fromPos.z) * easeT;

          if (this.viewMode === '2d') {
            mesh.position.y = 0.02;
          } else if (isKnight) {
            // Parabolic jump arc: 4 * h * t * (1 - t)
            mesh.position.y = 4 * arcHeight * t * (1 - t);
            mesh.rotation.x = Math.sin((t - 0.5) * Math.PI) * 0.15;
          } else {
            // Subtle glide lift to prevent clipping
            mesh.position.y = Math.sin(t * Math.PI) * 0.12;
          }

          if (t >= 1.0) {
            mesh.position.x = toPos.x;
            mesh.position.z = toPos.z;
            mesh.position.y = this.viewMode === '2d' ? 0.02 : 0;
            if (isKnight && this.viewMode !== '2d') mesh.rotation.x = 0;
            if (onComplete) onComplete();
            return true; // Finished
          }
          return false;
        }
      };

      this.activeAnimations.push(animation);
    }

    /**
     * Smoothly shrinks and lifts a captured piece before disposing
     */
    animateCaptureDissolve(mesh) {
      const startTime = performance.now();
      const startScale = mesh.scale.clone();
      const duration = 240;

      const anim = {
        update: (now) => {
          const t = Math.min((now - startTime) / duration, 1.0);
          const scaleFactor = 1.0 - easeOutQuad(t);
          mesh.scale.set(startScale.x * scaleFactor, startScale.y * scaleFactor, startScale.z * scaleFactor);
          mesh.position.y += 0.015;

          if (t >= 1.0) {
            this.piecesGroup.remove(mesh);
            this.disposeObject(mesh);
            return true;
          }
          return false;
        }
      };
      this.activeAnimations.push(anim);
    }

    /**
     * Replaces a pawn with the promoted piece
     */
    replaceWithPromotedPiece(square, newType, color) {
      const existing = this.pieceMap.get(square);
      if (existing) {
        this.piecesGroup.remove(existing.mesh);
        this.disposeObject(existing.mesh);
      }

      const promotedMesh = this.createPieceMesh(newType, color);
      const pos = squareToWorld(square);
      const yPos = this.viewMode === '2d' ? 0.02 : 0;
      promotedMesh.position.set(pos.x, yPos, pos.z);
      if (this.viewMode === '2d') {
        promotedMesh.rotation.y = this.isFlipped ? Math.PI : 0;
      }
      promotedMesh.scale.set(0.1, 0.1, 0.1);

      this.piecesGroup.add(promotedMesh);
      this.pieceMap.set(square, {
        mesh: promotedMesh,
        type: newType,
        color: color
      });

      // Quick scale pop animation
      const startTime = performance.now();
      const popAnim = {
        update: (now) => {
          const t = Math.min((now - startTime) / 180, 1.0);
          const s = easeOutCubic(t);
          promotedMesh.scale.set(s, s, s);
          return t >= 1.0;
        }
      };
      this.activeAnimations.push(popAnim);
      this.requestRender(true);
    }

    /**
     * Switches the board and piece visual theme: 'classic', 'marble', 'neon', 'wood'
     */
    setTheme(themeName) {
      if (!['classic', 'marble', 'neon', 'wood'].includes(themeName)) {
        console.warn(`ChessScene3D: Theme "${themeName}" not recognized. Using classic.`);
        themeName = 'classic';
      }
      this.theme = themeName;

      // Update textures
      const textures = generateThemeTextures(themeName);
      this.lightSquareMat.map = textures.lightTex;
      this.lightSquareMat.needsUpdate = true;
      this.darkSquareMat.map = textures.darkTex;
      this.darkSquareMat.needsUpdate = true;

      this.frameMat.map = textures.frameTex;
      this.frameMat.needsUpdate = true;

      this.tableMat.map = textures.tableTex;
      this.tableMat.color.set(textures.tableColor);
      this.tableMat.needsUpdate = true;

      // Update environment materials & theme-specific architectural decor
      this.updateEnvironmentMaterials(textures, themeName);
      this.buildThemeDecor(themeName);

      // Update coordinate label colors
      this.buildCoordinateLabels();

      // Update lighting palette
      if (themeName === 'neon') {
        this.ambientLight.intensity = 0.35;
        this.mainDirLight.color.set(0x00f0ff);
        this.mainDirLight.intensity = 0.9;
        this.rimDirLight.color.set(0xff00bb);
        this.rimDirLight.intensity = 0.8;
        this.neonCyanLight.intensity = 1.2;
        this.neonPinkLight.intensity = 1.2;
        this.scene.background.set(0x04060a);
        this.inlayMat.color.set(0x00e5ff);
      } else if (themeName === 'wood') {
        this.ambientLight.intensity = 0.65;
        this.mainDirLight.color.set(0xffe8cc);
        this.mainDirLight.intensity = 1.2;
        this.rimDirLight.color.set(0xffd2a6);
        this.rimDirLight.intensity = 0.4;
        this.neonCyanLight.intensity = 0;
        this.neonPinkLight.intensity = 0;
        this.scene.background.set(0x120d09);
        this.inlayMat.color.set(0x3a1e0b);
      } else if (themeName === 'marble') {
        this.ambientLight.intensity = 0.7;
        this.mainDirLight.color.set(0xf5f8ff);
        this.mainDirLight.intensity = 1.15;
        this.rimDirLight.color.set(0xd0e0ff);
        this.rimDirLight.intensity = 0.5;
        this.neonCyanLight.intensity = 0;
        this.neonPinkLight.intensity = 0;
        this.scene.background.set(0x0a0c10);
        this.inlayMat.color.set(0x94a3b8);
      } else {
        // Classic: Clean, glare-free matte B&W with high-contrast cylindrical self-shading
        this.ambientLight.intensity = 0.42;
        this.mainDirLight.color.set(0xffffff);
        this.mainDirLight.intensity = 0.90;
        this.rimDirLight.color.set(0xddeeff);
        this.rimDirLight.intensity = 0.55;
        this.hemiLight.color.set(0xffffff);
        this.hemiLight.groundColor.set(0x1a1d24);
        this.hemiLight.intensity = 0.40;
        this.neonCyanLight.intensity = 0;
        this.neonPinkLight.intensity = 0;
        this.scene.background.set(0x101216);
        this.inlayMat.color.set(0x475569);
        this.lightSquareMat.roughness = 0.85;
        this.lightSquareMat.metalness = 0.02;
        this.darkSquareMat.roughness = 0.85;
        this.darkSquareMat.metalness = 0.02;
      }

      // Notify window.ChessPieces3D if supported
      if (window.ChessPieces3D && typeof window.ChessPieces3D.setTheme === 'function') {
        window.ChessPieces3D.setTheme(themeName);
      }

      // Re-render pieces with the new theme
      for (const [sq, entry] of this.pieceMap.entries()) {
        if (window.ChessPieces3D && typeof window.ChessPieces3D.updatePieceTheme === 'function') {
          window.ChessPieces3D.updatePieceTheme(entry.mesh, themeName);
        } else {
          const oldMesh = entry.mesh;
          const newMesh = this.createPieceMesh(entry.type, entry.color);
          newMesh.position.copy(oldMesh.position);
          newMesh.rotation.copy(oldMesh.rotation);
          newMesh.scale.copy(oldMesh.scale);
          newMesh.userData = { square: sq, type: entry.type, color: entry.color };

          this.piecesGroup.remove(oldMesh);
          this.disposeObject(oldMesh);
          this.piecesGroup.add(newMesh);
          entry.mesh = newMesh;
        }
      }
      this.requestRender(true);
    }

    /**
     * Sets view mode: '3d' (default) or '2d' (procedural top-down 2D tokens)
     */
    setViewMode(mode) {
      if (mode !== '2d' && mode !== '3d') mode = '3d';
      if (this.viewMode === mode) return;
      this.viewMode = mode;

      // Notify window.ChessPieces3D if supported
      if (window.ChessPieces3D && typeof window.ChessPieces3D.setMode === 'function') {
        window.ChessPieces3D.setMode(mode);
      }

      // Rebuild all active pieces for the new mode
      this.rebuildAllPieces();

      // Configure camera & controls for the mode
      if (mode === '2d') {
        this.cameraTarget.set(0, 0, 0);
        this.targetSpherical.phi = 0.001;
        this.targetSpherical.theta = this.isFlipped ? Math.PI : 0.0;
        this.targetSpherical.radius = 11.0;
        this.updatePieceOrientations2D();
      } else {
        this.cameraTarget.set(0, 0, 0);
        this.targetSpherical.phi = Math.PI / 3.4;
        this.targetSpherical.theta = this.isFlipped ? Math.PI : 0.0;
        this.targetSpherical.radius = 12.0;
      }
      this.requestRender(true);
    }

    getViewMode() {
      return this.viewMode;
    }

    toggleViewMode() {
      this.setViewMode(this.viewMode === '2d' ? '3d' : '2d');
      return this.viewMode;
    }

    rebuildAllPieces() {
      for (const [sq, entry] of this.pieceMap.entries()) {
        const oldMesh = entry.mesh;
        const newMesh = this.createPieceMesh(entry.type, entry.color);
        const pos = squareToWorld(sq);
        const yPos = this.viewMode === '2d' ? 0.02 : 0;
        newMesh.position.set(pos.x, yPos, pos.z);

        if (this.viewMode === '2d') {
          newMesh.rotation.y = this.isFlipped ? Math.PI : 0;
        } else {
          if (entry.type === 'n' && entry.color === 'b') {
            newMesh.rotation.y = Math.PI;
          } else {
            newMesh.rotation.y = 0;
          }
        }
        newMesh.userData = { square: sq, type: entry.type, color: entry.color, mode: this.viewMode };

        this.piecesGroup.remove(oldMesh);
        this.disposeObject(oldMesh);
        this.piecesGroup.add(newMesh);
        entry.mesh = newMesh;
      }
      this.requestRender(true);
    }

    updatePieceOrientations2D() {
      if (this.viewMode !== '2d') return;
      const targetRotY = this.isFlipped ? Math.PI : 0;
      for (const entry of this.pieceMap.values()) {
        entry.mesh.rotation.y = targetRotY;
      }
    }

    /**
     * Preset Camera Transitions: 'white', 'black', 'top', 'auto'
     */
    setCameraView(viewName) {
      if (viewName === 'auto') {
        viewName = this.turn === 'b' ? 'black' : 'white';
      }

      if (viewName === 'white') {
        this.targetSpherical.theta = 0.0;
        this.targetSpherical.phi = this.viewMode === '2d' ? 0.001 : Math.PI / 3.4;
        this.targetSpherical.radius = this.viewMode === '2d' ? 11.0 : 11.8;
        this.isFlipped = false;
      } else if (viewName === 'black') {
        this.targetSpherical.theta = Math.PI;
        this.targetSpherical.phi = this.viewMode === '2d' ? 0.001 : Math.PI / 3.4;
        this.targetSpherical.radius = this.viewMode === '2d' ? 11.0 : 11.8;
        this.isFlipped = true;
      } else if (viewName === 'top') {
        this.targetSpherical.phi = 0.001;
        this.targetSpherical.radius = 11.0;
      }

      if (this.viewMode === '2d') {
        this.updatePieceOrientations2D();
      }
      this.requestRender(false);
    }

    /**
     * Flips board camera smoothly between White and Black views
     */
    flipBoard() {
      if (this.isFlipped) {
        this.setCameraView('white');
      } else {
        this.setCameraView('black');
      }
      if (this.viewMode === '2d') {
        this.updatePieceOrientations2D();
      }
      this.requestRender(false);
    }

    /**
     * Updates current turn ('w' or 'b') for auto-flip calculations
     */
    setTurn(turn) {
      this.turn = turn === 'b' ? 'b' : 'w';
    }

    /**
     * Retrieves piece metadata and mesh at a given algebraic square
     */
    getPieceAtSquare(square) {
      const entry = this.pieceMap.get(square);
      return entry ? { type: entry.type, color: entry.color, mesh: entry.mesh } : null;
    }

    /**
     * Converts spherical angles to 3D Cartesian coordinates and points camera at target
     */
    updateCameraPosition(instant = false) {
      if (instant) {
        this.cameraSpherical.theta = this.targetSpherical.theta;
        this.cameraSpherical.phi = this.targetSpherical.phi;
        this.cameraSpherical.radius = this.targetSpherical.radius;
      } else {
        // Smooth spherical interpolation with shortest angle wrapping
        let dTheta = this.targetSpherical.theta - this.cameraSpherical.theta;
        while (dTheta > Math.PI) dTheta -= Math.PI * 2;
        while (dTheta < -Math.PI) dTheta += Math.PI * 2;
        this.cameraSpherical.theta += dTheta * this.dampingFactor;

        this.cameraSpherical.phi += (this.targetSpherical.phi - this.cameraSpherical.phi) * this.dampingFactor;
        this.cameraSpherical.radius += (this.targetSpherical.radius - this.cameraSpherical.radius) * this.dampingFactor;
      }

      const { radius, theta, phi } = this.cameraSpherical;
      const aspect = (this.camera && this.camera.aspect) ? this.camera.aspect : 1.0;
      const portraitScale = aspect < 1.0 ? Math.min(2.6, 1.06 / aspect) : 1.0;
      const effectiveRadius = radius * portraitScale;

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      this.camera.position.x = this.cameraTarget.x + effectiveRadius * sinPhi * sinTheta;
      this.camera.position.y = this.cameraTarget.y + effectiveRadius * cosPhi;
      this.camera.position.z = this.cameraTarget.z + effectiveRadius * sinPhi * cosTheta;
      this.camera.lookAt(this.cameraTarget);
    }

    /**
     * Initializes pointer, touch, and wheel event handlers
     */
    initEvents() {
      const dom = this.renderer.domElement;

      this.onPointerDown = this.handlePointerDown.bind(this);
      this.onPointerMove = this.handlePointerMove.bind(this);
      this.onPointerUp = this.handlePointerUp.bind(this);
      this.onWheel = this.handleWheel.bind(this);
      this.onContextMenu = (e) => e.preventDefault();
      this.onWindowResize = this.onResize.bind(this);
      this.onScroll = () => this.updateCanvasRect();

      dom.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      window.addEventListener('pointerup', this.onPointerUp, { passive: true });
      dom.addEventListener('wheel', this.onWheel, { passive: false });
      dom.addEventListener('contextmenu', this.onContextMenu);
      window.addEventListener('resize', this.onWindowResize);
      window.addEventListener('scroll', this.onScroll, { passive: true });

      this.updateCanvasRect();

      // Support container resize observer
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.containerEl);
      }
    }

    updatePointerCoords(event) {
      const targetEvent = (typeof event.getCoalescedEvents === 'function')
        ? (event.getCoalescedEvents().slice(-1)[0] || event)
        : event;
      const rect = this.canvasRect || this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((targetEvent.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((targetEvent.clientY - rect.top) / rect.height) * 2 + 1;
    }

    handlePointerDown(event) {
      this.isPointerDown = true;
      this.pointerButton = event.button;
      this.pointerDownPos = { x: event.clientX, y: event.clientY };
      this.updatePointerCoords(event);

      // Left click clears any drawn arrows
      if (event.button === 0 && this.drawnArrows && this.drawnArrows.size > 0) {
        this.clearArrows();
      }

      // If right click: Chess.com style tactical arrow drawing (Desktop Mouse ONLY)
      if (event.button === 2) {
        const isMouse = (event.pointerType === 'mouse' || event.pointerType !== 'touch');
        if (isMouse) {
          this.raycaster.setFromCamera(this.pointer, this.camera);
          let fromSquare = null;

          // Check piece meshes first
          const pieceIntersects = this.raycaster.intersectObjects(this.piecesGroup.children, true);
          if (pieceIntersects.length > 0) {
            let hitMesh = pieceIntersects[0].object;
            while (hitMesh.parent && hitMesh.parent !== this.piecesGroup) {
              hitMesh = hitMesh.parent;
            }
            for (const [sq, entry] of this.pieceMap.entries()) {
              if (entry.mesh === hitMesh) {
                fromSquare = sq;
                break;
              }
            }
          }

          // If no piece clicked, check board plane
          if (!fromSquare) {
            const hitPoint = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.boardPlane, hitPoint)) {
              if (hitPoint.x >= -4.0 && hitPoint.x <= 4.0 && hitPoint.z >= -4.0 && hitPoint.z <= 4.0) {
                fromSquare = worldToSquare(hitPoint.x, hitPoint.z);
              }
            }
          }

          if (fromSquare) {
            this.arrowStartSquare = fromSquare;
            this.isRightDraggingArrow = true;
          }
        }

        // Never lift or drag pieces on right-click
        this.dragCandidate = null;
        this.draggedPiece = null;
        return;
      }

      // Ignore shift/ctrl key combinations
      if (event.shiftKey || event.ctrlKey) {
        return;
      }

      // Raycast piece meshes first
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const pieceIntersects = this.raycaster.intersectObjects(this.piecesGroup.children, true);

      if (pieceIntersects.length > 0) {
        // Find top-level piece group
        let hitMesh = pieceIntersects[0].object;
        while (hitMesh.parent && hitMesh.parent !== this.piecesGroup) {
          hitMesh = hitMesh.parent;
        }

        // Find which square this piece belongs to
        let hitSquare = null;
        for (const [sq, entry] of this.pieceMap.entries()) {
          if (entry.mesh === hitMesh) {
            hitSquare = sq;
            break;
          }
        }

        if (hitSquare) {
          this.dragCandidate = {
            mesh: hitMesh,
            square: hitSquare,
            originalPos: hitMesh.position.clone()
          };
          return;
        }
      }

      // Check board plane raycast (O(1) mathematical ray-plane intersection against this.boardPlane)
      const hitPoint = this.dragIntersectPoint || (this.dragIntersectPoint = new THREE.Vector3());
      if (this.raycaster.ray.intersectPlane(this.boardPlane, hitPoint)) {
        if (Math.abs(hitPoint.x) <= 4.0 && Math.abs(hitPoint.z) <= 4.0) {
          const sq = worldToSquare(hitPoint.x, hitPoint.z);
          if (sq) {
            this.boardClickCandidate = { square: sq };
          }
        }
      }
    }

    handlePointerMove(event) {
      const deltaX = event.clientX - this.pointerDownPos.x;
      const deltaY = event.clientY - this.pointerDownPos.y;
      const distance = Math.hypot(deltaX, deltaY);

      this.updatePointerCoords(event);

      // 0. Tactical Arrow Right-Drag Preview (Desktop Mouse ONLY)
      if (this.isRightDraggingArrow && this.arrowStartSquare) {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hitPoint = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.boardPlane, hitPoint)) {
          if (hitPoint.x >= -4.0 && hitPoint.x <= 4.0 && hitPoint.z >= -4.0 && hitPoint.z <= 4.0) {
            const hovered = worldToSquare(hitPoint.x, hitPoint.z);
            if (hovered && hovered !== this.arrowStartSquare) {
              if (hovered !== this.lastPreviewToSquare) {
                if (this.previewArrowMesh) {
                  this.arrowsGroup.remove(this.previewArrowMesh);
                  if (this.previewArrowMesh.geometry) this.previewArrowMesh.geometry.dispose();
                  if (this.previewArrowMesh.material) this.previewArrowMesh.material.dispose();
                  this.previewArrowMesh = null;
                }
                const previewMesh = this.createArrowMesh(this.arrowStartSquare, hovered, true);
                if (previewMesh) {
                  this.arrowsGroup.add(previewMesh);
                  this.previewArrowMesh = previewMesh;
                  this.lastPreviewToSquare = hovered;
                  this.requestRender(false);
                }
              }
            } else if (hovered === this.arrowStartSquare && this.previewArrowMesh) {
              this.arrowsGroup.remove(this.previewArrowMesh);
              if (this.previewArrowMesh.geometry) this.previewArrowMesh.geometry.dispose();
              if (this.previewArrowMesh.material) this.previewArrowMesh.material.dispose();
              this.previewArrowMesh = null;
              this.lastPreviewToSquare = null;
              this.requestRender(false);
            }
          }
        }
        return;
      }

      // 1. Piece Dragging Mode
      if (this.dragCandidate && distance > 5 && !this.draggedPiece) {
        // Activate piece drag
        this.draggedPiece = this.dragCandidate;
        this.dragCandidate = null;
        const liftY = this.viewMode === '2d' ? 0.06 : 0.55;
        this.draggedPiece.mesh.position.y = liftY; // Lift piece
        this.interactionPlane.constant = -liftY;
        this.requestRender(true);
      }

      if (this.draggedPiece) {
        // Defer raycasting to requestAnimationFrame tick
        this.needsRaycast = true;
        this.requestRender(true);
        return;
      }

      // 2. Camera Controls (Orbit - Left mouse drag only, no right-click / shift panning)
      if (this.isPointerDown && this.pointerButton === 0 && !this.draggedPiece && !this.dragCandidate) {
        const lastX = this.pointerLastX ?? event.clientX;
        const lastY = this.pointerLastY ?? event.clientY;
        const moveX = event.clientX - lastX;
        const moveY = event.clientY - lastY;

        if (this.viewMode === '2d') {
          // Lock polar angle in 2D mode
          this.targetSpherical.phi = 0.001;
          this.cameraSpherical.phi = 0.001;
        } else {
          // Orbit camera angles
          const orbitSpeed = 0.007;
          this.targetSpherical.theta -= moveX * orbitSpeed;
          this.targetSpherical.phi -= moveY * orbitSpeed;

          // Clamp polar angle
          this.targetSpherical.phi = Math.max(
            this.minPhi,
            Math.min(this.maxPhi, this.targetSpherical.phi)
          );
          this.requestRender(false);
        }

        this.pointerLastX = event.clientX;
        this.pointerLastY = event.clientY;
      } else {
        this.pointerLastX = event.clientX;
        this.pointerLastY = event.clientY;
      }
    }

    handlePointerUp(event) {
      const deltaX = event.clientX - this.pointerDownPos.x;
      const deltaY = event.clientY - this.pointerDownPos.y;
      const distance = Math.hypot(deltaX, deltaY);

      // 0. Finished Right-Click Tactical Arrow (Desktop Mouse ONLY)
      if (this.isRightDraggingArrow || event.button === 2) {
        // Clear live preview arrow
        if (this.previewArrowMesh) {
          this.arrowsGroup.remove(this.previewArrowMesh);
          if (this.previewArrowMesh.geometry) this.previewArrowMesh.geometry.dispose();
          if (this.previewArrowMesh.material) this.previewArrowMesh.material.dispose();
          this.previewArrowMesh = null;
          this.lastPreviewToSquare = null;
        }

        // Determine destination square under pointer
        this.updatePointerCoords(event);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hitPoint = new THREE.Vector3();
        let toSquare = null;
        if (this.raycaster.ray.intersectPlane(this.boardPlane, hitPoint)) {
          if (hitPoint.x >= -4.0 && hitPoint.x <= 4.0 && hitPoint.z >= -4.0 && hitPoint.z <= 4.0) {
            toSquare = worldToSquare(hitPoint.x, hitPoint.z);
          }
        }

        if (this.arrowStartSquare && toSquare && toSquare !== this.arrowStartSquare) {
          this.toggleArrow(this.arrowStartSquare, toSquare);
        } else if (this.arrowStartSquare && toSquare === this.arrowStartSquare) {
          // Right-clicked in place: clears all drawn arrows
          this.clearArrows();
        }

        this.isRightDraggingArrow = false;
        this.arrowStartSquare = null;
        this.isPointerDown = false;
        this.requestRender(false);
        return;
      }

      // 1. Finished Piece Drag
      if (this.draggedPiece) {
        const fromSquare = this.draggedPiece.square;
        const targetSquare = worldToSquare(
          this.draggedPiece.mesh.position.x,
          this.draggedPiece.mesh.position.z
        );
        const draggedPieceMesh = this.draggedPiece.mesh;
        const originalPos = this.draggedPiece.originalPos;

        if (targetSquare && targetSquare !== fromSquare) {
          // Snap piece cleanly to target square world coordinates
          const toPos = squareToWorld(targetSquare);
          const yPos = this.viewMode === '2d' ? 0.02 : 0;
          draggedPieceMesh.position.set(toPos.x, yPos, toPos.z);

          // Record drop info so syncBoard knows this piece was already placed by drag-and-drop
          this.justDropped = {
            from: fromSquare,
            to: targetSquare,
            dropPos: toPos.clone()
          };

          this.draggedPiece = null;
          this.dragCandidate = null;
          this.needsRaycast = false;
          this.isPointerDown = false;
          this.requestRender(true);

          // Trigger drop callback
          this.callbacks.onPieceDrop(fromSquare, targetSquare);
          return;
        }

        // Canceled drag or dropped back on same square: restore original position
        draggedPieceMesh.position.copy(originalPos);
        draggedPieceMesh.position.y = this.viewMode === '2d' ? 0.02 : 0;
        this.justDropped = null;

        if (targetSquare === fromSquare) {
          this.callbacks.onSquareClick(fromSquare);
        }

        this.draggedPiece = null;
        this.dragCandidate = null;
        this.needsRaycast = false;
        this.isPointerDown = false;
        this.requestRender(true);
        return;
      }

      // 2. Click on Piece
      if (this.dragCandidate && distance < 6) {
        const sq = this.dragCandidate.square;
        this.callbacks.onSquareClick(sq);
        this.dragCandidate = null;
        this.isPointerDown = false;
        return;
      }

      // 3. Click on Board Square
      if (this.boardClickCandidate && distance < 6) {
        const sq = this.boardClickCandidate.square;
        this.callbacks.onSquareClick(sq);
        this.boardClickCandidate = null;
        this.isPointerDown = false;
        return;
      }

      this.dragCandidate = null;
      this.boardClickCandidate = null;
      this.isPointerDown = false;
    }

    handleWheel(event) {
      event.preventDefault();
      const zoomSpeed = 0.005;
      this.targetSpherical.radius += event.deltaY * zoomSpeed;
      this.targetSpherical.radius = Math.max(
        this.minRadius,
        Math.min(this.maxRadius, this.targetSpherical.radius)
      );
      this.requestRender(false);
    }

    /**
     * Resizes camera aspect ratio and renderer viewport
     */
    onResize() {
      if (!this.containerEl || !this.renderer) return;
      const width = this.containerEl.clientWidth || 800;
      const height = this.containerEl.clientHeight || 600;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.updateCanvasRect();
      this.updateCameraPosition(true);
      this.requestRender(false);
    }

    /**
     * Performs deferred raycasting against interactionPlane during piece drag (O(1) plane intersection)
     */
    performDeferredRaycast() {
      if (!this.draggedPiece) return;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const intersectPoint = this.dragIntersectPoint || (this.dragIntersectPoint = new THREE.Vector3());
      if (this.raycaster.ray.intersectPlane(this.interactionPlane, intersectPoint)) {
        this.draggedPiece.mesh.position.x = intersectPoint.x;
        this.draggedPiece.mesh.position.z = intersectPoint.z;

        // Track hovered square
        const hovered = worldToSquare(intersectPoint.x, intersectPoint.z);
        if (hovered !== this.hoveredSquare) {
          this.hoveredSquare = hovered;
        }
      }
      this.needsRaycast = false;
    }

    /**
     * Animation render loop with on-demand rendering and deferred raycasting
     */
    startAnimationLoop() {
      let isRunning = true;
      this.stopAnimationLoop = () => { isRunning = false; };

      const animate = (time) => {
        if (!isRunning) return;
        requestAnimationFrame(animate);

        // 1. Deferred Raycast on requestAnimationFrame tick when dragging piece
        if (this.needsRaycast && this.draggedPiece) {
          this.performDeferredRaycast();
        }

        // 2. Update active piece animations
        if (this.activeAnimations.length > 0) {
          for (let i = this.activeAnimations.length - 1; i >= 0; i--) {
            const finished = this.activeAnimations[i].update(time);
            if (finished) {
              this.activeAnimations.splice(i, 1);
            }
          }
          this.renderer.shadowMap.needsUpdate = true;
          this.needsRender = true;
        }

        // Dragging updates shadows and triggers render
        if (this.draggedPiece) {
          this.renderer.shadowMap.needsUpdate = true;
          this.needsRender = true;
        }

        // 3. Pulsing check ring animation
        if (this.checkPulseMesh) {
          const pulse = 0.55 + 0.35 * Math.sin(time * 0.008);
          this.checkPulseMesh.material.opacity = pulse;
          this.needsRender = true;
        }

        // 4. Camera damping & motion detection
        let dTheta = this.targetSpherical.theta - this.cameraSpherical.theta;
        while (dTheta > Math.PI) dTheta -= Math.PI * 2;
        while (dTheta < -Math.PI) dTheta += Math.PI * 2;
        const dPhi = this.targetSpherical.phi - this.cameraSpherical.phi;
        const dRadius = this.targetSpherical.radius - this.cameraSpherical.radius;
        const cameraMoving = Math.abs(dTheta) > 0.0001 || Math.abs(dPhi) > 0.0001 || Math.abs(dRadius) > 0.0005;

        if (cameraMoving) {
          this.updateCameraPosition();
          this.needsRender = true;
        }

        // 5. On-Demand Render
        if (this.needsRender) {
          this.renderer.render(this.scene, this.camera);
          this.needsRender = false;
        }
      };

      requestAnimationFrame(animate);
    }

    /**
     * Helper to recursively dispose geometries and materials, protecting shared cached resources
     */
    disposeObject(obj) {
      if (!obj) return;
      obj.traverse((child) => {
        if (child.geometry && !child.geometry.userData?.isSharedGeometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            if (!m.userData?.isSharedMaterial) {
              if (m.map && !m.map.userData?.isSharedTexture) m.map.dispose();
              if (m.roughnessMap && !m.roughnessMap.userData?.isSharedTexture) m.roughnessMap.dispose();
              if (m.bumpMap && !m.bumpMap.userData?.isSharedTexture) m.bumpMap.dispose();
              m.dispose();
            }
          });
        }
        if (child.isInstancedMesh) {
          if (child.instanceMatrix) child.instanceMatrix.dispose?.();
          if (child.instanceColor) child.instanceColor.dispose?.();
        }
      });
    }

    /**
     * Destroys the 3D scene, removes event listeners, and disposes GPU resources
     */
    destroy() {
      if (this.stopAnimationLoop) this.stopAnimationLoop();

      this.clearArrows();

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }

      const dom = this.renderer.domElement;
      dom.removeEventListener('pointerdown', this.onPointerDown);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      dom.removeEventListener('wheel', this.onWheel);
      dom.removeEventListener('contextmenu', this.onContextMenu);
      window.removeEventListener('resize', this.onWindowResize);
      window.removeEventListener('scroll', this.onScroll);

      this.disposeObject(this.scene);
      if (this.pmremEnvTex) {
        this.pmremEnvTex.dispose();
        this.pmremEnvTex = null;
      }
      this.renderer.dispose();
      if (dom.parentElement) {
        dom.parentElement.removeChild(dom);
      }
    }
  }

  return ChessScene3D;
});
