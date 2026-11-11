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

  // Texture and material caches
  const textureCache = new Map();
  const texture2DCache = new Map();
  const materialCache = new Map();
  const outlineMaterialCache = new Map();

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
   * Generate procedural canvas textures for marble and wood themes
   */
  function getProceduralTexture(theme, color) {
    if (typeof document === 'undefined') return null;
    const cacheKey = `${theme}_${color}`;
    if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

    try {
      const THREE = getTHREE();
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      if (theme === 'wood') {
        const isWhite = color === 'w';
        const base = isWhite ? '#dec59b' : '#3d2516';
        const ring1 = isWhite ? '#ceae80' : '#29170c';
        const ring2 = isWhite ? '#eccfac' : '#4e301d';

        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 512, 512);

        // Subtle longitudinal grain & concentric growth rings
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 70; i++) {
          const y = (i / 70) * 512;
          ctx.strokeStyle = (i % 2 === 0 ? ring1 : ring2);
          ctx.globalAlpha = 0.25 + (Math.sin(i * 0.4) * 0.15);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(170, y + Math.sin(i) * 12, 340, y - Math.cos(i) * 12, 512, y);
          ctx.stroke();
        }

        // Fine wood fibers
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = isWhite ? '#ffffff' : '#000000';
        for (let x = 0; x < 512; x += 3) {
          if (Math.random() > 0.4) {
            ctx.fillRect(x, 0, 1, 512);
          }
        }
      } else if (theme === 'marble') {
        const isWhite = color === 'w';
        ctx.fillStyle = isWhite ? '#f7f8fa' : '#141518';
        ctx.fillRect(0, 0, 512, 512);

        // Soft organic marble veining
        const veinColor1 = isWhite ? 'rgba(180, 185, 195, 0.35)' : 'rgba(235, 235, 240, 0.22)';
        const veinColor2 = isWhite ? 'rgba(140, 145, 155, 0.25)' : 'rgba(212, 175, 55, 0.25)'; // faint gold in black marble

        ctx.lineWidth = 2.5;
        for (let v = 0; v < 8; v++) {
          ctx.strokeStyle = (v % 2 === 0) ? veinColor1 : veinColor2;
          ctx.beginPath();
          let px = Math.random() * 512;
          let py = 0;
          ctx.moveTo(px, py);
          while (py < 512) {
            py += 15 + Math.random() * 25;
            px += (Math.random() - 0.48) * 35;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }

        // Soft cloud noise overlay
        const imgData = ctx.getImageData(0, 0, 512, 512);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * (isWhite ? 10 : 6);
          data[i] = Math.min(255, Math.max(0, data[i] + noise));
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.5, 2.5);
      textureCache.set(cacheKey, texture);
      return texture;
    } catch (e) {
      return null;
    }
  }

  /**
   * Material Factory: Builds high-end MeshPhysicalMaterial / MeshStandardMaterial for White & Black
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

    switch (th) {
      case 'wood': {
        const tex = getProceduralTexture('wood', c);
        material = new MaterialClass({
          color: isWhite ? 0xe2c69e : 0x3b2315,
          map: tex || null,
          roughness: 0.38,
          metalness: 0.02,
          clearcoat: 0.25,
          clearcoatRoughness: 0.20
        });
        break;
      }

      case 'marble': {
        const tex = getProceduralTexture('marble', c);
        material = new MaterialClass({
          color: isWhite ? 0xfbfaf5 : 0x14161b,
          map: tex || null,
          roughness: isWhite ? 0.35 : 0.32,
          metalness: isWhite ? 0.02 : 0.08,
          clearcoat: isWhite ? 0.15 : 0.20,
          clearcoatRoughness: 0.15
        });
        break;
      }

      case 'neon': {
        // Futuristic Cyberpunk / Tron theme: high emissive glow, high metalness
        if (isWhite) {
          material = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x009ec3,
            emissiveIntensity: 0.55,
            roughness: 0.18,
            metalness: 0.82
          });
        } else {
          material = new THREE.MeshStandardMaterial({
            color: 0xff007f,
            emissive: 0xa8004f,
            emissiveIntensity: 0.55,
            roughness: 0.18,
            metalness: 0.82
          });
        }
        break;
      }

      case 'classic':
      default: {
        // High-contrast Tournament Staunton: Crisp Ivory White vs Deep Obsidian Black
        if (isWhite) {
          material = new MaterialClass({
            color: 0xfbfaf5,
            roughness: 0.35,
            metalness: 0.02,
            clearcoat: 0.15,
            clearcoatRoughness: 0.18
          });
        } else {
          material = new MaterialClass({
            color: 0x14161b,
            roughness: 0.32,
            metalness: 0.08,
            clearcoat: 0.20,
            clearcoatRoughness: 0.18
          });
        }
        break;
      }
    }

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
    return feltMaterialCache;
  }

  function createFeltPad(radius) {
    const THREE = getTHREE();
    const geom = new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, 0.005, 32);
    const mesh = new THREE.Mesh(geom);
    mesh.position.y = 0.0025;
    mesh.userData.isFelt = true;
    return mesh;
  }

  /**
   * Outline Material Factory: Inverted-Hull Silhouette Outline (THREE.BackSide)
   * White pieces get a crisp dark obsidian outline; Black pieces get a bright silver-white outline.
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
      // White pieces get dark obsidian contour (#111318); Black pieces get bright silver/white contour (#e2e8f0)
      outlineColor = (c === 'w') ? 0x111318 : 0xe2e8f0;
    }

    const MaterialClass = THREE.MeshBasicMaterial || THREE.MeshStandardMaterial;
    const mat = new MaterialClass({
      color: outlineColor,
      side: THREE.BackSide,
      depthWrite: true,
      depthTest: true
    });

    outlineMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Helper: Add Inverted-Hull Silhouette Outline Mesh to 3D Piece Group
   */
  function addInvertedHullOutline(pieceGroup, color, theme) {
    const THREE = getTHREE();
    const outlineMat = getOutlineMaterial(color, theme);
    const baseMeshes = [];

    pieceGroup.traverse((node) => {
      if (node.isMesh && !node.userData.isFelt && !node.userData.isSlot && !node.userData.isOutline) {
        baseMeshes.push(node);
      }
    });

    for (const node of baseMeshes) {
      const outlineMesh = new THREE.Mesh(node.geometry, outlineMat);
      outlineMesh.position.copy(node.position);
      outlineMesh.rotation.copy(node.rotation);
      outlineMesh.scale.copy(node.scale).multiplyScalar(1.036);
      outlineMesh.userData.isOutline = true;
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      pieceGroup.add(outlineMesh);
    }
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

    const stemGeom = new THREE.LatheGeometry(pts, 32);
    stemGeom.computeVertexNormals();
    group.add(new THREE.Mesh(stemGeom));

    // Spherical head
    const headGeom = new THREE.SphereGeometry(0.165, 32, 24);
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

    const towerGeom = new THREE.LatheGeometry(pts, 32);
    towerGeom.computeVertexNormals();
    group.add(new THREE.Mesh(towerGeom));

    // 4 Castle Crenellations (Merlons) on top of the rim (y=1.02 to y=1.20)
    const merlonGeom = new THREE.BoxGeometry(0.135, 0.18, 0.08);
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
    const pts = createStauntonBasePoints(0.30, 0.28);
    pts.push(new THREE.Vector2(0.21, 0.29));
    pts.push(new THREE.Vector2(0, 0.29));

    const baseGeom = new THREE.LatheGeometry(pts, 32);
    baseGeom.computeVertexNormals();
    group.add(new THREE.Mesh(baseGeom));

    // Horse Head & Neck: 2D side profile extruded with bevel
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

    const headExtrudeGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Transform so shape (z, y) maps to 3D: X = extrude depth (centered), Y = Y, Z = shape X (facing -Z)
    headExtrudeGeom.applyMatrix4(new THREE.Matrix4().set(
      0, 0, 1, 0,
      0, 1, 0, 0,
      1, 0, 0, 0,
      0, 0, 0, 1
    ));
    headExtrudeGeom.translate(-(depth + 0.04) / 2, 0, 0);
    headExtrudeGeom.computeVertexNormals();
    group.add(new THREE.Mesh(headExtrudeGeom));

    // Perked Pointed Ears (Facing forward & slightly flared)
    const earGeom = new THREE.ConeGeometry(0.034, 0.14, 6);
    earGeom.computeVertexNormals();

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
    const maneGeom = new THREE.BoxGeometry(0.08, 0.08, 0.06);

    for (const m of manePositions) {
      const maneMesh = new THREE.Mesh(maneGeom);
      maneMesh.position.set(0, m.y, m.z);
      maneMesh.rotation.x = -0.35;
      group.add(maneMesh);
    }

    // Sculpted Eyes
    const eyeGeom = new THREE.SphereGeometry(0.024, 12, 12);
    const leftEye = new THREE.Mesh(eyeGeom);
    leftEye.position.set(-0.11, 1.02, -0.13);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom);
    rightEye.position.set(0.11, 1.02, -0.13);
    group.add(rightEye);

    // Sculpted Nostrils
    const nostrilGeom = new THREE.SphereGeometry(0.016, 8, 8);
    const leftNostril = new THREE.Mesh(nostrilGeom);
    leftNostril.position.set(-0.045, 0.82, -0.26);
    group.add(leftNostril);

    const rightNostril = new THREE.Mesh(nostrilGeom);
    rightNostril.position.set(0.045, 0.82, -0.26);
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

    const mitreGeom = new THREE.LatheGeometry(pts, 32);
    mitreGeom.computeVertexNormals();
    group.add(new THREE.Mesh(mitreGeom));

    // Iconic Diagonal Slot (angled Staunton cleft)
    // Modeled as an inset dark bevel cut into the upper mitre
    const slotGeom = new THREE.BoxGeometry(0.035, 0.16, 0.28);
    const slotMesh = new THREE.Mesh(slotGeom);
    slotMesh.position.set(0.11, 1.25, 0);
    slotMesh.rotation.z = Math.PI / 4; // 45 degree diagonal slice
    // Mark slot so theme updates can keep it subtly recessed
    slotMesh.userData.isSlot = true;
    group.add(slotMesh);

    // Apex Finial Orb atop the mitre
    const orbGeom = new THREE.SphereGeometry(0.048, 20, 20);
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

    const bodyGeom = new THREE.LatheGeometry(pts, 32);
    bodyGeom.computeVertexNormals();
    group.add(new THREE.Mesh(bodyGeom));

    // 8 Coronet Rim Pearls with supporting petal tips
    const pearlRadius = 0.290;
    const pearlGeom = new THREE.SphereGeometry(0.032, 14, 14);
    const petalGeom = new THREE.ConeGeometry(0.030, 0.06, 4);

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
    const apexGeom = new THREE.SphereGeometry(0.062, 20, 20);
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

    const kingBodyGeom = new THREE.LatheGeometry(pts, 32);
    kingBodyGeom.computeVertexNormals();
    group.add(new THREE.Mesh(kingBodyGeom));

    // Turned Pedestal Orb for Cross
    const orbGeom = new THREE.SphereGeometry(0.045, 16, 16);
    const orbMesh = new THREE.Mesh(orbGeom);
    orbMesh.position.y = 1.76;
    group.add(orbMesh);

    // 3D Cross Pattée Finial
    // Vertical cross beam
    const vertBeamGeom = new THREE.BoxGeometry(0.065, 0.23, 0.045);
    const vertBeam = new THREE.Mesh(vertBeamGeom);
    vertBeam.position.set(0, 1.88, 0);
    group.add(vertBeam);

    // Horizontal cross beam
    const horizBeamGeom = new THREE.BoxGeometry(0.18, 0.065, 0.045);
    const horizBeam = new THREE.Mesh(horizBeamGeom);
    horizBeam.position.set(0, 1.90, 0);
    group.add(horizBeam);

    // Cross Pattée flared end-caps
    const topCapGeom = new THREE.BoxGeometry(0.09, 0.028, 0.052);
    const topCap = new THREE.Mesh(topCapGeom);
    topCap.position.set(0, 1.995, 0);
    group.add(topCap);

    const sideCapGeom = new THREE.BoxGeometry(0.028, 0.09, 0.052);
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
    const THREE = getTHREE();
    if (theme === 'neon') {
      return new THREE.MeshStandardMaterial({
        color: 0x111116,
        roughness: 0.8,
        metalness: 0.1
      });
    }
    return new THREE.MeshStandardMaterial({
      color: color === 'w' ? 0x9e9788 : 0x111114,
      roughness: 0.8,
      metalness: 0.05
    });
  }

  // =========================================================================
  // 2D PROCEDURAL VECTOR CHESS PIECES (Canvas2D paths -> CanvasTexture)
  // =========================================================================

  function drawPieceVectorSilhouette(ctx, type, cx, cy) {
    ctx.beginPath();
    switch (type) {
      case 'p': {
        // Pawn: base pedestal, tapered stem, collar, spherical head
        ctx.moveTo(cx - 85, cy + 135);
        ctx.lineTo(cx + 85, cy + 135);
        ctx.quadraticCurveTo(cx + 85, cy + 112, cx + 60, cy + 106);
        ctx.quadraticCurveTo(cx + 34, cy + 55, cx + 22, cy + 12);
        ctx.lineTo(cx + 42, cy + 8);
        ctx.quadraticCurveTo(cx + 42, cy - 8, cx + 18, cy - 12);
        ctx.arc(cx, cy - 65, 54, 0.45, Math.PI - 0.45, true);
        ctx.quadraticCurveTo(cx - 42, cy - 8, cx - 42, cy + 8);
        ctx.lineTo(cx - 22, cy + 12);
        ctx.quadraticCurveTo(cx - 34, cy + 55, cx - 60, cy + 106);
        ctx.quadraticCurveTo(cx - 85, cy + 112, cx - 85, cy + 135);
        ctx.closePath();
        break;
      }

      case 'r': {
        // Rook: base, column, flared parapet with 3 merlons and 2 crenels
        ctx.moveTo(cx - 90, cy + 135);
        ctx.lineTo(cx + 90, cy + 135);
        ctx.quadraticCurveTo(cx + 90, cy + 112, cx + 66, cy + 106);
        ctx.lineTo(cx + 62, cy - 30);
        ctx.lineTo(cx + 92, cy - 55);
        // Merlon 3 (right)
        ctx.lineTo(cx + 92, cy - 120);
        ctx.lineTo(cx + 54, cy - 120);
        ctx.lineTo(cx + 54, cy - 80);
        // Crenel 2
        ctx.lineTo(cx + 24, cy - 80);
        // Merlon 2 (center)
        ctx.lineTo(cx + 24, cy - 120);
        ctx.lineTo(cx - 24, cy - 120);
        ctx.lineTo(cx - 24, cy - 80);
        // Crenel 1
        ctx.lineTo(cx - 54, cy - 80);
        // Merlon 1 (left)
        ctx.lineTo(cx - 54, cy - 120);
        ctx.lineTo(cx - 92, cy - 120);
        ctx.lineTo(cx - 92, cy - 55);
        ctx.lineTo(cx - 62, cy - 30);
        ctx.lineTo(cx - 66, cy + 106);
        ctx.quadraticCurveTo(cx - 90, cy + 112, cx - 90, cy + 135);
        ctx.closePath();
        break;
      }

      case 'n': {
        // Knight: arched neck, ears, brow, snout, jaw, chest
        ctx.moveTo(cx - 80, cy + 135);
        ctx.lineTo(cx + 80, cy + 135);
        ctx.quadraticCurveTo(cx + 80, cy + 112, cx + 60, cy + 106);
        ctx.quadraticCurveTo(cx + 85, cy + 30, cx + 75, cy - 30);
        ctx.quadraticCurveTo(cx + 58, cy - 85, cx + 16, cy - 118);
        // Right ear
        ctx.lineTo(cx + 26, cy - 148);
        ctx.lineTo(cx + 6, cy - 128);
        // Left ear
        ctx.lineTo(cx - 4, cy - 148);
        ctx.lineTo(cx - 18, cy - 118);
        // Forehead & muzzle
        ctx.quadraticCurveTo(cx - 55, cy - 88, cx - 80, cy - 45);
        ctx.lineTo(cx - 106, cy - 15);
        // Snout & mouth
        ctx.quadraticCurveTo(cx - 100, cy + 10, cx - 80, cy + 10);
        ctx.lineTo(cx - 65, cy + 15);
        ctx.lineTo(cx - 60, cy + 5);
        // Under-jaw & throat
        ctx.quadraticCurveTo(cx - 35, cy + 30, cx - 24, cy + 55);
        // Chest swell
        ctx.quadraticCurveTo(cx - 55, cy + 85, cx - 60, cy + 106);
        ctx.quadraticCurveTo(cx - 80, cy + 112, cx - 80, cy + 135);
        ctx.closePath();
        break;
      }

      case 'b': {
        // Bishop: base, stem, double collar, teardrop mitre
        ctx.moveTo(cx - 85, cy + 135);
        ctx.lineTo(cx + 85, cy + 135);
        ctx.quadraticCurveTo(cx + 85, cy + 112, cx + 60, cy + 106);
        ctx.quadraticCurveTo(cx + 34, cy + 65, cx + 24, cy + 40);
        ctx.lineTo(cx + 44, cy + 35);
        ctx.quadraticCurveTo(cx + 44, cy + 18, cx + 18, cy + 14);
        // Mitre bulb
        ctx.quadraticCurveTo(cx + 68, cy - 25, cx + 54, cy - 75);
        ctx.quadraticCurveTo(cx + 32, cy - 120, cx, cy - 135);
        ctx.quadraticCurveTo(cx - 32, cy - 120, cx - 54, cy - 75);
        ctx.quadraticCurveTo(cx - 68, cy - 25, cx - 18, cy + 14);
        ctx.lineTo(cx - 44, cy + 18);
        ctx.quadraticCurveTo(cx - 44, cy + 35, cx - 24, cy + 40);
        ctx.quadraticCurveTo(cx - 34, cy + 65, cx - 60, cy + 106);
        ctx.quadraticCurveTo(cx - 85, cy + 112, cx - 85, cy + 135);
        ctx.closePath();
        break;
      }

      case 'q': {
        // Queen: base, stem, collar, 5-point coronet crown
        ctx.moveTo(cx - 95, cy + 135);
        ctx.lineTo(cx + 95, cy + 135);
        ctx.quadraticCurveTo(cx + 95, cy + 112, cx + 70, cy + 106);
        ctx.quadraticCurveTo(cx + 40, cy + 65, cx + 28, cy + 40);
        ctx.lineTo(cx + 52, cy + 35);
        ctx.lineTo(cx + 42, cy + 20);
        // 5 Coronet spikes
        ctx.lineTo(cx + 84, cy - 40);
        ctx.lineTo(cx + 94, cy - 80);
        ctx.lineTo(cx + 64, cy - 50);
        ctx.lineTo(cx + 48, cy - 105);
        ctx.lineTo(cx + 24, cy - 55);
        ctx.lineTo(cx, cy - 120); // center
        ctx.lineTo(cx - 24, cy - 55);
        ctx.lineTo(cx - 48, cy - 105);
        ctx.lineTo(cx - 64, cy - 50);
        ctx.lineTo(cx - 94, cy - 80);
        ctx.lineTo(cx - 84, cy - 40);
        ctx.lineTo(cx - 42, cy + 20);
        ctx.lineTo(cx - 52, cy + 35);
        ctx.lineTo(cx - 28, cy + 40);
        ctx.quadraticCurveTo(cx - 40, cy + 65, cx - 70, cy + 106);
        ctx.quadraticCurveTo(cx - 95, cy + 112, cx - 95, cy + 135);
        ctx.closePath();
        break;
      }

      case 'k': {
        // King: base, column, gallery, crown dome & Cross Pattée
        ctx.moveTo(cx - 100, cy + 135);
        ctx.lineTo(cx + 100, cy + 135);
        ctx.quadraticCurveTo(cx + 100, cy + 112, cx + 75, cy + 106);
        ctx.quadraticCurveTo(cx + 45, cy + 65, cx + 34, cy + 40);
        ctx.lineTo(cx + 58, cy + 35);
        ctx.lineTo(cx + 48, cy + 20);
        // Cupola dome
        ctx.quadraticCurveTo(cx + 88, cy - 10, cx + 78, cy - 65);
        ctx.quadraticCurveTo(cx + 48, cy - 95, cx + 18, cy - 100);
        // Cross finial
        ctx.lineTo(cx + 34, cy - 100);
        ctx.lineTo(cx + 34, cy - 122);
        ctx.lineTo(cx + 14, cy - 122);
        ctx.lineTo(cx + 14, cy - 154);
        ctx.lineTo(cx - 14, cy - 154);
        ctx.lineTo(cx - 14, cy - 122);
        ctx.lineTo(cx - 34, cy - 122);
        ctx.lineTo(cx - 34, cy - 100);
        ctx.lineTo(cx - 18, cy - 100);
        // Left cupola dome
        ctx.quadraticCurveTo(cx - 48, cy - 95, cx - 78, cy - 65);
        ctx.quadraticCurveTo(cx - 88, cy - 10, cx - 48, cy + 20);
        ctx.lineTo(cx - 58, cy + 35);
        ctx.lineTo(cx - 34, cy + 40);
        ctx.quadraticCurveTo(cx - 45, cy + 65, cx - 75, cy + 106);
        ctx.quadraticCurveTo(cx - 100, cy + 112, cx - 100, cy + 135);
        ctx.closePath();
        break;
      }
    }
  }

  function drawPieceInnerDetails(ctx, type, cx, cy) {
    ctx.beginPath();
    switch (type) {
      case 'p': {
        // Base ring line & collar line
        ctx.moveTo(cx - 55, cy + 118);
        ctx.lineTo(cx + 55, cy + 118);
        ctx.moveTo(cx - 32, cy + 8);
        ctx.lineTo(cx + 32, cy + 8);
        ctx.stroke();
        break;
      }

      case 'r': {
        // Cornice shelf line & base ring
        ctx.moveTo(cx - 58, cy + 118);
        ctx.lineTo(cx + 58, cy + 118);
        ctx.moveTo(cx - 65, cy - 48);
        ctx.lineTo(cx + 65, cy - 48);
        // Arrow slit window in tower center
        ctx.moveTo(cx, cy - 15);
        ctx.lineTo(cx, cy + 45);
        ctx.stroke();
        break;
      }

      case 'n': {
        // Eye
        ctx.beginPath();
        ctx.arc(cx - 42, cy - 52, 6, 0, Math.PI * 2);
        ctx.fill();
        // Nostril
        ctx.beginPath();
        ctx.arc(cx - 86, cy - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        // Mane ridge curves
        ctx.beginPath();
        ctx.moveTo(cx + 35, cy - 80);
        ctx.quadraticCurveTo(cx + 15, cy - 60, cx + 30, cy - 35);
        ctx.moveTo(cx + 50, cy - 45);
        ctx.quadraticCurveTo(cx + 25, cy - 20, cx + 45, cy + 5);
        ctx.moveTo(cx + 55, cy - 5);
        ctx.quadraticCurveTo(cx + 30, cy + 20, cx + 45, cy + 50);
        ctx.stroke();
        break;
      }

      case 'b': {
        // Base line & collar line
        ctx.moveTo(cx - 55, cy + 118);
        ctx.lineTo(cx + 55, cy + 118);
        ctx.moveTo(cx - 35, cy + 28);
        ctx.lineTo(cx + 35, cy + 28);
        // Iconic diagonal slash slot
        ctx.moveTo(cx + 36, cy - 90);
        ctx.lineTo(cx - 12, cy - 42);
        ctx.stroke();
        // Finial orb atop mitre
        ctx.beginPath();
        ctx.arc(cx, cy - 148, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'q': {
        // Base line & waist line
        ctx.moveTo(cx - 65, cy + 118);
        ctx.lineTo(cx + 65, cy + 118);
        ctx.moveTo(cx - 40, cy + 28);
        ctx.lineTo(cx + 40, cy + 28);
        ctx.stroke();
        // Pearls on crown spikes
        const pearlPts = [
          [cx, cy - 132],
          [cx - 48, cy - 117], [cx + 48, cy - 117],
          [cx - 94, cy - 92],  [cx + 94, cy - 92]
        ];
        for (const [px, py] of pearlPts) {
          ctx.beginPath();
          ctx.arc(px, py, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }

      case 'k': {
        // Base line & collar line
        ctx.moveTo(cx - 70, cy + 118);
        ctx.lineTo(cx + 70, cy + 118);
        ctx.moveTo(cx - 45, cy + 28);
        ctx.lineTo(cx + 45, cy + 28);
        // Cupola headband
        ctx.moveTo(cx - 55, cy - 25);
        ctx.lineTo(cx + 55, cy - 25);
        ctx.stroke();
        break;
      }
    }
  }

  /**
   * Procedural Canvas Texture Factory for 2D Piece Vector Badges
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
      const cy = 256;

      ctx.clearRect(0, 0, 512, 512);

      let badgeBg, badgeBorder, pieceFill, pieceStroke, detailStroke;
      if (th === 'neon') {
        badgeBg = isWhite ? '#002533' : '#33001a';
        badgeBorder = isWhite ? '#00ffff' : '#ff007f';
        pieceFill = isWhite ? '#00ffff' : '#ff007f';
        pieceStroke = '#ffffff';
        detailStroke = isWhite ? '#003344' : '#440022';
      } else if (th === 'wood') {
        badgeBg = isWhite ? '#ecd8b8' : '#2d180c';
        badgeBorder = isWhite ? '#5c3a21' : '#cca072';
        pieceFill = isWhite ? '#fcf6ec' : '#1a0d06';
        pieceStroke = isWhite ? '#3d2516' : '#ecd8b8';
        detailStroke = isWhite ? '#8c5932' : '#dcb487';
      } else {
        // 'classic' & 'marble'
        badgeBg = isWhite ? '#f8fafc' : '#14171d';
        badgeBorder = isWhite ? '#1e293b' : '#cbd5e1';
        pieceFill = isWhite ? '#ffffff' : '#111827';
        pieceStroke = isWhite ? '#0f172a' : '#f8fafc';
        detailStroke = isWhite ? '#334155' : '#94a3b8';
      }

      // Outer circular badge disk
      ctx.beginPath();
      ctx.arc(cx, cy, 240, 0, Math.PI * 2);
      ctx.fillStyle = badgeBg;
      ctx.fill();

      // Outer badge rim border
      ctx.lineWidth = 14;
      ctx.strokeStyle = badgeBorder;
      ctx.stroke();

      // Inner decorative ring
      ctx.beginPath();
      ctx.arc(cx, cy, 215, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = badgeBorder;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Draw custom vector piece silhouette
      ctx.fillStyle = pieceFill;
      ctx.strokeStyle = pieceStroke;
      ctx.lineWidth = 14;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      drawPieceVectorSilhouette(ctx, t, cx, cy);
      ctx.fill();
      ctx.stroke();

      // Inner detail lines
      ctx.lineWidth = 6;
      ctx.strokeStyle = detailStroke;
      drawPieceInnerDetails(ctx, t, cx, cy);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      texture2DCache.set(key, texture);
      return texture;
    } catch (e) {
      return null;
    }
  }

  /**
   * Procedural 2D Chess Piece Mesh Factory: Flat Token with Vector Badge on Three.js Board
   */
  function createPiece2DMesh(type, color, theme) {
    const THREE = getTHREE();
    const t = normalizeType(type);
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);
    const group = new THREE.Group();

    const isWhite = c === 'w';

    // 1. Dark tournament baize felt base pad at y=0.002
    group.add(createFeltPad(0.38));

    // 2. Token puck cylinder body (y from 0.004 to 0.024)
    const puckGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.020, 32);
    let puckColor;
    if (th === 'neon') {
      puckColor = isWhite ? 0x002b3d : 0x3d001f;
    } else if (th === 'wood') {
      puckColor = isWhite ? 0xecd8b8 : 0x2d180c;
    } else {
      puckColor = isWhite ? 0xf8fafc : 0x14171d;
    }
    const puckMat = new THREE.MeshStandardMaterial({
      color: puckColor,
      roughness: 0.40,
      metalness: 0.05
    });
    const puckMesh = new THREE.Mesh(puckGeom, puckMat);
    puckMesh.position.y = 0.014;
    puckMesh.castShadow = true;
    puckMesh.receiveShadow = true;
    puckMesh.userData.isPuck = true;
    group.add(puckMesh);

    // 3. Contrasting outer rim ring at y=0.0245
    const ringGeom = new THREE.RingGeometry(0.34, 0.38, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: (th === 'neon') ? (isWhite ? 0x00ffff : 0xff007f) : (isWhite ? 0x0f172a : 0xe2e8f0),
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.0245;
    ringMesh.userData.isRing = true;
    group.add(ringMesh);

    // 4. Vector Piece Silhouette Face Texture on CircleGeometry at y=0.025
    const texture = get2DPieceTexture(t, c, th);
    const faceGeom = new THREE.CircleGeometry(0.34, 32);
    const faceMat = new THREE.MeshBasicMaterial({
      map: texture || null,
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const faceMesh = new THREE.Mesh(faceGeom, faceMat);
    faceMesh.rotation.x = -Math.PI / 2;
    faceMesh.position.y = 0.025;
    faceMesh.userData.isFace = true;
    group.add(faceMesh);

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

    // Add Inverted-Hull Silhouette Outline around all 3D piece meshes
    addInvertedHullOutline(pieceGroup, c, th);

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
      const isWhite = c === 'w';
      pieceGroup.traverse((node) => {
        if (node.isMesh) {
          if (node.userData.isPuck) {
            let puckColor;
            if (th === 'neon') puckColor = isWhite ? 0x002b3d : 0x3d001f;
            else if (th === 'wood') puckColor = isWhite ? 0xecd8b8 : 0x2d180c;
            else puckColor = isWhite ? 0xf8fafc : 0x14171d;
            node.material.color.set(puckColor);
          } else if (node.userData.isRing) {
            const ringCol = (th === 'neon') ? (isWhite ? 0x00ffff : 0xff007f) : (isWhite ? 0x0f172a : 0xe2e8f0);
            node.material.color.set(ringCol);
          } else if (node.userData.isFace) {
            node.material.map = get2DPieceTexture(t, c, th);
            node.material.needsUpdate = true;
          }
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
   * Clear cached materials and textures
   */
  function clearCache() {
    materialCache.forEach((mat) => {
      if (mat.dispose) mat.dispose();
    });
    materialCache.clear();

    outlineMaterialCache.forEach((mat) => {
      if (mat.dispose) mat.dispose();
    });
    outlineMaterialCache.clear();

    if (feltMaterialCache && feltMaterialCache.dispose) {
      feltMaterialCache.dispose();
      feltMaterialCache = null;
    }

    textureCache.forEach((tex) => {
      if (tex.dispose) tex.dispose();
    });
    textureCache.clear();

    texture2DCache.forEach((tex) => {
      if (tex.dispose) tex.dispose();
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
    updatePieceTheme,
    clearCache,
    PIECE_HEIGHTS,
    THEMES,
    MODES
  };
});
