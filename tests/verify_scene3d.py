"""
verify_scene3d.py - Comprehensive verification for scene3d.js
"""

import os
import re
import sys

def verify_scene3d():
    print("==================================================")
    print("  VERIFYING scene3d.js")
    print("==================================================")

    file_path = os.path.join(os.path.dirname(__file__), "..", "scene3d.js") if not os.path.exists("scene3d.js") else "scene3d.js"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Exports & Global Exposure
    print("[1] Checking exports and class definition...")
    assert "root.ChessScene3D = factory(" in content or "window.ChessScene3D" in content, "Missing ChessScene3D global export"
    assert "class ChessScene3D" in content, "Missing class ChessScene3D"

    # 2. Constructor & Callbacks
    print("[2] Checking constructor and callbacks...")
    assert "constructor(containerEl, callbacks" in content, "Missing constructor(containerEl, callbacks)"
    assert "onSquareClick" in content, "Missing onSquareClick callback support"
    assert "onPieceDrop" in content, "Missing onPieceDrop callback support"

    # 3. Required API Methods
    print("[3] Checking required public methods...")
    required_methods = [
        "syncBoard",
        "highlightSquares",
        "clearHighlights",
        "setCameraView",
        "flipBoard",
        "setTheme",
        "onResize",
        "destroy",
        "setTurn",
        "getPieceAtSquare",
        "setViewMode",
        "getViewMode",
        "toggleViewMode"
    ]
    for method in required_methods:
        assert re.search(rf"\b{method}\s*\(", content), f"Missing method {method}() in scene3d.js"
        print(f"    ✓ Found method {method}()")

    # 4. Coordinate System & Board Geometry
    print("[4] Checking 3D coordinate system...")
    # rank 8 at z=-3.5 to rank 1 at z=+3.5, file 'a' at x=-3.5 to file 'h' at x=+3.5
    assert "-3.5 + coords.col" in content or "-3.5 + col" in content, "Missing x = -3.5 + col coordinate mapping"
    assert "-3.5 + coords.row" in content or "-3.5 + row" in content, "Missing z = -3.5 + row coordinate mapping"
    assert "worldToSquare" in content, "Missing worldToSquare coordinate conversion"
    assert "squareToWorld" in content, "Missing squareToWorld coordinate conversion"

    # Check coordinate labels a-h and 1-8
    assert "FILES" in content and "RANKS" in content, "Missing FILES and RANKS definition"
    assert "buildCoordinateLabels" in content, "Missing buildCoordinateLabels function"

    # 5. Lighting & Shadows
    print("[5] Checking shadow-casting lights...")
    assert "castShadow = true" in content, "Missing castShadow enabled on key light"
    assert "receiveShadow = true" in content, "Missing receiveShadow on board squares"
    assert "shadowMap.enabled = true" in content, "Missing renderer.shadowMap.enabled = true"
    assert "PCFSoftShadowMap" in content, "Missing PCFSoftShadowMap"
    assert "DirectionalLight" in content, "Missing DirectionalLight"
    assert "AmbientLight" in content, "Missing AmbientLight"

    # 6. Smooth Orbital Camera Controls
    print("[6] Checking orbital camera controls and presets...")
    assert "targetSpherical" in content, "Missing targetSpherical state"
    assert "cameraSpherical" in content, "Missing cameraSpherical state"
    assert "setCameraView" in content, "Missing setCameraView"
    assert "'white'" in content and "'black'" in content and "'top'" in content and "'auto'" in content, "Missing view presets ('white', 'black', 'top', 'auto')"
    assert "flipBoard" in content, "Missing flipBoard()"

    # 7. Raycasting & Drag-and-Drop
    print("[7] Checking raycasting and user interaction...")
    assert "Raycaster" in content, "Missing THREE.Raycaster"
    assert "pointerdown" in content, "Missing pointerdown handler"
    assert "pointermove" in content, "Missing pointermove handler"
    assert "pointerup" in content, "Missing pointerup handler"
    assert "draggedPiece" in content, "Missing draggedPiece handling"
    assert "interactionPlane" in content, "Missing interactionPlane for 3D piece dragging"

    # 8. 3D Square Highlights
    print("[8] Checking 3D square highlights...")
    assert "highlightSquares" in content, "Missing highlightSquares method"
    assert "createSquareHighlight" in content, "Missing square highlight creator"
    assert "createMoveDotMarker" in content, "Missing legal move dot marker"
    assert "createCaptureMarker" in content, "Missing capture ring/bracket marker"
    assert "createCheckMarker" in content, "Missing check danger marker"
    assert "checkPulseMesh" in content, "Missing pulsing check animation"

    # 9. Piece Move Animations
    print("[9] Checking piece move animations...")
    assert "animatePieceMove" in content, "Missing animatePieceMove"
    assert "arcHeight" in content or "4 * arcHeight * t * (1 - t)" in content, "Missing parabolic jump arc calculation for knights"
    assert "castleRookMove" in content or "rookMove" in content, "Missing simultaneous castling rook animation"
    assert "animateCaptureDissolve" in content, "Missing capture dissolve animation"
    assert "replaceWithPromotedPiece" in content, "Missing promotion piece replacement animation"

    # 10. Theme Switching
    print("[10] Checking theme switching...")
    for theme in ['classic', 'marble', 'neon', 'wood']:
        assert theme in content, f"Missing theme '{theme}'"
    assert "window.ChessPieces3D.setTheme" in content, "Missing window.ChessPieces3D.setTheme delegation"
    assert "window.ChessPieces3D.updatePieceTheme" in content, "Missing updatePieceTheme delegation"

    print("\n>>> ALL SCENE3D CHECKS PASSED WITH 100% SUCCESS! <<<")

if __name__ == "__main__":
    verify_scene3d()
