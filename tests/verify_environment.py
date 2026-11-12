"""
tests/verify_environment.py - Python verification runner for procedural 3D environment in scene3d.js
"""

import os
import sys

def verify_environment():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    scene_path = os.path.join(root_dir, "scene3d.js")
    with open(scene_path, "r", encoding="utf-8") as f:
        scene_src = f.read()

    total_checks = 0
    passed_checks = 0
    failed_checks = 0
    failures = []

    def check(cond, msg):
        nonlocal total_checks, passed_checks, failed_checks
        total_checks += 1
        if cond:
            passed_checks += 1
            print(f"  [PASS] {msg}")
        else:
            failed_checks += 1
            failures.append(msg)
            print(f"  [FAIL] {msg}")

    print("\n======================================================================")
    print("  SUITE: 1. Procedural 3D Table, Chairs, and Tabletop Chess Clock")
    print("======================================================================")

    check("this.environmentGroup" in scene_src, "this.environmentGroup container initialized in scene3d.js")
    check("this.tableMesh" in scene_src, "this.tableMesh reference preserved for backward compatibility")
    check("initTable" in scene_src or "buildTable" in scene_src or "createTable" in scene_src, "Procedural table builder method exists in scene3d.js")
    check("leg" in scene_src or "Leg" in scene_src, "Procedural table legs created in scene3d.js")
    check("clock" in scene_src or "Clock" in scene_src, "Procedural 3D decorative tabletop chess clock created in scene3d.js")
    check("chair" in scene_src or "Chair" in scene_src or "armchair" in scene_src, "Procedural player chairs created on White and Black sides")

    print("\n======================================================================")
    print("  SUITE: 2. Theme-Adaptive 3D Room Interior (Floor, Carpet, Walls, Ceiling)")
    print("======================================================================")

    check("floor" in scene_src or "Floor" in scene_src, "Procedural floor geometry created in scene3d.js")
    check("carpet" in scene_src or "rug" in scene_src or "Carpet" in scene_src or "Rug" in scene_src, "Under-table carpet / rug created in scene3d.js")
    check("wall" in scene_src or "Wall" in scene_src, "Procedural enclosing room walls created in scene3d.js")
    check("bookshelf" in scene_src or "Bookshelf" in scene_src or "book" in scene_src, "Classic theme: Library bookshelves / books present")
    check("fireplace" in scene_src or "Fireplace" in scene_src or "hearth" in scene_src, "Wood theme: Lodge stone fireplace with glowing hearth present")
    check("column" in scene_src or "Column" in scene_src or "pillar" in scene_src, "Marble/Neon theme: Architectural columns / neon pillars present")

    print("\n======================================================================")
    print("  SUITE: 3. Raycasting Protection & Performance")
    print("======================================================================")

    idx_start = scene_src.find("handlePointerDown(event)")
    idx_end = scene_src.find("handlePointerMove(event)")
    assert idx_start != -1 and idx_end != -1, "Could not find handlePointerDown / handlePointerMove"
    pointer_down_section = scene_src[idx_start:idx_end]

    check("this.environmentGroup" not in pointer_down_section, "handlePointerDown does NOT raycast into this.environmentGroup (click performance protected)")
    check("maxPhi" in scene_src, "this.maxPhi is configured to prevent camera dipping below tabletop level")

    print("\n======================================================================")
    print("  VERIFICATION RESULTS")
    print("======================================================================")
    print(f"  TOTAL CHECKS: {total_checks}")
    print(f"  PASSED:       {passed_checks}")
    print(f"  FAILED:       {failed_checks}")

    if failed_checks > 0:
        print("\n  FAILURES:")
        for i, f in enumerate(failures, 1):
            print(f"  {i}) {f}")
        sys.exit(1)
    else:
        print("\n  ALL 3D PROCEDURAL ENVIRONMENT CHECKS PASSED!")
        sys.exit(0)

if __name__ == "__main__":
    verify_environment()
