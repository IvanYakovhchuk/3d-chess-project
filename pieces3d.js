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
  let currentTheme = 'classic';

  // Texture and material caches
  const textureCache = new Map();
  const materialCache = new Map();

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
   * Create procedural 3D chess piece Mesh/Group
   * 
   * @param {string} type - 'p'|'r'|'n'|'b'|'q'|'k'
   * @param {string} color - 'w'|'b'
   * @param {string} [theme] - 'classic'|'marble'|'neon'|'wood' (optional, defaults to active theme)
   * @returns {THREE.Group} - 3D Piece Group with castShadow/receiveShadow enabled
   */
  function createPieceMesh(type, color, theme) {
    const THREE = getTHREE();
    const t = normalizeType(type);
    const c = normalizeColor(color);
    const th = normalizeTheme(theme);

    const builder = GEOMETRY_BUILDERS[t] || GEOMETRY_BUILDERS.p;
    const pieceGroup = builder();

    // Assign material and shadow flags to all meshes
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

    if (feltMaterialCache && feltMaterialCache.dispose) {
      feltMaterialCache.dispose();
      feltMaterialCache = null;
    }

    textureCache.forEach((tex) => {
      if (tex.dispose) tex.dispose();
    });
    textureCache.clear();
  }

  return {
    createPieceMesh,
    getPieceHeight,
    setTheme,
    getTheme,
    getThemes,
    getMaterial,
    updatePieceTheme,
    clearCache,
    PIECE_HEIGHTS,
    THEMES
  };
});
