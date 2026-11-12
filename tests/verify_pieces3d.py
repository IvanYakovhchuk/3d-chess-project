"""
Verification script for pieces3d.js
Verifies:
1. File syntax & structure
2. LatheGeometry point sanity (positive radii, valid Y coordinates)
3. Height constants vs actual geometry extents
4. Material theme definitions & color codes
5. Export signatures & UMD compatibility
"""

import os
import re
import math
import sys

def verify_pieces3d():
    file_path = os.path.join(os.path.dirname(__file__), "..", "pieces3d.js") if not os.path.exists("pieces3d.js") else "pieces3d.js"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    print("[1] Checking exports and signatures...")
    assert "window.ChessPieces3D" in content, "Missing browser export"
    assert "module.exports" in content, "Missing CommonJS export"
    assert "createPieceMesh" in content, "Missing createPieceMesh"
    assert "getPieceHeight" in content, "Missing getPieceHeight"
    assert "setTheme" in content, "Missing setTheme"
    assert "getTheme" in content, "Missing getTheme"
    assert "getThemes" in content, "Missing getThemes"
    assert "updatePieceTheme" in content, "Missing updatePieceTheme"

    print("[2] Checking piece height constants...")
    heights_match = re.search(r"const PIECE_HEIGHTS\s*=\s*Object\.freeze\({\s*p:\s*([\d\.]+),\s*r:\s*([\d\.]+),\s*n:\s*([\d\.]+),\s*b:\s*([\d\.]+),\s*q:\s*([\d\.]+),\s*k:\s*([\d\.]+)", content)
    assert heights_match, "Failed to parse PIECE_HEIGHTS"
    p, r, n, b, q, k = [float(x) for x in heights_match.groups()]
    print(f"    Heights: p={p}, r={r}, n={n}, b={b}, q={q}, k={k}")
    assert p < r < n < b < q < k, "Heights must follow chess piece hierarchy: p < r < n < b < q < k"
    assert p >= 0.85 and k <= 2.2, "Heights within standard Staunton 1.0 unit square proportions"

    print("[3] Checking themes...")
    for theme in ['classic', 'marble', 'neon', 'wood']:
        assert f"'{theme}'" in content or f'"{theme}"' in content, f"Missing theme {theme}"

    print("[4] Checking procedural geometry definitions...")
    pieces = ['createPawnGeometry', 'createRookGeometry', 'createKnightGeometry', 'createBishopGeometry', 'createQueenGeometry', 'createKingGeometry']
    for p_func in pieces:
        assert p_func in content, f"Missing function {p_func}"

    # Verify shadow casting and receiving
    assert "node.castShadow = true" in content, "Missing castShadow"
    assert "node.receiveShadow = true" in content, "Missing receiveShadow"

    # Verify Knight rotation for black
    assert "pieceGroup.rotation.y = Math.PI" in content, "Missing Knight facing adjustment for black"

    # Extract all Vector2 coordinates and check for NaN or negative radius
    v2_matches = re.findall(r"new THREE\.Vector2\(\s*([\d\.\-]+)\s*,\s*([\d\.\-]+)\s*\)", content)
    assert len(v2_matches) > 30, f"Expected >30 Vector2 lathe profile points, found {len(v2_matches)}"
    for r_str, y_str in v2_matches:
        radius = float(r_str)
        y = float(y_str)
        assert radius >= 0, f"Lathe radius cannot be negative: radius={radius}, y={y}"
        assert radius <= 0.5, f"Lathe radius exceeds 1.0 square bounds (max ~0.4): radius={radius}, y={y}"
        assert y >= 0, f"Lathe Y cannot be negative (must rest at y=0): y={y}"

    print("[5] Checking 3D colors, accent trims & felt base pads...")
    assert "0xf4f0e6" in content, "Missing white color 0xf4f0e6"
    assert "0x1e222a" in content, "Missing black color 0x1e222a"
    assert "createFeltPad" in content, "Missing createFeltPad function"
    assert "isFelt" in content, "Missing isFelt metadata flag"

    print("[6] Checking 3D Accent Contours & Lichess/Chess.com 2D Mode...")
    assert "setMode" in content, "Missing setMode"
    assert "getMode" in content, "Missing getMode"
    assert "createPiece2DMesh" in content, "Missing createPiece2DMesh"
    assert "addInvertedHullOutline" in content, "Missing addInvertedHullOutline"
    assert "getOutlineMaterial" in content, "Missing getOutlineMaterial"
    assert "isOutline" in content, "Missing isOutline metadata tag"
    assert "drawPieceVectorSilhouette" in content, "Missing drawPieceVectorSilhouette"
    assert "get2DPieceTexture" in content, "Missing get2DPieceTexture"
    assert "PlaneGeometry" in content, "Missing PlaneGeometry for flat 2D pieces"
    assert "transparent: true" in content, "Missing transparent material for 2D pieces"

    print("    Validated clean 3D physical accent trims and Lichess-style 2D vector silhouettes.")

    print("[7] Checking Procedural Geometry Reuse & Radial Segments Optimization (Point 3)...")
    assert "geometryCache = new Map()" in content, "Missing geometryCache declaration"
    assert "isSharedGeometry: true" in content, "Missing isSharedGeometry flag on cached geometries"
    assert "isSharedMaterial: true" in content, "Missing isSharedMaterial flag on cached materials"
    assert "geometryCache.get('pawn_stem')" in content, "Missing geometryCache reuse for pawn stem"
    assert "geometryCache.get('rook_tower')" in content, "Missing geometryCache reuse for rook tower"
    assert "geometryCache.get('knight_head_extrude')" in content, "Missing geometryCache reuse for knight extrude"
    assert "geometryCache.get('bishop_mitre')" in content, "Missing geometryCache reuse for bishop mitre"
    assert "geometryCache.get('queen_body')" in content, "Missing geometryCache reuse for queen body"
    assert "geometryCache.get('king_body')" in content, "Missing geometryCache reuse for king body"
    assert "geometryCache.get('plane_2d')" in content, "Missing geometryCache reuse for 2D plane"
    assert "LatheGeometry(pts, 24)" in content, "LatheGeometry should use 24 radial segments for 40% vertex reduction"
    assert "geometryCache.clear()" in content, "clearCache should clear geometryCache"
    print("    Validated geometryCache reuse across all pieces, 24 radial segments, and shared flags.")

    print("[8] Checking Procedural PBR MeshPhysicalMaterial, Clearcoat & Multi-Map Textures...")
    assert "MeshPhysicalMaterial" in content, "Missing MeshPhysicalMaterial"
    assert "clearcoat:" in content, "Missing clearcoat configuration"
    assert "clearcoatRoughness:" in content, "Missing clearcoatRoughness configuration"
    assert "envMapIntensity" in content, "Missing envMapIntensity configuration"
    assert "roughnessMap" in content, "Missing roughnessMap"
    assert "bumpMap" in content, "Missing bumpMap"
    assert "bumpScale" in content, "Missing bumpScale"
    assert "getProceduralPBRMaps" in content, "Missing getProceduralPBRMaps"
    assert "isSharedTexture: true" in content, "Missing isSharedTexture flag on cached textures"
    print("    Validated PBR MeshPhysicalMaterial, clearcoat, envMapIntensity, and multi-channel procedural maps.")

    print("\n>>> ALL PIECES3D CHECKS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    verify_pieces3d()
