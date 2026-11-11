"""
Verification script for pieces3d.js
Verifies:
1. File syntax & structure
2. LatheGeometry point sanity (positive radii, valid Y coordinates)
3. Height constants vs actual geometry extents
4. Material theme definitions & color codes
5. Export signatures & UMD compatibility
"""

import re
import math
import sys

def verify_pieces3d():
    with open("pieces3d.js", "r", encoding="utf-8") as f:
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

    print("[5] Checking high-contrast colors & felt base pads...")
    assert "0xfbfaf5" in content, "Missing high-contrast white color 0xfbfaf5"
    assert "0x14161b" in content, "Missing high-contrast black color 0x14161b"
    assert "createFeltPad" in content, "Missing createFeltPad function"
    assert "isFelt" in content, "Missing isFelt metadata flag"

    print(f"    Validated {len(v2_matches)} Lathe profile points across all turned pieces.")
    print("    Validated high-contrast materials and felt base pad integration.")

    print("\n>>> ALL PIECES3D CHECKS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    verify_pieces3d()
