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

  // Procedural Canvas Texture Generator for Board Themes
  const TextureCache = {};

  function generateThemeTextures(theme) {
    if (TextureCache[theme]) return TextureCache[theme];

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    let lightColor, darkColor, frameColor, tableColor;

    if (theme === 'wood') {
      lightColor = '#e2c59b';
      darkColor = '#703d1e';
      frameColor = '#3c1d0e';
      tableColor = '#18120e';
    } else if (theme === 'marble') {
      lightColor = '#f5f6f8';
      darkColor = '#1e2126';
      frameColor = '#111317';
      tableColor = '#0b0d10';
    } else if (theme === 'neon') {
      lightColor = '#0d1829';
      darkColor = '#1b0d2a';
      frameColor = '#07090e';
      tableColor = '#020306';
    } else {
      // Classic: Clean, high-contrast Matte Black & White
      lightColor = '#f2f4f7'; // clean soft pure white
      darkColor = '#262a32';  // deep charcoal/slate black
      frameColor = '#181a20'; // sleek dark anthracite
      tableColor = '#0f1115';
    }

    function createSquareTexture(baseColor, isLight, type) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = baseColor;
      g.fillRect(0, 0, 256, 256);

      if (type === 'wood') {
        // Wood grain rings & subtle stripes
        g.fillStyle = isLight ? 'rgba(160, 110, 60, 0.08)' : 'rgba(40, 20, 10, 0.15)';
        for (let i = 0; i < 20; i++) {
          const y = (i * 13) % 256;
          g.fillRect(0, y, 256, 3 + (i % 4));
        }
        g.strokeStyle = isLight ? 'rgba(120, 80, 40, 0.05)' : 'rgba(0, 0, 0, 0.12)';
        g.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          g.beginPath();
          g.arc(128, -50 + i * 40, 100 + i * 20, 0, Math.PI * 2);
          g.stroke();
        }
      } else if (type === 'marble') {
        // Subtle marble veins
        g.strokeStyle = isLight ? 'rgba(100, 115, 130, 0.12)' : 'rgba(240, 245, 255, 0.14)';
        g.lineWidth = 1.2;
        for (let v = 0; v < 4; v++) {
          g.beginPath();
          let x = (v * 70) % 256;
          let y = 0;
          g.moveTo(x, y);
          while (y < 256) {
            x += (Math.random() - 0.48) * 14;
            y += 8 + Math.random() * 10;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      } else if (type === 'neon') {
        // Cyber grid & glowing edge
        const glowColor = isLight ? '#00e5ff' : '#d500f9';
        g.strokeStyle = glowColor;
        g.lineWidth = 3;
        g.strokeRect(2, 2, 252, 252);
        g.fillStyle = isLight ? 'rgba(0, 229, 255, 0.04)' : 'rgba(213, 0, 249, 0.04)';
        g.fillRect(4, 4, 248, 248);
      } else {
        // Classic: Completely clean, uniform matte surface without noisy gradients
        g.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)';
        g.lineWidth = 1;
        g.strokeRect(0, 0, 256, 256);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    }

    const lightTex = createSquareTexture(lightColor, true, theme);
    const darkTex = createSquareTexture(darkColor, false, theme);

    // Frame Texture
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 512;
    frameCanvas.height = 512;
    const fctx = frameCanvas.getContext('2d');
    fctx.fillStyle = frameColor;
    fctx.fillRect(0, 0, 512, 512);

    if (theme === 'wood') {
      fctx.fillStyle = 'rgba(20, 8, 3, 0.2)';
      for (let i = 0; i < 40; i++) {
        fctx.fillRect(0, i * 13, 512, 4);
      }
    } else if (theme === 'marble') {
      fctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      fctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        fctx.beginPath();
        fctx.moveTo(i * 90, 0);
        fctx.lineTo(i * 90 + 60, 512);
        fctx.stroke();
      }
    } else if (theme === 'neon') {
      fctx.strokeStyle = '#00e5ff';
      fctx.lineWidth = 4;
      fctx.strokeRect(4, 4, 504, 504);
      fctx.strokeStyle = '#d500f9';
      fctx.strokeRect(12, 12, 488, 488);
    } else {
      // Classic: Dark anthracite matte frame
      fctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      fctx.fillRect(0, 0, 512, 512);
    }
    const frameTex = new THREE.CanvasTexture(frameCanvas);

    TextureCache[theme] = {
      lightColor,
      darkColor,
      frameColor,
      tableColor,
      lightTex,
      darkTex,
      frameTex
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
      this.maxRadius = 24.0;
      this.minPhi = 0.08;
      this.maxPhi = Math.PI / 2.05;
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
        this.renderer.toneMappingExposure = 1.05;
      }
      if (THREE.sRGBEncoding) {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }

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
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.42);
      this.lightsGroup.add(this.ambientLight);

      // Hemisphere Light (sky/ground color contrast)
      this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x1a1d24, 0.40);
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

      // Materials for squares - Matte surface (roughness: 0.85, metalness: 0.02) to eliminate specular glare
      this.lightSquareMat = new THREE.MeshStandardMaterial({
        map: textures.lightTex,
        roughness: 0.85,
        metalness: 0.02
      });
      this.darkSquareMat = new THREE.MeshStandardMaterial({
        map: textures.darkTex,
        roughness: 0.85,
        metalness: 0.02
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
      this.frameMat = new THREE.MeshStandardMaterial({
        map: textures.frameTex,
        roughness: 0.5,
        metalness: 0.08
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

      // Ground Table / Pedestal below the board
      const tableGeo = new THREE.CylinderGeometry(14, 14, 0.6, 64);
      this.tableMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(textures.tableColor),
        roughness: 0.6,
        metalness: 0.1
      });
      this.tableMesh = new THREE.Mesh(tableGeo, this.tableMat);
      this.tableMesh.position.y = -0.64;
      this.tableMesh.receiveShadow = true;
      this.boardGroup.add(this.tableMesh);

      // Master pieces container group
      this.piecesGroup = new THREE.Group();
      this.boardGroup.add(this.piecesGroup);

      // Tactical Arrows container group (Chess.com style right-click arrows)
      this.arrowsGroup = new THREE.Group();
      this.arrowsGroup.position.y = 0.011;
      this.boardGroup.add(this.arrowsGroup);
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

      this.tableMat.color.set(textures.tableColor);
      this.tableMat.needsUpdate = true;

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
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      this.camera.position.x = this.cameraTarget.x + radius * sinPhi * sinTheta;
      this.camera.position.y = this.cameraTarget.y + radius * cosPhi;
      this.camera.position.z = this.cameraTarget.z + radius * sinPhi * cosTheta;
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

      // Check board plane raycast (O(1) horizontal plane intersection)
      const hitPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.boardPlane, hitPoint)) {
        if (hitPoint.x >= -4.0 && hitPoint.x <= 4.0 && hitPoint.z >= -4.0 && hitPoint.z <= 4.0) {
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
      this.requestRender(false);
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
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const intersectPoint = new THREE.Vector3();
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
              m.dispose();
            }
          });
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
      this.renderer.dispose();
      if (dom.parentElement) {
        dom.parentElement.removeChild(dom);
      }
    }
  }

  return ChessScene3D;
});
