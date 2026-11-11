/**
 * verify_engine_extended.js
 * Comprehensive edge-case verification for ChessEngine
 */

const ChessEngine = require('./engine.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  [FAIL] ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function runSection(title, fn) {
  console.log(`\n==================================================`);
  console.log(`  VERIFYING: ${title}`);
  console.log(`==================================================`);
  try {
    fn();
  } catch (err) {
    console.error(`  Suite error in "${title}":`, err.message);
  }
}

// 1. Fool's Mate & Quick Mates
runSection("Fool's Mate & Scholar's Mate", () => {
  // Fool's Mate
  const fools = new ChessEngine();
  fools.makeMove({ from: 'f2', to: 'f3' });
  fools.makeMove({ from: 'e7', to: 'e5' });
  fools.makeMove({ from: 'g2', to: 'g4' });
  const qh4 = fools.makeMove({ from: 'd8', to: 'h4' });

  assertEqual(fools.isCheck(), true, "Fool's mate: White king is in check");
  assertEqual(fools.isCheckmate(), true, "Fool's mate: Checkmate detected");
  assertEqual(fools.getTurn(), 'w', "Fool's mate: Turn is White (checkmated)");
  const status = fools.getGameStatus();
  assertEqual(status.over, true, "Game is over");
  assertEqual(status.winner, 'b', "Winner is Black");
  assertEqual(status.reason, 'checkmate', "Reason is checkmate");
  assertEqual(fools.getLegalMoves().length, 0, "Zero legal moves for checkmated side");

  // Scholar's Mate
  const scholars = new ChessEngine();
  scholars.makeMove('e2', 'e4');
  scholars.makeMove('e7', 'e5');
  scholars.makeMove('f1', 'c4');
  scholars.makeMove('b8', 'c6');
  scholars.makeMove('d1', 'h5');
  scholars.makeMove('g8', 'f6');
  const mate = scholars.makeMove({ from: 'h5', to: 'f7' });
  assertEqual(scholars.isCheckmate(), true, "Scholar's mate: Checkmate detected");
  assertEqual(scholars.getGameStatus().winner, 'w', "Scholar's mate: Winner is White");
  assertEqual(mate.san, 'Qxf7#', "SAN has # symbol");
});

// 2. Castling: Rights degradation and blocked scenarios
runSection("Castling Rights & Invalidation", () => {
  // Test: King move revokes both kingside and queenside castling permanently
  const g1 = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assertEqual(g1.getLegalMoves('e1').some(m => m.to === 'g1'), true, "Initially O-O legal");
  assertEqual(g1.getLegalMoves('e1').some(m => m.to === 'c1'), true, "Initially O-O-O legal");

  // King moves e1 -> e2
  g1.makeMove({ from: 'e1', to: 'e2' });
  g1.makeMove({ from: 'e8', to: 'd8' }); // Black king moves too
  // White moves back e2 -> e1
  g1.makeMove({ from: 'e2', to: 'e1' });
  g1.makeMove({ from: 'd8', to: 'e8' });

  // Both kings should have lost ALL castling rights
  assertEqual(g1.getLegalMoves('e1').some(m => m.to === 'g1'), false, "White lost O-O after king move");
  assertEqual(g1.getLegalMoves('e1').some(m => m.to === 'c1'), false, "White lost O-O-O after king move");
  assertEqual(g1.getLegalMoves('e8').some(m => m.to === 'g8'), false, "Black lost O-O after king move");
  assertEqual(g1.getLegalMoves('e8').some(m => m.to === 'c8'), false, "Black lost O-O-O after king move");

  // Test: Queenside Rook moves, Kingside castling remains valid
  const g2 = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  g2.makeMove({ from: 'a1', to: 'b1' }); // a1 rook moves
  g2.makeMove({ from: 'a8', to: 'b8' }); // Black a8 rook moves
  g2.makeMove({ from: 'b1', to: 'a1' }); // a1 rook moves back
  g2.makeMove({ from: 'b8', to: 'a8' });

  assertEqual(g2.getLegalMoves('e1').some(m => m.to === 'c1'), false, "O-O-O lost after a1 rook moved");
  assertEqual(g2.getLegalMoves('e1').some(m => m.to === 'g1'), true, "O-O still legal because h1 rook never moved");

  // Test: Pieces blocking castling path
  const g3 = new ChessEngine('r1b1k2r/8/8/8/8/8/8/R2QK2R w KQkq - 0 1');
  assertEqual(g3.getLegalMoves('e1').some(m => m.to === 'c1'), false, "O-O-O illegal due to Queen on d1");
  assertEqual(g3.getLegalMoves('e1').some(m => m.to === 'g1'), true, "O-O legal with empty path");
});

// 3. En Passant Expiration & Discovery Checks
runSection("En Passant Expiration & Legality", () => {
  const g = new ChessEngine();
  // 1. e4 Nf6 2. e5 d5
  g.makeMove('e2', 'e4');
  g.makeMove('g8', 'f6');
  g.makeMove('e4', 'e5');
  g.makeMove('d7', 'd5'); // Black double-steps d5 -> en passant available on d6

  assertEqual(g.exportFEN().includes(' d6 '), true, "FEN shows d6 en passant target");
  assertEqual(g.getLegalMoves('e5').some(m => m.to === 'd6'), true, "e5 pawn can capture d6 e.p.");

  // Instead of taking e.p., White plays a2-a3
  g.makeMove('a2', 'a3');
  g.makeMove('a7', 'a6');

  // Now White e5 pawn CANNOT capture en passant anymore
  assertEqual(g.exportFEN().includes(' - '), true, "En passant target cleared");
  assertEqual(g.getLegalMoves('e5').some(m => m.to === 'd6'), false, "En passant expired after 1 turn");

  // En passant discovery pin edge case:
  // White King on e5, White pawn on d5, Black pawn moves c7-c5, Black rook on a5.
  // If White takes d5xc6 e.p., both d5 and c5 disappear, opening the 5th rank to Black rook -> would be check!
  const epPin = new ChessEngine('8/8/8/r2Pk3/8/8/8/4K3 b - - 0 1');
  // Black plays c7-c5 -> double step
  // Wait, in FEN rank 5 has r2Pk3: r on a5, P on d5, k on e5
  // Let's test with Black pawn on c7 moving to c5:
  const epPinGame = new ChessEngine('8/2p5/8/r2P4/4K3/8/8/7k b - - 0 1');
  epPinGame.makeMove({ from: 'c7', to: 'c5' });
  // White has King on e4, pawn on d5, black rook on a5, black pawn on c5.
  // Here King is on e4, not e5, so taking d5xc6 does not expose King.
  // But what if White King is on e5, Black Rook on a5:
  const horizontalPin = new ChessEngine('8/2p5/8/r2P4/8/8/8/7k b - - 0 1');
  // Let's place White King on h5:
  const rank5Pin = new ChessEngine('8/2p5/8/r2P3K/8/8/8/7k b - - 0 1');
  rank5Pin.makeMove({ from: 'c7', to: 'c5' });
  // Now White King is on h5, Black Rook on a5, White pawn on d5, Black pawn on c5.
  // If White pawn plays d5xc6, both pawns leave rank 5, exposing h5 King to a5 Rook!
  const epMoves = rank5Pin.getLegalMoves('d5');
  const canEp = epMoves.some(m => m.to === 'c6');
  assertEqual(canEp, false, "En passant that opens rank to check is illegal (horizontal pin)");
});

// 4. Promotions: Underpromotion and checks
runSection("Pawn Promotions & Underpromotions", () => {
  // Underpromotion to Knight delivering check vs no check
  // Black king on h7 -> f8=N gives check!
  const promoKnightCheck = new ChessEngine('8/5P1k/8/8/8/8/8/7K w - - 0 1');
  promoKnightCheck.makeMove({ from: 'f7', to: 'f8', promotion: 'n' });
  assertEqual(promoKnightCheck.getPiece('f8').type, 'n', "Underpromoted to Knight");
  assertEqual(promoKnightCheck.isCheck(), true, "Knight on f8 checks King on h7");

  // Black king on h8 -> f8=N does NOT give check
  const promoKnightNoCheck = new ChessEngine('7k/5P2/8/8/8/8/8/7K w - - 0 1');
  promoKnightNoCheck.makeMove({ from: 'f7', to: 'f8', promotion: 'n' });
  assertEqual(promoKnightNoCheck.isCheck(), false, "Knight on f8 does not check King on h8");

  // Promote to Rook f7-f8=R
  const promoRook = new ChessEngine('8/5P1k/8/8/8/8/8/7K w - - 0 1');
  const moveR = promoRook.makeMove({ from: 'f7', to: 'f8', promotion: 'r' });
  assertEqual(promoRook.getPiece('f8').type, 'r', "Promoted to Rook");

  // Promotion with capture and checkmate (back-rank mate with g7,h7 blocked)
  const promoMate = new ChessEngine('4n2k/3P2pp/8/8/8/8/8/7K w - - 0 1');
  // d7xe8=Q#
  const mateMove = promoMate.makeMove({ from: 'd7', to: 'e8', promotion: 'q' });
  assertEqual(promoMate.isCheck(), true, "Promotion delivered check");
  assertEqual(promoMate.isCheckmate(), true, "Promotion with capture delivered checkmate");
  assertEqual(mateMove.san, 'dxe8=Q#', "SAN has =Q# format");
});

// 5. Absolute Pins: Knight, Bishop, Rook
runSection("Absolute Pins", () => {
  // Knight pinned to King by enemy Bishop
  const knightPin = new ChessEngine('7k/8/8/8/2b5/8/4N3/5K2 w - - 0 1');
  // White King on f1, White Knight on e2, Black Bishop on c4 (diagonal c4-e2-f1)
  const nMoves = knightPin.getLegalMoves('e2');
  assertEqual(nMoves.length, 0, "Knight pinned diagonally to King has zero legal moves");

  // Rook pinned along file: can move along file, cannot leave file
  const rookPin = new ChessEngine('4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1');
  const rMoves = rookPin.getLegalMoves('e2');
  // Can move e2->e3, e2->e4, e2->e5, e2->e6, e2->e7(capture)
  assert(rMoves.length > 0, "Pinned rook can move along file");
  assert(rMoves.every(m => m.to.startsWith('e')), "Pinned rook can only move on e-file");
  assert(rMoves.some(m => m.to === 'e7'), "Pinned rook can capture pinning rook on e7");
  assert(!rMoves.some(m => m.to === 'd2'), "Pinned rook cannot move off file to d2");
});

// 6. Stalemate Scenarios
runSection("Stalemate Edge Cases", () => {
  // Classic corner King stalemate
  const st1 = new ChessEngine('k7/2Q5/8/8/8/8/8/7K b - - 0 1');
  assertEqual(st1.isCheck(), false, "Stalemate: Black king is not in check");
  assertEqual(st1.getLegalMoves().length, 0, "Stalemate: Black has 0 legal moves");
  assertEqual(st1.isStalemate(), true, "Stalemate detected");
  assertEqual(st1.isGameOver(), true, "Game is over");
  assertEqual(st1.getGameStatus().reason, 'stalemate', "Reason is stalemate");

  // Stalemate with King trapped on a8 by White King on a6 and Rook on b7
  const st2 = new ChessEngine('k7/1R6/K7/8/8/8/8/8 b - - 0 1');
  assertEqual(st2.isCheck(), false, "Trapped king stalemate: not in check");
  assertEqual(st2.getLegalMoves().length, 0, "Trapped king stalemate: 0 moves");
  assertEqual(st2.isStalemate(), true, "Stalemate confirmed");
});

// 7. Draw by Insufficient Material
runSection("Insufficient Material Variations", () => {
  // K vs K
  assert(new ChessEngine('8/8/4k3/8/8/4K3/8/8 w - - 0 1').isInsufficientMaterial(), "K vs K");
  // K+N vs K
  assert(new ChessEngine('8/8/4k3/8/8/4KN2/8/8 w - - 0 1').isInsufficientMaterial(), "K+N vs K");
  // K+B vs K
  assert(new ChessEngine('8/8/4k3/8/8/4KB2/8/8 w - - 0 1').isInsufficientMaterial(), "K+B vs K");
  // K+B vs K+B (same color squares, e.g. both light-squared c1 and f8)
  // c1 is dark? a1 is dark, b1 is light, c1 is dark.
  // Let's check squares:
  // c1: col 2 (0-indexed 0,1,2=even), rank 1 (row 7=odd). 2+7=9 (odd=light? let's check standard: a1 is dark)
  // Standard chessboard: a1 is dark (row 7, col 0 -> 7+0=7 odd is dark).
  // e1 is dark. f1 is light.
  // c1 is dark, f8 is dark (col 5 + row 0 = 5 odd = dark).
  const sameColorBishops = new ChessEngine('5b2/8/4k3/8/8/8/8/2B1K3 w - - 0 1');
  assert(sameColorBishops.isInsufficientMaterial(), "K+B vs K+B with same square color is draw");

  // K+P vs K is NOT insufficient material (pawn can promote)
  assert(!new ChessEngine('8/8/4k3/8/8/4KP2/8/8 w - - 0 1').isInsufficientMaterial(), "K+P vs K is NOT insufficient material");
  // K+Q vs K is NOT insufficient material
  assert(!new ChessEngine('8/8/4k3/8/8/4KQ2/8/8 w - - 0 1').isInsufficientMaterial(), "K+Q vs K is NOT insufficient material");
  // K+R vs K is NOT insufficient material
  assert(!new ChessEngine('8/8/4k3/8/8/4KR2/8/8 w - - 0 1').isInsufficientMaterial(), "K+R vs K is NOT insufficient material");
});

// 8. Undo and FEN Consistency
runSection("Undo Move & FEN Consistency", () => {
  const g = new ChessEngine();
  const initialFEN = g.exportFEN();
  const moves = [
    { from: 'e2', to: 'e4' },
    { from: 'e7', to: 'e5' },
    { from: 'g1', to: 'f3' },
    { from: 'b8', to: 'c6' },
    { from: 'f1', to: 'b5' }, // Ruy Lopez
    { from: 'a7', to: 'a6' },
    { from: 'b5', to: 'a4' },
    { from: 'g8', to: 'f6' },
    { from: 'e1', to: 'g1' }, // Castles
  ];

  for (const m of moves) {
    g.makeMove(m);
  }

  assertEqual(g.getHistory().length, 9, "9 moves played");
  assertEqual(g.getPiece('g1').type, 'k', "White King is on g1");
  assertEqual(g.getPiece('f1').type, 'r', "White Rook is on f1");

  // Undo all 9 moves one by one
  for (let i = 0; i < 9; i++) {
    g.undo();
  }

  assertEqual(g.getHistory().length, 0, "History 0 after all undos");
  assertEqual(g.exportFEN(), initialFEN, "FEN matches initial starting FEN exactly");
});

console.log("\n==================================================");
console.log(`TOTAL EXTENDED TESTS:  ${totalTests}`);
console.log(`PASSED:                ${passedTests}`);
console.log(`FAILED:                ${failedTests}`);
console.log("==================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log("ALL EXTENDED ENGINE VERIFICATION TESTS PASSED!");
}
