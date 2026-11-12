/**
 * pieces3d.js - Procedural 3D Chess Pieces for Three.js (r128+)
 * 
 * Procedural Staunton Chess Assets:
 * - 'p' (Pawn): Turned Staunton pedestal, waist, neck collar, spherical head
 * - 'r' (Rook): Fluted tower, parapet rim, 4 castle crenellations (merlons)
 * - 'n' (Knight): Turned base, sculpted horse head with arched neck, mane crest, perked ears, muzzle
 * - 'b' (Bishop): Turned stem, double collar cushion, mitre head with diagonal slot & finial orb
 * - 'q' (Queen): Regal flared coronet with 8 pearl spheres, inner dome & apex orb
 * - 'k' (King): Noble turned column, flared gallery, inner dome & 3D Cross Pattée finial
 * 
 * Rules & Requirements:
 * - 100% procedural Three.js geometries (LatheGeometry, ExtrudeGeometry, SphereGeometry, BoxGeometry, etc.)
 * - Zero external .gltf/.obj dependencies
 * - Scaled to fit 1.0 x 1.0 board square (base diameter ~0.54 - 0.70)
 * - Centered at x=0, z=0 with piece bottom resting at y=0
 * - castShadow and receiveShadow enabled on all child meshes
 * - Themes: 'classic', 'marble', 'neon', 'wood' using MeshPhysicalMaterial/MeshStandardMaterial
 * - Dual environment: Browser (window.ChessPieces3D) & Node.js (module.exports)
 */

(function (root, factory) {
  const pieces = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = pieces;
  }
  if (typeof root !== 'undefined') {
    root.ChessPieces3D = pieces;
  }
  if (typeof window !== 'undefined') {
    window.ChessPieces3D = pieces;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Standard Staunton piece heights (scaled for 1.0 unit board square)
  const PIECE_HEIGHTS = Object.freeze({
    p: 0.95,
    r: 1.20,
    n: 1.35,
    b: 1.55,
    q: 1.80,
    k: 2.02
  });

  const THEMES = Object.freeze(['classic', 'marble', 'neon', 'wood']);
  const MODES = Object.freeze(['3d', '2d']);
  let currentTheme = 'classic';
  let currentMode = '3d';

  // Texture, material, and geometry caches
  const textureCache = new Map();
  const texture2DCache = new Map();
  const materialCache = new Map();
  const outlineMaterialCache = new Map();
  const slotMaterialCache = new Map();
  const geometryCache = new Map();

  /**
   * Helper: Normalize piece type to lowercase ('p', 'r', 'n', 'b', 'q', 'k')
   */
  function normalizeType(type) {
    if (!type) return 'p';
    const t = String(type).trim().toLowerCase();
    return PIECE_HEIGHTS[t] !== undefined ? t : 'p';
  }

  /**
   * Helper: Normalize color to 'w' or 'b'
   */
  function normalizeColor(color) {
    if (!color) return 'w';
    const c = String(color).trim().toLowerCase();
    return c === 'b' || c === 'black' ? 'b' : 'w';
  }

  /**
   * Helper: Normalize theme name
   */
  function normalizeTheme(theme) {
    if (!theme) return currentTheme;
    const t = String(theme).trim().toLowerCase();
    return THEMES.includes(t) ? t : currentTheme;
  }

  /**
   * Safe Three.js reference accessor
   */
  function getTHREE() {
    if (typeof THREE !== 'undefined') return THREE;
    if (typeof window !== 'undefined' && window.THREE) return window.THREE;
    if (typeof globalThis !== 'undefined' && globalThis.THREE) return globalThis.THREE;
    throw new Error('Three.js (THREE) is not loaded. Please ensure Three.js r128+ is included before pieces3d.js.');
  }

  /**
   * Procedural Multi-Channel PBR Texture Generator:
   * Generates paired { map, roughnessMap, bumpMap, bumpScale } for realistic PBR shading
   */
  function getProceduralPBRMaps(theme, color) {
    if (typeof document === 'undefined') {
      return { map: null, roughnessMap: null, bumpMap: null, bumpScale: 0.02 };
    }
    const th = normalizeTheme(theme);
    const c = normalizeColor(color);
    const mapKey = `pbr_${th}_${c}_map`;
    const roughKey = `pbr_${th}_${c}_roughness`;
    const bumpKey = `pbr_${th}_${c}_bump`;

    if (textureCache.has(mapKey) && textureCache.has(roughKey) && textureCache.has(bumpKey)) {
      const bumpScale = (th === 'wood' ? 0.02 : (th === 'marble' ? 0.015 : (th === 'classic' ? 0.01 : 0.008)));
      return {
        map: textureCache.get(mapKey),
        roughnessMap: textureCache.get(roughKey),
        bumpMap: textureCache.get(bumpKey),
        bumpScale: bumpScale
      };
    }

    try {
      const THREE = getTHREE();
      const isWhite = c === 'w';

      // 1. Color Map Canvas
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = 512;
      colorCanvas.height = 512;
      const ctxC = colorCanvas.getContext('2d');

      // 2. Roughness Map Canvas
      const roughCanvas = document.createElement('canvas');
      roughCanvas.width = 512;
      roughCanvas.height = 512;
      const ctxR = roughCanvas.getContext('2d');

      // 3. Bump / Height Map Canvas
      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = 512;
      bumpCanvas.height = 512;
      const ctxB = bumpCanvas.getContext('2d');

      if (!ctxC || !ctxR || !ctxB) {
        return { map: null, roughnessMap: null, bumpMap: null, bumpScale: 0.02 };
      }

      let bumpScale = 0.02;

      if (th === 'wood') {
        bumpScale = 0.02;
        const baseColor = isWhite ? '#dec59b' : '#3d2516';
        const ring1 = isWhite ? '#ceae80' : '#29170c';
        const ring2 = isWhite ? '#eccfac' : '#4e301d';

        // Diffuse
        ctxC.fillStyle = baseColor;
        ctxC.fillRect(0, 0, 512, 512);

        // Roughness: base satin sheen
        ctxR.fillStyle = '#555555';
        ctxR.fillRect(0, 0, 512, 512);

        // Bump: neutral mid-gray base
        ctxB.fillStyle = '#808080';
        ctxB.fillRect(0, 0, 512, 512);

        // Longitudinal wood grain curves
        ctxC.lineWidth = 1.5;
        ctxR.lineWidth = 1.5;
        ctxB.lineWidth = 1.5;

        for (let i = 0; i < 70; i++) {
          const y = (i / 70) * 512;
          ctxC.strokeStyle = (i % 2 === 0 ? ring1 : ring2);
          ctxC.globalAlpha = 0.25 + (Math.sin(i * 0.4) * 0.15);
          ctxC.beginPath();
          ctxC.moveTo(0, y);
          ctxC.bezierCurveTo(170, y + Math.sin(i) * 12, 340, y - Math.cos(i) * 12, 512, y);
          ctxC.stroke();

          // Roughness: open wood pores are rougher (brighter gray)
          ctxR.strokeStyle = (i % 2 === 0 ? '#777777' : '#666666');
          ctxR.globalAlpha = 0.20;
          ctxR.beginPath();
          ctxR.moveTo(0, y);
          ctxR.bezierCurveTo(170, y + Math.sin(i) * 12, 340, y - Math.cos(i) * 12, 512, y);
          ctxR.stroke();

          // Bump: grain groove depth
          ctxB.strokeStyle = (i % 2 === 0 ? '#606060' : '#959595');
          ctxB.globalAlpha = 0.22;
          ctxB.beginPath();
          ctxB.moveTo(0, y);
          ctxB.bezierCurveTo(170, y + Math.sin(i) * 12, 340, y - Math.cos(i) * 12, 512, y);
          ctxB.stroke();
        }

        // Fine wood fibers
        ctxC.globalAlpha = 0.08;
        ctxC.fillStyle = isWhite ? '#ffffff' : '#000000';
        ctxB.globalAlpha = 0.12;
        ctxB.fillStyle = '#505050';
        for (let x = 0; x < 512; x += 3) {
          if (Math.random() > 0.4) {
            ctxC.fillRect(x, 0, 1, 512);
            ctxB.fillRect(x, 0, 1, 512);
          }
        }
      } else if (th === 'marble') {
        bumpScale = 0.015;
        // Diffuse
        ctxC.fillStyle = isWhite ? '#f7f8fa' : '#141518';
        ctxC.fillRect(0, 0, 512, 512);

        // Roughness: polished high-gloss stone
        ctxR.fillStyle = isWhite ? '#505050' : '#404040';
        ctxR.fillRect(0, 0, 512, 512);

        // Bump: neutral base
        ctxB.fillStyle = '#808080';
        ctxB.fillRect(0, 0, 512, 512);

        // Veining
        const veinColor1 = isWhite ? 'rgba(180, 185, 195, 0.35)' : 'rgba(235, 235, 240, 0.22)';
        const veinColor2 = isWhite ? 'rgba(140, 145, 155, 0.25)' : 'rgba(212, 175, 55, 0.25)';

        ctxC.lineWidth = 2.5;
        ctxR.lineWidth = 2.0;
        ctxB.lineWidth = 2.0;

        for (let v = 0; v < 8; v++) {
          ctxC.strokeStyle = (v % 2 === 0) ? veinColor1 : veinColor2;
          ctxR.strokeStyle = 'rgba(160, 160, 160, 0.35)'; // veins have slightly higher micro-roughness
          ctxB.strokeStyle = (v % 2 === 0) ? 'rgba(90, 90, 90, 0.4)' : 'rgba(150, 150, 150, 0.35)';

          ctxC.beginPath();
          ctxR.beginPath();
          ctxB.beginPath();

          let px = Math.random() * 512;
          let py = 0;
          ctxC.moveTo(px, py);
          ctxR.moveTo(px, py);
          ctxB.moveTo(px, py);

          while (py < 512) {
            py += 15 + Math.random() * 25;
            px += (Math.random() - 0.48) * 35;
            ctxC.lineTo(px, py);
            ctxR.lineTo(px, py);
            ctxB.lineTo(px, py);
          }
          ctxC.stroke();
          ctxR.stroke();
          ctxB.stroke();
        }

        // Layered soft radial gradients for organic cloudy marble depth (fast GPU-accelerated vector canvas)
        for (let i = 0; i < 6; i++) {
          const cx = 80 + (i * 70) + (Math.sin(i * 1.7) * 40);
          const cy = 60 + ((i % 3) * 150) + (Math.cos(i * 1.3) * 50);
          const r = 90 + (i * 20);
          const grad = ctxC.createRadialGradient(cx, cy, 10, cx, cy, r);
          if (isWhite) {
            grad.addColorStop(0, 'rgba(230, 233, 240, 0.35)');
            grad.addColorStop(1, 'rgba(247, 248, 250, 0)');
          } else {
            grad.addColorStop(0, 'rgba(35, 38, 48, 0.40)');
            grad.addColorStop(1, 'rgba(20, 21, 24, 0)');
          }
          ctxC.fillStyle = grad;
          ctxC.beginPath();
          ctxC.arc(cx, cy, r, 0, Math.PI * 2);
          ctxC.fill();
        }

        // Secondary organic fine capillary sub-veins (fast vector bezier curves)
        ctxC.lineWidth = 1.0;
        ctxR.lineWidth = 1.0;
        ctxB.lineWidth = 1.0;
        for (let s = 0; s < 5; s++) {
          const startX = 60 + s * 90;
          ctxC.strokeStyle = isWhite ? 'rgba(195, 200, 210, 0.28)' : 'rgba(200, 170, 70, 0.18)';
          ctxR.strokeStyle = 'rgba(120, 120, 120, 0.20)';
          ctxB.strokeStyle = 'rgba(110, 110, 110, 0.25)';
          ctxC.beginPath();
          ctxR.beginPath();
          ctxB.beginPath();
          ctxC.moveTo(startX, 0);
          ctxR.moveTo(startX, 0);
          ctxB.moveTo(startX, 0);
          const cp1x = startX + (Math.sin(s) * 60);
          const cp1y = 180 + (s * 30);
          const cp2x = startX - (Math.cos(s) * 50);
          const cp2y = 360 + (s * 25);
          const endX = startX + (Math.sin(s * 2) * 80);
          ctxC.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, 512);
          ctxR.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, 512);
          ctxB.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, 512);
          ctxC.stroke();
          ctxR.stroke();
          ctxB.stroke();
        }
      } else if (th === 'classic') {
        bumpScale = 0.01;
        // Warm Ivory or Deep Slate base
        ctxC.fillStyle = isWhite ? '#f4f0e6' : '#1e222a';
        ctxC.fillRect(0, 0, 512, 512);

        // Roughness: tournament satin sheen
        ctxR.fillStyle = isWhite ? '#666666' : '#555555';
        ctxR.fillRect(0, 0, 512, 512);

        // Bump: neutral base
        ctxB.fillStyle = '#808080';
        ctxB.fillRect(0, 0, 512, 512);

        // Micro-grain satin texture so pieces never look like flat plastic
        ctxR.fillStyle = '#777777';
        ctxR.globalAlpha = 0.08;
        ctxB.fillStyle = '#686868';
        ctxB.globalAlpha = 0.10;
        for (let i = 0; i < 300; i++) {
          const rx = Math.random() * 512;
          const ry = Math.random() * 512;
          const rw = 2 + Math.random() * 4;
          const rh = 1 + Math.random() * 2;
          ctxR.fillRect(rx, ry, rw, rh);
          ctxB.fillRect(rx, ry, rw, rh);
        }
      } else if (th === 'neon') {
        bumpScale = 0.008;
        // Diffuse
        ctxC.fillStyle = isWhite ? '#00e5ff' : '#ff007f';
        ctxC.fillRect(0, 0, 512, 512);

        // Roughness: brushed anodized metal sheen
        ctxR.fillStyle = '#383838';
        ctxR.fillRect(0, 0, 512, 512);

        // Bump: neutral base
        ctxB.fillStyle = '#808080';
        ctxB.fillRect(0, 0, 512, 512);

        // Brushed metallic streaks
        ctxR.strokeStyle = '#505050';
        ctxR.globalAlpha = 0.15;
        ctxB.strokeStyle = '#686868';
        ctxB.globalAlpha = 0.18;
        for (let y = 0; y < 512; y += 4) {
          if (Math.random() > 0.4) {
            ctxR.beginPath();
            ctxR.moveTo(0, y);
            ctxR.lineTo(512, y);
            ctxR.stroke();

            ctxB.beginPath();
            ctxB.moveTo(0, y);
            ctxB.lineTo(512, y);
            ctxB.stroke();
          }
        }
      }

      // Convert to THREE.CanvasTexture and cache
      const mapTexture = new THREE.CanvasTexture(colorCanvas);
      mapTexture.wrapS = THREE.RepeatWrapping;
      mapTexture.wrapT = THREE.RepeatWrapping;
      mapTexture.repeat.set(1.5, 2.5);
      mapTexture.userData = { isSharedTexture: true };
      textureCache.set(mapKey, mapTexture);

      const roughTexture = new THREE.CanvasTexture(roughCanvas);
      roughTexture.wrapS = THREE.RepeatWrapping;
      roughTexture.wrapT = THREE.RepeatWrapping;
      roughTexture.repeat.set(1.5, 2.5);
      roughTexture.userData = { isSharedTexture: true };
      textureCache.set(roughKey, roughTexture);

      const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
      bumpTexture.wrapS = THREE.RepeatWrapping;
      bumpTexture.wrapT = THREE.RepeatWrapping;
      bumpTexture.repeat.set(1.5, 2.5);
      bumpTexture.userData = { isSharedTexture: true };
      textureCache.set(bumpKey, bumpTexture);

      return {
        map: mapTexture,
        roughnessMap: roughTexture,
        bumpMap: bumpTexture,
        bumpScale: bumpScale
      };
    } catch (e) {
      return { map: null, roughnessMap: null, bumpMap: null, bumpScale: 0.02 };
    }
  }

  /**
   * Backward-compatible accessor for primary diffuse texture
   */
  function getProceduralTexture(theme, color) {
    const pbr = getProceduralPBRMaps(theme, color);
    return pbr ? pbr.map : null;
  }

  /**
   * Material Factory: Builds high-end MeshPhysicalMaterial for White & Black
   * Featuring clearcoat lacquer, envMap reflections, and multi-channel procedural PBR maps
   */
  function getMaterial(color, theme) {
    const THREE = getTHREE();
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);
    const cacheKey = `${th}_${c}`;

    if (materialCache.has(cacheKey)) {
      return materialCache.get(cacheKey);
    }

    const isWhite = c === 'w';
    let material;
    const MaterialClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const pbr = getProceduralPBRMaps(th, c);

    switch (th) {
      case 'wood': {
        material = new MaterialClass({
          color: isWhite ? 0xe2c69e : 0x3b2212,
          map: pbr.map || null,
          roughnessMap: pbr.roughnessMap || null,
          bumpMap: pbr.bumpMap || null,
          bumpScale: pbr.bumpScale || 0.02,
          roughness: 0.36,
          metalness: 0.02,
          clearcoat: 0.65,
          clearcoatRoughness: 0.15,
          envMapIntensity: 1.20,
          side: THREE.FrontSide
        });
        break;
      }

      case 'marble': {
        material = new MaterialClass({
          color: isWhite ? 0xf4f0e6 : 0x1e222a,
          map: pbr.map || null,
          roughnessMap: pbr.roughnessMap || null,
          bumpMap: pbr.bumpMap || null,
          bumpScale: pbr.bumpScale || 0.015,
          roughness: isWhite ? 0.35 : 0.28,
          metalness: isWhite ? 0.04 : 0.10,
          clearcoat: 0.70,
          clearcoatRoughness: 0.12,
          envMapIntensity: 1.25,
          side: THREE.FrontSide
        });
        break;
      }

      case 'neon': {
        // Futuristic Cyberpunk / Tron theme: high emissive glow, high metalness, clearcoat lacquer
        if (isWhite) {
          material = new MaterialClass({
            color: 0x00ffff,
            emissive: 0x009ec3,
            emissiveIntensity: 0.55,
            roughnessMap: pbr.roughnessMap || null,
            bumpMap: pbr.bumpMap || null,
            bumpScale: pbr.bumpScale || 0.008,
            roughness: 0.22,
            metalness: 0.75,
            clearcoat: 0.60,
            clearcoatRoughness: 0.12,
            envMapIntensity: 1.30,
            side: THREE.FrontSide
          });
        } else {
          material = new MaterialClass({
            color: 0xff007f,
            emissive: 0xa8004f,
            emissiveIntensity: 0.55,
            roughnessMap: pbr.roughnessMap || null,
            bumpMap: pbr.bumpMap || null,
            bumpScale: pbr.bumpScale || 0.008,
            roughness: 0.22,
            metalness: 0.75,
            clearcoat: 0.60,
            clearcoatRoughness: 0.12,
            envMapIntensity: 1.30,
            side: THREE.FrontSide
          });
        }
        break;
      }

      case 'classic':
      default: {
        // High-contrast Tournament Staunton: Rich Warm Ivory vs Deep Obsidian Slate with clearcoat
        if (isWhite) {
          material = new MaterialClass({
            color: 0xf4f0e6,
            roughnessMap: pbr.roughnessMap || null,
            bumpMap: pbr.bumpMap || null,
            bumpScale: pbr.bumpScale || 0.01,
            roughness: 0.42,
            metalness: 0.04,
            clearcoat: 0.55,
            clearcoatRoughness: 0.15,
            envMapIntensity: 1.15,
            side: THREE.FrontSide
          });
        } else {
          material = new MaterialClass({
            color: 0x1e222a,
            roughnessMap: pbr.roughnessMap || null,
            bumpMap: pbr.bumpMap || null,
            bumpScale: pbr.bumpScale || 0.01,
            roughness: 0.32,
            metalness: 0.10,
            clearcoat: 0.55,
            clearcoatRoughness: 0.15,
            envMapIntensity: 1.15,
            side: THREE.FrontSide
          });
        }
        break;
      }
    }

    material.userData = { isSharedMaterial: true };
    materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Helper: Apply shadow properties to all child meshes
   */
  function enableShadows(meshOrGroup) {
    meshOrGroup.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return meshOrGroup;
  }

  /**
   * Helper: Procedural Turned Staunton Pedestal Base Points
   * Generates a stepped, filleted base profile for LatheGeometry
   */
  function createStauntonBasePoints(baseRadius, baseHeight) {
    const THREE = getTHREE();
    const pts = [];
    const r = baseRadius;
    const h = baseHeight;

    pts.push(new THREE.Vector2(0, 0));
    pts.push(new THREE.Vector2(r, 0));
    pts.push(new THREE.Vector2(r, h * 0.12));
    pts.push(new THREE.Vector2(r * 0.94, h * 0.24));
    pts.push(new THREE.Vector2(r * 0.90, h * 0.36));
    pts.push(new THREE.Vector2(r * 0.84, h * 0.48));
    pts.push(new THREE.Vector2(r * 0.76, h * 0.65));
    pts.push(new THREE.Vector2(r * 0.72, h * 0.80));
    pts.push(new THREE.Vector2(r * 0.78, h * 0.92));
    pts.push(new THREE.Vector2(r * 0.65, h));

    return pts;
  }

  /**
   * Internal felt pad material for piece bases
   */
  let feltMaterialCache = null;
  function getFeltMaterial() {
    if (feltMaterialCache) return feltMaterialCache;
    const THREE = getTHREE();
    feltMaterialCache = new THREE.MeshStandardMaterial({
      color: 0x141618, // deep dark tournament felt pad
      roughness: 0.95,
      metalness: 0.0
    });
    feltMaterialCache.userData = { isSharedMaterial: true };
    return feltMaterialCache;
  }

  function createFeltPad(radius) {
    const THREE = getTHREE();
    const cacheKey = `felt_${radius}`;
    let geom = geometryCache.get(cacheKey);
    if (!geom) {
      geom = new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, 0.005, 24);
      geom.userData = { isSharedGeometry: true };
      geometryCache.set(cacheKey, geom);
    }
    const mesh = new THREE.Mesh(geom);
    mesh.position.y = 0.0025;
    mesh.userData.isFelt = true;
    return mesh;
  }

  /**
   * Outline / Accent Trim Material Factory:
   * White pieces get a crisp dark obsidian accent (#14171d); Black pieces get a bright silver accent (#e2e8f0).
   */
  function getOutlineMaterial(color, theme) {
    const THREE = getTHREE();
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);
    const key = `${th}_${c}`;
    if (outlineMaterialCache.has(key)) return outlineMaterialCache.get(key);

    let outlineColor;
    if (th === 'neon') {
      outlineColor = (c === 'w') ? 0x00ffff : 0xff007f;
    } else {
      // White pieces get dark obsidian accent (#14171d); Black pieces get bright silver accent (#e2e8f0)
      outlineColor = (c === 'w') ? 0x14171d : 0xe2e8f0;
    }

    const MaterialClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const mat = new MaterialClass({
      color: outlineColor,
      roughness: 0.35,
      metalness: 0.25,
      clearcoat: 0.50,
      clearcoatRoughness: 0.15,
      envMapIntensity: 1.15,
      side: THREE.FrontSide
    });
    mat.userData = { isSharedMaterial: true };

    outlineMaterialCache.set(key, mat);
    return mat;
  }

  const PIECE_TRIM_SPECS = {
    p: { baseR: 0.27, collarR: 0.170, collarY: 0.62 },
    r: { baseR: 0.30, collarR: 0.280, collarY: 0.96 },
    n: { baseR: 0.30, collarR: 0.210, collarY: 0.29 },
    b: { baseR: 0.30, collarR: 0.205, collarY: 0.79 },
    q: { baseR: 0.33, collarR: 0.235, collarY: 0.98 },
    k: { baseR: 0.35, collarR: 0.255, collarY: 1.12 }
  };

  /**
   * Helper: Add Clean 3D Physical Accent Trim Torus Rings to Piece Group
   * (Replaces glitchy BackSide inverted-hull scaling with crisp, non-coplanar 3D accent contours)
   */
  function addInvertedHullOutline(pieceGroup, color, theme, type) {
    const THREE = getTHREE();
    const t = normalizeType(type || (pieceGroup.userData && pieceGroup.userData.type));
    const spec = PIECE_TRIM_SPECS[t] || PIECE_TRIM_SPECS.p;
    const outlineMat = getOutlineMaterial(color, theme);

    // 1. Base trim ring at y = 0.018
    const baseKey = `trim_base_${t}`;
    let baseTrimGeom = geometryCache.get(baseKey);
    if (!baseTrimGeom) {
      baseTrimGeom = new THREE.TorusGeometry(spec.baseR * 1.005, 0.013, 12, 24);
      baseTrimGeom.userData = { isSharedGeometry: true };
      geometryCache.set(baseKey, baseTrimGeom);
    }
    const baseTrim = new THREE.Mesh(baseTrimGeom, outlineMat);
    baseTrim.rotation.x = Math.PI / 2;
    baseTrim.position.y = 0.018;
    baseTrim.userData.isOutline = true;
    baseTrim.castShadow = false;
    baseTrim.receiveShadow = false;
    pieceGroup.add(baseTrim);

    // 2. Collar / waist accent ring at piece's collar height
    const collarKey = `trim_collar_${t}`;
    let collarTrimGeom = geometryCache.get(collarKey);
    if (!collarTrimGeom) {
      collarTrimGeom = new THREE.TorusGeometry(spec.collarR * 1.01, 0.011, 12, 24);
      collarTrimGeom.userData = { isSharedGeometry: true };
      geometryCache.set(collarKey, collarTrimGeom);
    }
    const collarTrim = new THREE.Mesh(collarTrimGeom, outlineMat);
    collarTrim.rotation.x = Math.PI / 2;
    collarTrim.position.y = spec.collarY;
    collarTrim.userData.isOutline = true;
    collarTrim.castShadow = false;
    collarTrim.receiveShadow = false;
    pieceGroup.add(collarTrim);
  }

  // =========================================================================
  // PIECE BUILDERS
  // =========================================================================

  /**
   * 1. Pawn ('p') - Lathe stem & pedestal with polished spherical head
   */
  function createPawnGeometry() {
    const THREE = getTHREE();
    const group = new THREE.Group();

    // Dark tournament felt base pad
    group.add(createFeltPad(0.27));

    // Turned base, stem, and neck collar
    let stemGeom = geometryCache.get('pawn_stem');
    if (!stemGeom) {
      const pts = createStauntonBasePoints(0.27, 0.24);
      // Tapered column to neck
      pts.push(new THREE.Vector2(0.165, 0.35));
      pts.push(new THREE.Vector2(0.135, 0.48));
      pts.push(new THREE.Vector2(0.115, 0.58));
      // Neck collar bead
      pts.push(new THREE.Vector2(0.170, 0.61));
      pts.push(new THREE.Vector2(0.170, 0.63));
      pts.push(new THREE.Vector2(0.110, 0.65));
      pts.push(new THREE.Vector2(0.090, 0.68));

      stemGeom = new THREE.LatheGeometry(pts, 24);
      stemGeom.computeVertexNormals();
      stemGeom.userData = { isSharedGeometry: true };
      geometryCache.set('pawn_stem', stemGeom);
    }
    group.add(new THREE.Mesh(stemGeom));

    // Spherical head
    let headGeom = geometryCache.get('pawn_head');
    if (!headGeom) {
      headGeom = new THREE.SphereGeometry(0.165, 24, 20);
      headGeom.userData = { isSharedGeometry: true };
      geometryCache.set('pawn_head', headGeom);
    }
    const headMesh = new THREE.Mesh(headGeom);
    headMesh.position.y = 0.81;
    group.add(headMesh);

    return group;
  }

  /**
   * 2. Rook ('r') - Fluted tower, parapet rim, 4 castle crenellations (merlons)
   */
  function createRookGeometry() {
    const THREE = getTHREE();
    const group = new THREE.Group();

    // Dark tournament felt base pad
    group.add(createFeltPad(0.30));

    // Turned tower base, column, and upper flared parapet cornice
    let towerGeom = geometryCache.get('rook_tower');
    if (!towerGeom) {
      const pts = createStauntonBasePoints(0.30, 0.25);
      pts.push(new THREE.Vector2(0.210, 0.32));
      pts.push(new THREE.Vector2(0.200, 0.55));
      pts.push(new THREE.Vector2(0.195, 0.78));
      pts.push(new THREE.Vector2(0.220, 0.86));
      pts.push(new THREE.Vector2(0.280, 0.96));
      pts.push(new THREE.Vector2(0.285, 1.02));
      // Recessed tower deck
      pts.push(new THREE.Vector2(0.190, 1.02));
      pts.push(new THREE.Vector2(0.185, 0.98));
      pts.push(new THREE.Vector2(0, 0.98));

      towerGeom = new THREE.LatheGeometry(pts, 24);
      towerGeom.computeVertexNormals();
      towerGeom.userData = { isSharedGeometry: true };
      geometryCache.set('rook_tower', towerGeom);
    }
    group.add(new THREE.Mesh(towerGeom));

    // 4 Castle Crenellations (Merlons) on top of the rim (y=1.02 to y=1.20)
    let merlonGeom = geometryCache.get('rook_merlon');
    if (!merlonGeom) {
      merlonGeom = new THREE.BoxGeometry(0.135, 0.18, 0.08);
      merlonGeom.userData = { isSharedGeometry: true };
      geometryCache.set('rook_merlon', merlonGeom);
    }
    const merlonRadius = 0.235;

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const merlon = new THREE.Mesh(merlonGeom);
      merlon.position.set(
        Math.cos(angle) * merlonRadius,
        1.11, // centered at y=1.11 (1.02 + 0.09)
        Math.sin(angle) * merlonRadius
      );
      merlon.rotation.y = -angle;
      group.add(merlon);
    }

    return group;
  }

  /**
   * 3. Knight ('n') - Turned pedestal, sculpted horse head with arched neck,
   * mane crest, perked ears, muzzle, and eyes
   */
  function createKnightGeometry() {
    const THREE = getTHREE();
    const group = new THREE.Group();

    // Dark tournament felt base pad
    group.add(createFeltPad(0.30));

    // Turned pedestal base
    let baseGeom = geometryCache.get('knight_base');
    if (!baseGeom) {
      const pts = createStauntonBasePoints(0.30, 0.28);
      pts.push(new THREE.Vector2(0.21, 0.29));
      pts.push(new THREE.Vector2(0, 0.29));

      baseGeom = new THREE.LatheGeometry(pts, 24);
      baseGeom.computeVertexNormals();
      baseGeom.userData = { isSharedGeometry: true };
      geometryCache.set('knight_base', baseGeom);
    }
    group.add(new THREE.Mesh(baseGeom));

    // Horse Head & Neck: 2D side profile extruded with bevel
    let headExtrudeGeom = geometryCache.get('knight_head_extrude');
    if (!headExtrudeGeom) {
      const shape = new THREE.Shape();
      // Start at rear base of neck
      shape.moveTo(0.15, 0.28);
      // Arched neck crest going up to poll of skull
      shape.quadraticCurveTo(0.17, 0.50, 0.16, 0.65);
      shape.quadraticCurveTo(0.14, 0.85, 0.07, 1.02);
      shape.quadraticCurveTo(0.01, 1.14, -0.04, 1.18);
      // Brow line and nose bridge (horse faces -Z)
      shape.lineTo(-0.11, 1.14);
      shape.quadraticCurveTo(-0.18, 1.04, -0.22, 0.94);
      shape.lineTo(-0.27, 0.83); // snout apex
      // Upper lip, mouth cleft, chin
      shape.lineTo(-0.25, 0.77);
      shape.lineTo(-0.20, 0.78);
      shape.lineTo(-0.20, 0.73);
      // Under-jaw (ganache curve) and throat back down to chest
      shape.quadraticCurveTo(-0.14, 0.66, -0.10, 0.55);
      shape.quadraticCurveTo(-0.07, 0.44, -0.13, 0.38);
      shape.lineTo(-0.14, 0.28);
      shape.closePath();

      const depth = 0.13;
      const extrudeSettings = {
        depth: depth,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 4
      };

      headExtrudeGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // Transform so shape (z, y) maps to 3D: X = extrude depth (centered), Y = Y, Z = shape X (facing -Z)
      headExtrudeGeom.applyMatrix4(new THREE.Matrix4().set(
        0, 0, 1, 0,
        0, 1, 0, 0,
        1, 0, 0, 0,
        0, 0, 0, 1
      ));
      headExtrudeGeom.translate(-(depth + 0.04) / 2, 0, 0);

      // Invert triangle index winding to correct flipped face normals from reflection determinant (-1)
      if (headExtrudeGeom.index && headExtrudeGeom.index.array) {
        const indexArray = headExtrudeGeom.index.array;
        for (let i = 0; i < indexArray.length; i += 3) {
          const temp = indexArray[i + 1];
          indexArray[i + 1] = indexArray[i + 2];
          indexArray[i + 2] = temp;
        }
        headExtrudeGeom.index.needsUpdate = true;
      }
      headExtrudeGeom.computeVertexNormals();
      headExtrudeGeom.userData = { isSharedGeometry: true };
      geometryCache.set('knight_head_extrude', headExtrudeGeom);
    }
    group.add(new THREE.Mesh(headExtrudeGeom));

    // Perked Pointed Ears (Facing forward & slightly flared)
    let earGeom = geometryCache.get('knight_ear');
    if (!earGeom) {
      earGeom = new THREE.ConeGeometry(0.034, 0.14, 6);
      earGeom.computeVertexNormals();
      earGeom.userData = { isSharedGeometry: true };
      geometryCache.set('knight_ear', earGeom);
    }

    const leftEar = new THREE.Mesh(earGeom);
    leftEar.position.set(-0.062, 1.22, -0.04);
    leftEar.rotation.set(-0.20, 0, -0.22);
    group.add(leftEar);

    const rightEar = new THREE.Mesh(earGeom);
    rightEar.position.set(0.062, 1.22, -0.04);
    rightEar.rotation.set(-0.20, 0, 0.22);
    group.add(rightEar);

    // Sculpted Mane Ridges along back curve of neck
    const manePositions = [
      { y: 0.54, z: 0.170 },
      { y: 0.72, z: 0.175 },
      { y: 0.90, z: 0.145 },
      { y: 1.06, z: 0.080 }
    ];
    let maneGeom = geometryCache.get('knight_mane');
    if (!maneGeom) {
      maneGeom = new THREE.BoxGeometry(0.08, 0.08, 0.06);
      maneGeom.userData = { isSharedGeometry: true };
      geometryCache.set('knight_mane', maneGeom);
    }

    for (const m of manePositions) {
      const maneMesh = new THREE.Mesh(maneGeom);
      maneMesh.position.set(0, m.y, m.z);
      maneMesh.rotation.x = -0.35;
      group.add(maneMesh);
    }

    // Sculpted Eyes (tagged isOutline for contrasting accent)
    let eyeGeom = geometryCache.get('knight_eye');
    if (!eyeGeom) {
      eyeGeom = new THREE.SphereGeometry(0.024, 10, 10);
      eyeGeom.userData = { isSharedGeometry: true };
      geometryCache.set('knight_eye', eyeGeom);
    }
    const leftEye = new THREE.Mesh(eyeGeom);
    leftEye.position.set(-0.11, 1.02, -0.13);
    leftEye.userData.isOutline = true;
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom);
    rightEye.position.set(0.11, 1.02, -0.13);
    rightEye.userData.isOutline = true;
    group.add(rightEye);

    // Sculpted Nostrils (tagged isOutline for contrasting accent)
    let nostrilGeom = geometryCache.get('knight_nostril');
    if (!nostrilGeom) {
      nostrilGeom = new THREE.SphereGeometry(0.016, 8, 8);
      nostrilGeom.userData = { isSharedGeometry: true };
      geometryCache.set('knight_nostril', nostrilGeom);
    }
    const leftNostril = new THREE.Mesh(nostrilGeom);
    leftNostril.position.set(-0.045, 0.82, -0.26);
    leftNostril.userData.isOutline = true;
    group.add(leftNostril);

    const rightNostril = new THREE.Mesh(nostrilGeom);
    rightNostril.position.set(0.045, 0.82, -0.26);
    rightNostril.userData.isOutline = true;
    group.add(rightNostril);

    return group;
  }

  /**
   * 4. Bishop ('b') - Turned stem, double collar cushion, mitre head with
   * diagonal slot cut and apex finial orb
   */
  function createBishopGeometry() {
    const THREE = getTHREE();
    const group = new THREE.Group();

    // Dark tournament felt base pad
    group.add(createFeltPad(0.30));

    // Turned base, slender column, and double collar
    let mitreGeom = geometryCache.get('bishop_mitre');
    if (!mitreGeom) {
      const pts = createStauntonBasePoints(0.30, 0.24);
      pts.push(new THREE.Vector2(0.170, 0.38));
      pts.push(new THREE.Vector2(0.140, 0.58));
      pts.push(new THREE.Vector2(0.120, 0.72));
      // Double collar cushion
      pts.push(new THREE.Vector2(0.180, 0.75));
      pts.push(new THREE.Vector2(0.210, 0.79));
      pts.push(new THREE.Vector2(0.190, 0.83));
      pts.push(new THREE.Vector2(0.135, 0.86));

      // Mitre body (teardrop bulb)
      pts.push(new THREE.Vector2(0.195, 0.96));
      pts.push(new THREE.Vector2(0.235, 1.10)); // maximum belly
      pts.push(new THREE.Vector2(0.220, 1.22));
      pts.push(new THREE.Vector2(0.160, 1.34));
      pts.push(new THREE.Vector2(0.090, 1.41));
      pts.push(new THREE.Vector2(0.040, 1.45));
      pts.push(new THREE.Vector2(0.010, 1.47));
      pts.push(new THREE.Vector2(0, 1.47));

      mitreGeom = new THREE.LatheGeometry(pts, 24);
      mitreGeom.computeVertexNormals();
      mitreGeom.userData = { isSharedGeometry: true };
      geometryCache.set('bishop_mitre', mitreGeom);
    }
    group.add(new THREE.Mesh(mitreGeom));

    // Iconic Diagonal Slot (angled Staunton cleft)
    // Modeled as an inset dark bevel cut into the upper mitre
    let slotGeom = geometryCache.get('bishop_slot');
    if (!slotGeom) {
      slotGeom = new THREE.BoxGeometry(0.035, 0.16, 0.28);
      slotGeom.userData = { isSharedGeometry: true };
      geometryCache.set('bishop_slot', slotGeom);
    }
    const slotMesh = new THREE.Mesh(slotGeom);
    slotMesh.position.set(0.11, 1.25, 0);
    slotMesh.rotation.z = Math.PI / 4; // 45 degree diagonal slice
    // Mark slot so theme updates can keep it subtly recessed
    slotMesh.userData.isSlot = true;
    group.add(slotMesh);

    // Apex Finial Orb atop the mitre
    let orbGeom = geometryCache.get('bishop_orb');
    if (!orbGeom) {
      orbGeom = new THREE.SphereGeometry(0.048, 20, 16);
      orbGeom.userData = { isSharedGeometry: true };
      geometryCache.set('bishop_orb', orbGeom);
    }
    const orbMesh = new THREE.Mesh(orbGeom);
    orbMesh.position.y = 1.51;
    group.add(orbMesh);

    return group;
  }

  /**
   * 5. Queen ('q') - Regal flared coronet with 8 pearl spheres, inner dome & apex orb
   */
  function createQueenGeometry() {
    const THREE = getTHREE();
    const group = new THREE.Group();

    // Dark tournament felt base pad
    group.add(createFeltPad(0.33));

    // Turned base, stem, platform, and flaring coronet cup
    let bodyGeom = geometryCache.get('queen_body');
    if (!bodyGeom) {
      const pts = createStauntonBasePoints(0.33, 0.26);
      pts.push(new THREE.Vector2(0.180, 0.48));
      pts.push(new THREE.Vector2(0.150, 0.72));
      pts.push(new THREE.Vector2(0.140, 0.90));
      // Platform collar
      pts.push(new THREE.Vector2(0.220, 0.95));
      pts.push(new THREE.Vector2(0.240, 1.00));
      pts.push(new THREE.Vector2(0.190, 1.05));
      // Flaring coronet bowl
      pts.push(new THREE.Vector2(0.210, 1.05));
      pts.push(new THREE.Vector2(0.260, 1.25));
      pts.push(new THREE.Vector2(0.295, 1.50));
      pts.push(new THREE.Vector2(0.275, 1.50));
      pts.push(new THREE.Vector2(0.200, 1.38));
      // Inner dome rising inside coronet bowl
      pts.push(new THREE.Vector2(0.190, 1.42));
      pts.push(new THREE.Vector2(0.150, 1.54));
      pts.push(new THREE.Vector2(0.060, 1.63));
      pts.push(new THREE.Vector2(0.035, 1.66));
      pts.push(new THREE.Vector2(0, 1.66));

      bodyGeom = new THREE.LatheGeometry(pts, 24);
      bodyGeom.computeVertexNormals();
      bodyGeom.userData = { isSharedGeometry: true };
      geometryCache.set('queen_body', bodyGeom);
    }
    group.add(new THREE.Mesh(bodyGeom));

    // 8 Coronet Rim Pearls with supporting petal tips
    const pearlRadius = 0.290;
    let pearlGeom = geometryCache.get('queen_pearl');
    if (!pearlGeom) {
      pearlGeom = new THREE.SphereGeometry(0.032, 14, 12);
      pearlGeom.userData = { isSharedGeometry: true };
      geometryCache.set('queen_pearl', pearlGeom);
    }
    let petalGeom = geometryCache.get('queen_petal');
    if (!petalGeom) {
      petalGeom = new THREE.ConeGeometry(0.030, 0.06, 4);
      petalGeom.userData = { isSharedGeometry: true };
      geometryCache.set('queen_petal', petalGeom);
    }

    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      const px = Math.cos(angle) * pearlRadius;
      const pz = Math.sin(angle) * pearlRadius;

      // Pearl ball
      const pearl = new THREE.Mesh(pearlGeom);
      pearl.position.set(px, 1.52, pz);
      group.add(pearl);

      // Petal rim tooth
      const petal = new THREE.Mesh(petalGeom);
      petal.position.set(px, 1.48, pz);
      petal.rotation.x = Math.PI; // inverted cone pointing up
      group.add(petal);
    }

    // Apex Finial Pearl Orb
    let apexGeom = geometryCache.get('queen_apex');
    if (!apexGeom) {
      apexGeom = new THREE.SphereGeometry(0.062, 20, 16);
      apexGeom.userData = { isSharedGeometry: true };
      geometryCache.set('queen_apex', apexGeom);
    }
    const apexMesh = new THREE.Mesh(apexGeom);
    apexMesh.position.y = 1.74;
    group.add(apexMesh);

    return group;
  }

  /**
   * 6. King ('k') - Noble turned column, flared gallery, inner dome & 3D Cross Pattée finial
   */
  function createKingGeometry() {
    const THREE = getTHREE();
    const group = new THREE.Group();

    // Dark tournament felt base pad
    group.add(createFeltPad(0.35));

    // Turned base, shaft, double gallery collar, and cupola
    let kingBodyGeom = geometryCache.get('king_body');
    if (!kingBodyGeom) {
      const pts = createStauntonBasePoints(0.35, 0.28);
      pts.push(new THREE.Vector2(0.190, 0.55));
      pts.push(new THREE.Vector2(0.165, 0.85));
      pts.push(new THREE.Vector2(0.155, 1.04));
      // Gallery collars
      pts.push(new THREE.Vector2(0.240, 1.09));
      pts.push(new THREE.Vector2(0.260, 1.15));
      pts.push(new THREE.Vector2(0.210, 1.20));
      // Cupola bowl
      pts.push(new THREE.Vector2(0.270, 1.40));
      pts.push(new THREE.Vector2(0.305, 1.58));
      pts.push(new THREE.Vector2(0.280, 1.58));
      pts.push(new THREE.Vector2(0.210, 1.48));
      // Inner dome
      pts.push(new THREE.Vector2(0.190, 1.52));
      pts.push(new THREE.Vector2(0.140, 1.64));
      pts.push(new THREE.Vector2(0.060, 1.72));
      pts.push(new THREE.Vector2(0.045, 1.75));
      pts.push(new THREE.Vector2(0, 1.75));

      kingBodyGeom = new THREE.LatheGeometry(pts, 24);
      kingBodyGeom.computeVertexNormals();
      kingBodyGeom.userData = { isSharedGeometry: true };
      geometryCache.set('king_body', kingBodyGeom);
    }
    group.add(new THREE.Mesh(kingBodyGeom));

    // Turned Pedestal Orb for Cross
    let orbGeom = geometryCache.get('king_orb');
    if (!orbGeom) {
      orbGeom = new THREE.SphereGeometry(0.045, 16, 14);
      orbGeom.userData = { isSharedGeometry: true };
      geometryCache.set('king_orb', orbGeom);
    }
    const orbMesh = new THREE.Mesh(orbGeom);
    orbMesh.position.y = 1.76;
    group.add(orbMesh);

    // 3D Cross Pattée Finial
    // Vertical cross beam
    let vertBeamGeom = geometryCache.get('king_vert_beam');
    if (!vertBeamGeom) {
      vertBeamGeom = new THREE.BoxGeometry(0.065, 0.23, 0.045);
      vertBeamGeom.userData = { isSharedGeometry: true };
      geometryCache.set('king_vert_beam', vertBeamGeom);
    }
    const vertBeam = new THREE.Mesh(vertBeamGeom);
    vertBeam.position.set(0, 1.88, 0);
    group.add(vertBeam);

    // Horizontal cross beam
    let horizBeamGeom = geometryCache.get('king_horiz_beam');
    if (!horizBeamGeom) {
      horizBeamGeom = new THREE.BoxGeometry(0.18, 0.065, 0.045);
      horizBeamGeom.userData = { isSharedGeometry: true };
      geometryCache.set('king_horiz_beam', horizBeamGeom);
    }
    const horizBeam = new THREE.Mesh(horizBeamGeom);
    horizBeam.position.set(0, 1.90, 0);
    group.add(horizBeam);

    // Cross Pattée flared end-caps
    let topCapGeom = geometryCache.get('king_top_cap');
    if (!topCapGeom) {
      topCapGeom = new THREE.BoxGeometry(0.09, 0.028, 0.052);
      topCapGeom.userData = { isSharedGeometry: true };
      geometryCache.set('king_top_cap', topCapGeom);
    }
    const topCap = new THREE.Mesh(topCapGeom);
    topCap.position.set(0, 1.995, 0);
    group.add(topCap);

    let sideCapGeom = geometryCache.get('king_side_cap');
    if (!sideCapGeom) {
      sideCapGeom = new THREE.BoxGeometry(0.028, 0.09, 0.052);
      sideCapGeom.userData = { isSharedGeometry: true };
      geometryCache.set('king_side_cap', sideCapGeom);
    }
    const leftCap = new THREE.Mesh(sideCapGeom);
    leftCap.position.set(-0.09, 1.90, 0);
    group.add(leftCap);

    const rightCap = new THREE.Mesh(sideCapGeom);
    rightCap.position.set(0.09, 1.90, 0);
    group.add(rightCap);

    return group;
  }

  // Registry of piece geometry builders
  const GEOMETRY_BUILDERS = {
    p: createPawnGeometry,
    r: createRookGeometry,
    n: createKnightGeometry,
    b: createBishopGeometry,
    q: createQueenGeometry,
    k: createKingGeometry
  };

  /**
   * Internal slot material helper for Bishop diagonal slit
   */
  function getSlotMaterial(baseMaterial, theme, color) {
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);
    const key = `${th}_${c}`;
    if (slotMaterialCache.has(key)) return slotMaterialCache.get(key);

    const THREE = getTHREE();
    const MaterialClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    let mat;
    if (th === 'neon') {
      mat = new MaterialClass({
        color: 0x111116,
        roughness: 0.8,
        metalness: 0.1,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        side: THREE.FrontSide
      });
    } else {
      mat = new MaterialClass({
        color: c === 'w' ? 0x9e9788 : 0x111114,
        roughness: 0.8,
        metalness: 0.05,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        side: THREE.FrontSide
      });
    }
    mat.userData = { isSharedMaterial: true };
    slotMaterialCache.set(key, mat);
    return mat;
  }

  // =========================================================================
  // 2D PROCEDURAL VECTOR CHESS PIECES (Lichess cburnett / Chess.com Neo style)
  // Transparent plane with authentic vector silhouettes (NO round pucks/rings)
  // =========================================================================

  function drawPieceVectorSilhouette(ctx, type, cx) {
    ctx.beginPath();
    switch (type) {
      case 'p': {
        // Authentic Lichess Pawn: wide flat base, double band, concave neck, collar, round head
        ctx.moveTo(cx - 110, 440);
        ctx.lineTo(cx + 110, 440);
        ctx.quadraticCurveTo(cx + 110, 415, cx + 88, 412);
        ctx.lineTo(cx + 88, 395);
        ctx.quadraticCurveTo(cx + 42, 330, cx + 32, 255);
        ctx.lineTo(cx + 52, 245);
        ctx.lineTo(cx + 52, 225);
        ctx.lineTo(cx + 26, 222);
        // Head sphere
        ctx.arc(cx, 155, 62, 0.46, Math.PI - 0.46, true);
        ctx.lineTo(cx - 52, 225);
        ctx.lineTo(cx - 52, 245);
        ctx.lineTo(cx - 32, 255);
        ctx.quadraticCurveTo(cx - 42, 330, cx - 88, 395);
        ctx.lineTo(cx - 88, 412);
        ctx.quadraticCurveTo(cx - 110, 415, cx - 110, 440);
        ctx.closePath();
        break;
      }

      case 'r': {
        // Authentic Lichess Rook: wide stepped base, straight tower, flared cornice, 3 merlons
        ctx.moveTo(cx - 115, 440);
        ctx.lineTo(cx + 115, 440);
        ctx.quadraticCurveTo(cx + 115, 415, cx + 95, 408);
        ctx.lineTo(cx + 95, 385);
        ctx.lineTo(cx + 72, 385);
        ctx.lineTo(cx + 72, 215);
        ctx.lineTo(cx + 105, 175);
        // Merlon 3 (right)
        ctx.lineTo(cx + 105, 115);
        ctx.lineTo(cx + 65, 115);
        ctx.lineTo(cx + 65, 150);
        // Crenel 2
        ctx.lineTo(cx + 30, 150);
        // Merlon 2 (center)
        ctx.lineTo(cx + 30, 115);
        ctx.lineTo(cx - 30, 115);
        ctx.lineTo(cx - 30, 150);
        // Crenel 1
        ctx.lineTo(cx - 65, 150);
        // Merlon 1 (left)
        ctx.lineTo(cx - 65, 115);
        ctx.lineTo(cx - 105, 115);
        ctx.lineTo(cx - 105, 175);
        ctx.lineTo(cx - 72, 215);
        ctx.lineTo(cx - 72, 385);
        ctx.lineTo(cx - 95, 385);
        ctx.lineTo(cx - 95, 408);
        ctx.quadraticCurveTo(cx - 115, 415, cx - 115, 440);
        ctx.closePath();
        break;
      }

      case 'n': {
        // Authentic Lichess Knight horse head facing LEFT
        ctx.moveTo(140, 440);
        ctx.lineTo(375, 440);
        ctx.quadraticCurveTo(375, 415, 360, 405);
        ctx.quadraticCurveTo(385, 310, 375, 220);
        ctx.quadraticCurveTo(365, 145, 325, 105);
        ctx.lineTo(290, 72);
        // Right ear
        ctx.lineTo(290, 42);
        ctx.lineTo(265, 75);
        // Left ear
        ctx.lineTo(252, 48);
        ctx.lineTo(232, 85);
        // Forehead down to snout (facing left)
        ctx.quadraticCurveTo(185, 135, 142, 192);
        ctx.lineTo(110, 240); // snout apex
        // Snout curl & mouth slit
        ctx.quadraticCurveTo(112, 275, 136, 275);
        ctx.lineTo(168, 260); // mouth cleft
        ctx.lineTo(144, 290); // lower jaw
        ctx.quadraticCurveTo(180, 308, 212, 296); // ganache curve
        ctx.quadraticCurveTo(168, 350, 152, 405); // throat/chest
        ctx.quadraticCurveTo(140, 415, 140, 440);
        ctx.closePath();
        break;
      }

      case 'b': {
        // Authentic Lichess Bishop: tiered base, collar, mitre dome with finial orb
        ctx.moveTo(cx - 110, 440);
        ctx.lineTo(cx + 110, 440);
        ctx.quadraticCurveTo(cx + 110, 415, cx + 88, 408);
        ctx.lineTo(cx + 88, 385);
        ctx.quadraticCurveTo(cx + 42, 350, cx + 28, 335);
        ctx.lineTo(cx + 52, 330);
        ctx.lineTo(cx + 42, 312);
        // Plump Mitre dome
        ctx.quadraticCurveTo(cx + 92, 240, cx + 64, 180);
        ctx.quadraticCurveTo(cx + 36, 130, cx, 115); // dome apex
        ctx.quadraticCurveTo(cx - 36, 130, cx - 64, 180);
        ctx.quadraticCurveTo(cx - 92, 240, cx - 42, 312);
        ctx.lineTo(cx - 52, 330);
        ctx.lineTo(cx - 28, 335);
        ctx.quadraticCurveTo(cx - 42, 350, cx - 88, 385);
        ctx.lineTo(cx - 88, 408);
        ctx.quadraticCurveTo(cx - 110, 415, cx - 110, 440);
        ctx.closePath();
        break;
      }

      case 'q': {
        // Authentic Lichess Queen: tiered base, collar, 5-point scalloped coronet
        ctx.moveTo(cx - 118, 440);
        ctx.lineTo(cx + 118, 440);
        ctx.quadraticCurveTo(cx + 118, 415, cx + 96, 408);
        ctx.lineTo(cx + 96, 385);
        ctx.quadraticCurveTo(cx + 52, 350, cx + 38, 330);
        ctx.lineTo(cx + 62, 325);
        ctx.lineTo(cx + 52, 305);
        // 5 Coronet points & 4 scallops
        ctx.lineTo(cx + 118, 175); // point 5
        ctx.quadraticCurveTo(cx + 85, 225, cx + 64, 140); // point 4
        ctx.quadraticCurveTo(cx + 36, 205, cx, 118); // center point 3
        ctx.quadraticCurveTo(cx - 36, 205, cx - 64, 140); // point 2
        ctx.quadraticCurveTo(cx - 85, 225, cx - 118, 175); // point 1
        ctx.lineTo(cx - 52, 305);
        ctx.lineTo(cx - 62, 325);
        ctx.lineTo(cx - 38, 330);
        ctx.quadraticCurveTo(cx - 52, 350, cx - 96, 385);
        ctx.lineTo(cx - 96, 408);
        ctx.quadraticCurveTo(cx - 118, 415, cx - 118, 440);
        ctx.closePath();
        break;
      }

      case 'k': {
        // Authentic Lichess King: tiered base, collar, symmetrical crown lobes, apex cross
        ctx.moveTo(cx - 120, 440);
        ctx.lineTo(cx + 120, 440);
        ctx.quadraticCurveTo(cx + 120, 415, cx + 98, 408);
        ctx.lineTo(cx + 98, 385);
        ctx.quadraticCurveTo(cx + 56, 350, cx + 42, 330);
        ctx.lineTo(cx + 66, 325);
        ctx.lineTo(cx + 56, 305);
        // Crown lobes curving out and meeting at central dip
        ctx.quadraticCurveTo(cx + 115, 240, cx + 85, 175);
        ctx.quadraticCurveTo(cx + 42, 165, cx + 18, 185);
        // Cross Finial
        ctx.lineTo(cx + 18, 130);
        ctx.lineTo(cx + 42, 130);
        ctx.lineTo(cx + 42, 102);
        ctx.lineTo(cx + 18, 102);
        ctx.lineTo(cx + 18, 68);
        ctx.lineTo(cx - 18, 68);
        ctx.lineTo(cx - 18, 102);
        ctx.lineTo(cx - 42, 102);
        ctx.lineTo(cx - 42, 130);
        ctx.lineTo(cx - 18, 130);
        ctx.lineTo(cx - 18, 185);
        // Left crown lobe
        ctx.quadraticCurveTo(cx - 42, 165, cx - 85, 175);
        ctx.quadraticCurveTo(cx - 115, 240, cx - 56, 305);
        ctx.lineTo(cx - 66, 325);
        ctx.lineTo(cx - 42, 330);
        ctx.quadraticCurveTo(cx - 56, 350, cx - 98, 385);
        ctx.lineTo(cx - 98, 408);
        ctx.quadraticCurveTo(cx - 120, 415, cx - 120, 440);
        ctx.closePath();
        break;
      }
    }
  }

  function drawPieceInnerDetails(ctx, type, cx) {
    ctx.beginPath();
    switch (type) {
      case 'p': {
        // Base bands
        ctx.beginPath();
        ctx.moveTo(cx - 95, 412);
        ctx.lineTo(cx + 95, 412);
        ctx.stroke();
        // Collar band
        ctx.beginPath();
        ctx.moveTo(cx - 48, 235);
        ctx.lineTo(cx + 48, 235);
        ctx.stroke();
        // Head highlight arc
        ctx.beginPath();
        ctx.arc(cx - 16, 142, 32, -Math.PI * 0.72, -Math.PI * 0.12);
        ctx.stroke();
        break;
      }

      case 'r': {
        // Base seam
        ctx.beginPath();
        ctx.moveTo(cx - 100, 410);
        ctx.lineTo(cx + 100, 410);
        // Cornice band
        ctx.moveTo(cx - 72, 215);
        ctx.lineTo(cx + 72, 215);
        ctx.moveTo(cx - 95, 175);
        ctx.lineTo(cx + 95, 175);
        // Arrow slit window in center
        ctx.moveTo(cx, 260);
        ctx.lineTo(cx, 330);
        ctx.stroke();
        break;
      }

      case 'n': {
        // Sculpted almond eye
        ctx.beginPath();
        ctx.arc(218, 148, 7, 0, Math.PI * 2);
        ctx.fill();
        // Nostril curl
        ctx.beginPath();
        ctx.arc(140, 252, 5, 0, Math.PI * 2);
        ctx.fill();
        // Mane ridge curves
        ctx.beginPath();
        ctx.moveTo(330, 125);
        ctx.quadraticCurveTo(300, 155, 325, 190);
        ctx.moveTo(350, 195);
        ctx.quadraticCurveTo(315, 230, 345, 270);
        ctx.moveTo(360, 280);
        ctx.quadraticCurveTo(320, 315, 350, 355);
        // Jaw outline
        ctx.moveTo(144, 290);
        ctx.quadraticCurveTo(180, 308, 212, 296);
        ctx.stroke();
        break;
      }

      case 'b': {
        // Base seams
        ctx.beginPath();
        ctx.moveTo(cx - 95, 410);
        ctx.lineTo(cx + 95, 410);
        ctx.moveTo(cx - 48, 325);
        ctx.lineTo(cx + 48, 325);
        ctx.stroke();
        // Central '+' cross inside mitre
        ctx.beginPath();
        ctx.moveTo(cx, 195);
        ctx.lineTo(cx, 260);
        ctx.moveTo(cx - 26, 222);
        ctx.lineTo(cx + 26, 222);
        ctx.stroke();
        // Finial orb atop mitre
        ctx.beginPath();
        ctx.arc(cx, 95, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'q': {
        // Base seams
        ctx.beginPath();
        ctx.moveTo(cx - 100, 410);
        ctx.lineTo(cx + 100, 410);
        ctx.moveTo(cx - 55, 325);
        ctx.lineTo(cx + 55, 325);
        // Coronet base cushion lobes
        ctx.moveTo(cx - 85, 290);
        ctx.quadraticCurveTo(cx, 320, cx + 85, 290);
        ctx.stroke();
        // 5 Round Pearls on top of coronet points
        const pearls = [
          [cx, 98],
          [cx - 64, 122], [cx + 64, 122],
          [cx - 118, 156], [cx + 118, 156]
        ];
        for (const [px, py] of pearls) {
          ctx.beginPath();
          ctx.arc(px, py, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }

      case 'k': {
        // Base seams
        ctx.beginPath();
        ctx.moveTo(cx - 105, 410);
        ctx.lineTo(cx + 105, 410);
        ctx.moveTo(cx - 58, 325);
        ctx.lineTo(cx + 58, 325);
        // Symmetrical inner crown lobe arcs
        ctx.moveTo(cx - 75, 210);
        ctx.quadraticCurveTo(cx - 30, 270, cx - 12, 305);
        ctx.moveTo(cx + 75, 210);
        ctx.quadraticCurveTo(cx + 30, 270, cx + 12, 305);
        // Center crown arch jewel line
        ctx.moveTo(cx - 32, 230);
        ctx.quadraticCurveTo(cx, 245, cx + 32, 230);
        ctx.stroke();
        break;
      }
    }
  }

  /**
   * Procedural Canvas Texture Factory for Lichess/Chess.com 2D Vector Pieces
   */
  function get2DPieceTexture(type, color, theme) {
    const t = normalizeType(type);
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);
    const key = `2d_${th}_${c}_${t}`;
    if (texture2DCache.has(key)) return texture2DCache.get(key);

    if (typeof document === 'undefined') return null;

    try {
      const THREE = getTHREE();
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const isWhite = c === 'w';
      const cx = 256;

      // 100% Transparent background (no pucks, circles, or badge discs)
      ctx.clearRect(0, 0, 512, 512);

      let pieceFill, pieceStroke, detailStroke, haloStroke;
      if (th === 'neon') {
        pieceFill = isWhite ? '#00ffff' : '#ff007f';
        pieceStroke = isWhite ? '#003344' : '#440022';
        detailStroke = '#ffffff';
        haloStroke = isWhite ? 'rgba(0, 255, 255, 0.55)' : 'rgba(255, 0, 127, 0.55)';
      } else if (th === 'wood') {
        pieceFill = isWhite ? '#fdf6e7' : '#2c1609';
        pieceStroke = isWhite ? '#3d2516' : '#0a0c0e';
        detailStroke = isWhite ? '#3d2516' : '#f1f5f9';
        haloStroke = isWhite ? 'rgba(61, 37, 22, 0.25)' : 'rgba(255, 255, 255, 0.75)';
      } else {
        // 'classic' & 'marble'
        pieceFill = isWhite ? '#ffffff' : '#1e2229';
        pieceStroke = isWhite ? '#141619' : '#0a0c0e';
        detailStroke = isWhite ? '#141619' : '#f1f5f9';
        haloStroke = isWhite ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.75)';
      }

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // 1. For black pieces: draw light outer halo stroke first so piece separates cleanly on dark squares
      if (!isWhite) {
        ctx.save();
        ctx.strokeStyle = haloStroke;
        ctx.lineWidth = 22;
        drawPieceVectorSilhouette(ctx, t, cx);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Draw silhouette fill with soft drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = pieceFill;
      drawPieceVectorSilhouette(ctx, t, cx);
      ctx.fill();
      ctx.restore();

      // 3. Draw crisp outer contour stroke
      ctx.strokeStyle = pieceStroke;
      ctx.lineWidth = isWhite ? 16 : 15;
      drawPieceVectorSilhouette(ctx, t, cx);
      ctx.stroke();

      // 4. Draw inner detail lines & features
      ctx.strokeStyle = detailStroke;
      ctx.fillStyle = detailStroke;
      ctx.lineWidth = isWhite ? 11 : 10;
      drawPieceInnerDetails(ctx, t, cx);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      texture2DCache.set(key, texture);
      return texture;
    } catch (e) {
      return null;
    }
  }

  /**
   * Procedural 2D Chess Piece Mesh Factory: Flat Transparent Plane on Three.js Board
   * (Authentic Lichess cburnett / Chess.com Neo style - NO pucks or circles)
   */
  function createPiece2DMesh(type, color, theme) {
    const THREE = getTHREE();
    const t = normalizeType(type);
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);
    const group = new THREE.Group();

    // Transparent plane with authentic Lichess / Chess.com vector silhouette
    const texture = get2DPieceTexture(t, c, th);
    let planeGeom = geometryCache.get('plane_2d');
    if (!planeGeom) {
      planeGeom = new THREE.PlaneGeometry(0.88, 0.88);
      planeGeom.userData = { isSharedGeometry: true };
      geometryCache.set('plane_2d', planeGeom);
    }
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture || null,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const planeMesh = new THREE.Mesh(planeGeom, planeMat);
    planeMesh.rotation.x = -Math.PI / 2;
    planeMesh.position.y = 0.015;
    planeMesh.userData.isFace = true;
    planeMesh.castShadow = false;
    planeMesh.receiveShadow = false;
    group.add(planeMesh);

    group.name = `piece_2d_${c}_${t}`;
    group.userData = {
      type: t,
      color: c,
      theme: th,
      mode: '2d',
      is2D: true,
      height: 0.04
    };

    return group;
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Returns exact total piece height in 3D world units
   */
  function getPieceHeight(type) {
    const t = normalizeType(type);
    return PIECE_HEIGHTS[t] || 1.0;
  }

  /**
   * Set global active theme ('classic', 'marble', 'neon', 'wood')
   */
  function setTheme(theme) {
    currentTheme = normalizeTheme(theme);
    return currentTheme;
  }

  /**
   * Get current active theme
   */
  function getTheme() {
    return currentTheme;
  }

  /**
   * Get list of all available themes
   */
  function getThemes() {
    return [...THEMES];
  }

  /**
   * Set display mode ('3d' or '2d')
   */
  function setMode(mode) {
    if (mode === '2d' || mode === '3d') {
      currentMode = mode;
    }
    return currentMode;
  }

  /**
   * Get current display mode ('3d' or '2d')
   */
  function getMode() {
    return currentMode;
  }

  /**
   * Create procedural chess piece Mesh/Group in current mode (or specified mode)
   * 
   * @param {string} type - 'p'|'r'|'n'|'b'|'q'|'k'
   * @param {string} color - 'w'|'b'
   * @param {string} [theme] - 'classic'|'marble'|'neon'|'wood' (optional)
   * @param {string} [mode] - '3d'|'2d' (optional, defaults to currentMode)
   * @returns {THREE.Group} - 3D or 2D Piece Group
   */
  function createPieceMesh(type, color, theme, mode) {
    const m = mode || currentMode;
    if (m === '2d') {
      return createPiece2DMesh(type, color, theme);
    }

    const THREE = getTHREE();
    const t = normalizeType(type);
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);

    const builder = GEOMETRY_BUILDERS[t] || GEOMETRY_BUILDERS.p;
    const pieceGroup = builder();

    // Assign material and shadow flags to all base meshes
    const material = getMaterial(c, th);
    const slotMaterial = (t === 'b') ? getSlotMaterial(material, th, c) : null;

    pieceGroup.traverse((node) => {
      if (node.isMesh) {
        if (node.userData.isFelt) {
          node.material = getFeltMaterial();
        } else if (node.userData.isSlot && slotMaterial) {
          node.material = slotMaterial;
        } else {
          node.material = material;
        }
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    // Add 3D Physical Accent Trim Torus Rings
    addInvertedHullOutline(pieceGroup, c, th, t);

    // Knight orientation: White faces -Z (towards Black rank 8), Black faces +Z (towards White rank 1)
    if (t === 'n' && c === 'b') {
      pieceGroup.rotation.y = Math.PI;
    }

    // Attach metadata
    pieceGroup.name = `piece_${c}_${t}`;
    pieceGroup.userData = {
      type: t,
      color: c,
      theme: th,
      mode: '3d',
      height: getPieceHeight(t)
    };

    return pieceGroup;
  }

  /**
   * Dynamically update an existing piece mesh/group to a new theme
   */
  function updatePieceTheme(pieceGroup, newTheme) {
    if (!pieceGroup || !pieceGroup.userData) return pieceGroup;
    const th = normalizeTheme(newTheme);
    const c = normalizeColor(pieceGroup.userData.color);
    const t = normalizeType(pieceGroup.userData.type);

    if (pieceGroup.userData.is2D || pieceGroup.userData.mode === '2d') {
      pieceGroup.traverse((node) => {
        if (node.isMesh && node.userData.isFace) {
          node.material.map = get2DPieceTexture(t, c, th);
          node.material.needsUpdate = true;
        }
      });
      pieceGroup.userData.theme = th;
      return pieceGroup;
    }

    // 3D piece theme update
    const material = getMaterial(c, th);
    const outlineMaterial = getOutlineMaterial(c, th);
    const slotMaterial = (t === 'b') ? getSlotMaterial(material, th, c) : null;

    pieceGroup.traverse((node) => {
      if (node.isMesh) {
        if (node.userData.isOutline) {
          node.material = outlineMaterial;
        } else if (node.userData.isFelt) {
          node.material = getFeltMaterial();
        } else if (node.userData.isSlot && slotMaterial) {
          node.material = slotMaterial;
        } else {
          node.material = material;
        }
      }
    });

    pieceGroup.userData.theme = th;
    return pieceGroup;
  }

  /**
   * Clear cached materials, textures, and shared geometries
   */
  function clearCache() {
    geometryCache.forEach((geom) => {
      if (geom && geom.dispose) geom.dispose();
    });
    geometryCache.clear();

    materialCache.forEach((mat) => {
      if (mat && mat.dispose) mat.dispose();
    });
    materialCache.clear();

    outlineMaterialCache.forEach((mat) => {
      if (mat && mat.dispose) mat.dispose();
    });
    outlineMaterialCache.clear();

    slotMaterialCache.forEach((mat) => {
      if (mat && mat.dispose) mat.dispose();
    });
    slotMaterialCache.clear();

    if (feltMaterialCache && feltMaterialCache.dispose) {
      feltMaterialCache.dispose();
      feltMaterialCache = null;
    }

    textureCache.forEach((tex) => {
      if (tex && tex.dispose) tex.dispose();
    });
    textureCache.clear();

    texture2DCache.forEach((tex) => {
      if (tex && tex.dispose) tex.dispose();
    });
    texture2DCache.clear();
  }

  return {
    createPieceMesh,
    createPiece2DMesh,
    getPieceHeight,
    setTheme,
    getTheme,
    getThemes,
    setMode,
    getMode,
    getMaterial,
    getOutlineMaterial,
    getProceduralPBRMaps,
    getProceduralTexture,
    updatePieceTheme,
    clearCache,
    geometryCache,
    PIECE_HEIGHTS,
    THEMES,
    MODES
  };
});
