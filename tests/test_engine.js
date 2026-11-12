/**
 * Unit Tests for ChessEngine
 * Run with: node test_engine.js
 */

const ChessEngine = require('../engine.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  PASS: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function testSection(title, fn) {
  console.log(`\n=== [TEST SUITE] ${title} ===`);
  try {
    fn();
  } catch (err) {
    console.error(`  Suite aborted due to error: ${err.message}`);
  }
}

// 1. Initial State & Board Representation
testSection('Initial State & Board Representation', () => {
  const game = new ChessEngine();
  const board = game.getBoard();

  assertEqual(board.length, 8, 'Board has 8 rows');
  assertEqual(board[0].length, 8, 'Board has 8 columns');

  // Check pieces at corners and key ranks
  assertEqual(board[0][0].type, 'r', 'Black rook on a8');
  assertEqual(board[0][0].color, 'b', 'Black rook color');
  assertEqual(board[0][0].square, 'a8', 'Black rook square property');
  assertEqual(board[0][4].type, 'k', 'Black king on e8');
  assertEqual(board[0][4].square, 'e8', 'Black king square property');
  assertEqual(board[7][4].type, 'k', 'White king on e1');
  assertEqual(board[7][4].square, 'e1', 'White king square property');
  assertEqual(board[7][7].type, 'r', 'White rook on h1');

  // getPiece tests
  const e1Piece = game.getPiece('e1');
  assertEqual(e1Piece.type, 'k', 'getPiece(e1) type is k');
  assertEqual(e1Piece.color, 'w', 'getPiece(e1) color is w');
  assertEqual(e1Piece.square, 'e1', 'getPiece(e1) square is e1');
  assertEqual(game.getPiece('e4'), null, 'getPiece(e4) is null initially');

  // Check turn & status
  assertEqual(game.getTurn(), 'w', 'White moves first');
  assertEqual(game.isCheck(), false, 'Not in check at start');
  assertEqual(game.isCheckmate(), false, 'Not checkmate at start');
  assertEqual(game.isStalemate(), false, 'Not stalemate at start');
  assertEqual(game.isDraw(), false, 'Not draw at start');

  const status = game.getGameStatus();
  assertEqual(status.over, false, 'Game not over');
  assertEqual(status.turn, 'w', 'Game turn is w');
  assertEqual(status.kingSquare, 'e1', 'King square is e1');
  assertEqual(status.inCheck, false, 'inCheck is false');

  // Check FEN export matches standard
  assertEqual(
    game.exportFEN(),
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'Standard starting FEN matches'
  );
});

// 2. Pawn Movement & Special Rules
testSection('Pawn Movement, Double Step, En Passant, Promotion', () => {
  const game = new ChessEngine();

  // White e2-e4
  const e2Moves = game.getLegalMoves('e2');
  assert(e2Moves.some(m => m.to === 'e4'), 'e2 can move to e4 (double step)');
  assert(e2Moves.some(m => m.to === 'e3'), 'e2 can move to e3 (single step)');
  assert(e2Moves.includes('e4'), 'Array helper includes destination square');

  const move1 = game.makeMove({ from: 'e2', to: 'e4' });
  assert(move1 !== null, 'e2-e4 executed successfully');
  assertEqual(game.getTurn(), 'b', 'Turn changed to black');
  assertEqual(game.exportFEN().split(' ')[3], 'e3', 'En passant square is e3');

  // Black c7-c5 (Sicilian)
  game.makeMove('c7c5');
  assertEqual(game.getTurn(), 'w', 'Turn changed to white');

  // Test En Passant in action
  const epGame = new ChessEngine();
  // 1. e4 Nf6 2. e5 d5
  epGame.makeMove('e2', 'e4');
  epGame.makeMove('g8', 'f6');
  epGame.makeMove('e4', 'e5');
  epGame.makeMove('d7', 'd5');

  const epMoves = epGame.getLegalMoves('e5');
  assert(epMoves.some(m => m.to === 'd6'), 'En passant to d6 is legal');
  const d6Move = epMoves.find(m => m.to === 'd6');
  assertEqual(d6Move.flags.enPassant, true, 'Move flags.enPassant is true');
  assertEqual(d6Move.flags.capture, true, 'Move flags.capture is true');

  const epMove = epGame.makeMove('e5', 'd6');
  assert(epMove !== null, 'En passant move executed');
  assertEqual(epGame.getPiece('d5'), null, 'Captured pawn on d5 was removed');
  assertEqual(epGame.getPiece('d6').type, 'p', 'Capturing pawn is on d6');
  assertEqual(epGame.getCapturedPieces().w.length, 1, 'White has captured 1 piece');
  assertEqual(epGame.getCapturedPieces().w[0], 'p', 'Captured piece was pawn');

  // Test Pawn Promotion
  const promoGame = new ChessEngine('8/4P3/8/8/8/8/8/k6K w - - 0 1');
  const promoMoves = promoGame.getLegalMoves('e7');
  assertEqual(promoMoves.length, 4, 'e7 pawn has 4 promotion options (Q, R, B, N)');
  assert(promoMoves[0].flags.promotion, 'Promotion move has flags.promotion true');

  const promotedMove = promoGame.makeMove({ from: 'e7', to: 'e8', promotion: 'q' });
  assert(promotedMove !== null, 'Promotion to queen executed');
  assertEqual(promoGame.getPiece('e8').type, 'q', 'Piece on e8 is Queen');
  assertEqual(promoGame.getPiece('e8').color, 'w', 'Queen color is White');
});

// 3. Piece Moves: Knight, Bishop, Rook, Queen
testSection('Piece Movement & Captures', () => {
  const game = new ChessEngine();

  // Knight can jump over pawns
  const b1Moves = game.getLegalMoves('b1');
  assertEqual(b1Moves.length, 2, 'Knight on b1 has 2 legal starting moves (a3, c3)');
  assert(b1Moves.some(m => m.to === 'c3'), 'Knight can jump to c3');
  assert(b1Moves.some(m => m.to === 'a3'), 'Knight can jump to a3');

  // Bishop is blocked at start
  assertEqual(game.getLegalMoves('c1').length, 0, 'Bishop on c1 has 0 starting moves (blocked)');

  // Open diagonal for bishop
  game.makeMove('e2', 'e4');
  game.makeMove('e7', 'e5');
  const f1Moves = game.getLegalMoves('f1');
  assert(f1Moves.length > 0, 'Bishop on f1 has open diagonal');
  assert(f1Moves.some(m => m.to === 'c4'), 'Bishop can move to c4');
});

// 4. Castling: Kingside, Queenside, Restrictions
testSection('Castling Rules & Legality', () => {
  const castleGame = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const e1Moves = castleGame.getLegalMoves('e1');
  assert(e1Moves.some(m => m.to === 'g1'), 'Kingside castle (e1-g1) is legal');
  assert(e1Moves.some(m => m.to === 'c1'), 'Queenside castle (e1-c1) is legal');

  const kCastleMoveInfo = e1Moves.find(m => m.to === 'g1');
  assertEqual(kCastleMoveInfo.flags.kingsideCastle, true, 'flags.kingsideCastle is true');

  // Execute kingside castle
  const kMoveRes = castleGame.makeMove({ from: 'e1', to: 'g1' });
  assertEqual(castleGame.getPiece('g1').type, 'k', 'King moved to g1');
  assertEqual(castleGame.getPiece('f1').type, 'r', 'Rook moved to f1');
  assertEqual(castleGame.getPiece('h1'), null, 'Rook original square h1 is now empty');
  assert(kMoveRes.rookMove !== null, 'rookMove is present in castling move result');
  assertEqual(kMoveRes.rookMove.from, 'h1', 'rookMove.from is h1');
  assertEqual(kMoveRes.rookMove.to, 'f1', 'rookMove.to is f1');

  // Black executes queenside castle
  const qCastleRes = castleGame.makeMove({ from: 'e8', to: 'c8' });
  assertEqual(castleGame.getPiece('c8').type, 'k', 'Black King moved to c8');
  assertEqual(castleGame.getPiece('d8').type, 'r', 'Black Rook moved to d8');
  assertEqual(castleGame.getPiece('a8'), null, 'Black Rook original square a8 is now empty');
  assert(qCastleRes.rookMove !== null, 'Black queenside castle includes rookMove');
  assertEqual(qCastleRes.rookMove.from, 'a8', 'rookMove.from is a8');
  assertEqual(qCastleRes.rookMove.to, 'd8', 'rookMove.to is d8');

  // Cannot castle out of check
  const checkCastle = new ChessEngine('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1');
  assert(checkCastle.isCheck(), 'White is in check from e2 rook');
  const checkMoves = checkCastle.getLegalMoves('e1');
  assert(!checkMoves.some(m => m.to === 'g1'), 'Cannot castle out of check (kingside)');
  assert(!checkMoves.some(m => m.to === 'c1'), 'Cannot castle out of check (queenside)');

  // Cannot castle through check
  const throughCheck = new ChessEngine('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1');
  const throughMoves = throughCheck.getLegalMoves('e1');
  assert(!throughMoves.some(m => m.to === 'g1'), 'Cannot castle through attacked f1 square');
  assert(throughMoves.some(m => m.to === 'c1'), 'Queenside castle is still legal');

  // Cannot castle into check
  const intoCheck = new ChessEngine('r3k2r/8/8/8/8/6r1/8/R3K2R w KQkq - 0 1');
  const intoMoves = intoCheck.getLegalMoves('e1');
  assert(!intoMoves.some(m => m.to === 'g1'), 'Cannot castle into check on g1');
});

// 5. Pins, Discovered Checks & Check Resolution
testSection('Pins & Move Legality', () => {
  const pinGame = new ChessEngine('4k3/8/8/8/4r3/8/4R3/4K3 w - - 0 1');
  const rookMoves = pinGame.getLegalMoves('e2');
  assert(!rookMoves.some(m => m.to === 'd2'), 'Pinned rook cannot move horizontally to d2');
  assert(!rookMoves.some(m => m.to === 'f2'), 'Pinned rook cannot move horizontally to f2');
  assert(rookMoves.some(m => m.to === 'e3'), 'Pinned rook can move along pin line to e3');
  assert(rookMoves.some(m => m.to === 'e4'), 'Pinned rook can capture pinning piece on e4');
});

// 6. Checkmate & Stalemate
testSection('Checkmate & Stalemate Detection', () => {
  // Scholar's Mate: 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
  const scholars = new ChessEngine();
  scholars.makeMove('e2', 'e4');
  scholars.makeMove('e7', 'e5');
  scholars.makeMove('d1', 'h5');
  scholars.makeMove('b8', 'c6');
  scholars.makeMove('f1', 'c4');
  scholars.makeMove('g8', 'f6');
  const mateMove = scholars.makeMove('h5', 'f7');

  assertEqual(mateMove.san, 'Qxf7#', 'SAN notation includes # for checkmate');
  assertEqual(scholars.isCheck(), true, 'Black is in check');
  assertEqual(scholars.isCheckmate(), true, 'Checkmate detected');
  assertEqual(scholars.isGameOver(), true, 'Game is over');
  assertEqual(scholars.getGameStatus().winner, 'w', 'White is winner');
  assertEqual(scholars.getGameStatus().kingSquare, 'e8', 'Black king square is e8');

  // Fool's Mate: 1. f3 e5 2. g4 Qh4#
  const fools = new ChessEngine();
  fools.makeMove('f2', 'f3');
  fools.makeMove('e7', 'e5');
  fools.makeMove('g2', 'g4');
  fools.makeMove('d8', 'h4');
  assertEqual(fools.isCheckmate(), true, 'Fool\'s Mate detected');
  assertEqual(fools.getGameStatus().winner, 'b', 'Black is winner');
  assertEqual(fools.getGameStatus().kingSquare, 'e1', 'White king square is e1');

  // Stalemate
  const stalemateGame = new ChessEngine('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assertEqual(stalemateGame.isCheck(), false, 'Black king not in check');
  assertEqual(stalemateGame.getLegalMoves().length, 0, 'Black has 0 legal moves');
  assertEqual(stalemateGame.isStalemate(), true, 'Stalemate detected');
  assertEqual(stalemateGame.isDraw(), true, 'Stalemate is a draw');
  assertEqual(stalemateGame.isCheckmate(), false, 'Not checkmate');
  assertEqual(stalemateGame.getDrawReason(), 'stalemate', 'Draw reason is stalemate');
});

// 7. Draw Conditions: Insufficient Material, 50-Move Rule, Repetition
testSection('Draw Rules (Insufficient Material, 50-Move, Repetition)', () => {
  // King vs King
  const kvk = new ChessEngine('8/8/4k3/8/8/4K3/8/8 w - - 0 1');
  assertEqual(kvk.isInsufficientMaterial(), true, 'K vs K is insufficient material');
  assertEqual(kvk.isDraw(), true, 'K vs K is draw');

  // King + Bishop vs King
  const kvkb = new ChessEngine('8/8/4k3/8/8/4K3/5B2/8 w - - 0 1');
  assertEqual(kvkb.isInsufficientMaterial(), true, 'K+B vs K is insufficient material');

  // King + Knight vs King
  const kvkn = new ChessEngine('8/8/4k3/8/8/4K3/5N2/8 w - - 0 1');
  assertEqual(kvkn.isInsufficientMaterial(), true, 'K+N vs K is insufficient material');

  // King + Bishop vs King + Bishop (same color squares)
  const sameBishops = new ChessEngine('8/8/4k3/8/5b2/8/8/2B1K3 w - - 0 1');
  assertEqual(sameBishops.isInsufficientMaterial(), true, 'Same color bishops is insufficient material');

  // 50-Move Rule
  const fiftyMove = new ChessEngine('8/8/4k3/8/8/4K3/8/8 w - - 100 50');
  assertEqual(fiftyMove.isFiftyMoveRule(), true, '100 half-moves triggers 50-move rule');
  assertEqual(fiftyMove.isDraw(), true, '50-move rule counts as draw');
  assertEqual(fiftyMove.getDrawReason(), '50-move rule', 'Draw reason is 50-move rule');

  // Threefold repetition
  const repGame = new ChessEngine();
  repGame.makeMove('g1', 'f3');
  repGame.makeMove('g8', 'f6');
  repGame.makeMove('f3', 'g1');
  repGame.makeMove('f6', 'g8');
  repGame.makeMove('g1', 'f3');
  repGame.makeMove('g8', 'f6');
  repGame.makeMove('f3', 'g1');
  repGame.makeMove('f6', 'g8');
  assertEqual(repGame.isThreefoldRepetition(), true, 'Threefold repetition detected');
  assertEqual(repGame.isDraw(), true, 'Threefold repetition is draw');
  assertEqual(repGame.getDrawReason(), 'threefold repetition', 'Draw reason is threefold repetition');
});

// 8. History & Undo Functionality
testSection('Move History & Undo Support', () => {
  const game = new ChessEngine();
  game.makeMove('e2', 'e4');
  game.makeMove('e7', 'e5');
  game.makeMove('g1', 'f3');

  const history = game.getHistory();
  assertEqual(history.length, 3, 'History contains 3 moves');
  assertEqual(history[0], 'e4', 'Move 1 is e4');
  assertEqual(history[1], 'e5', 'Move 2 is e5');
  assertEqual(history[2], 'Nf3', 'Move 3 is Nf3');

  // Undo 3rd move
  const undone3 = game.undo();
  assertEqual(undone3.san, 'Nf3', 'Undone move was Nf3');
  assertEqual(game.getTurn(), 'w', 'Turn reverted to White');
  assertEqual(game.getPiece('f3'), null, 'Knight removed from f3');
  assertEqual(game.getPiece('g1').type, 'n', 'Knight back on g1');

  // Undo remaining moves
  game.undo();
  game.undo();
  assertEqual(game.getHistory().length, 0, 'History empty after all undos');
  assertEqual(
    game.exportFEN(),
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'Board fully restored to starting FEN'
  );
});

// 9. Static / Singleton API Support & reset()
testSection('Static API Support & reset()', () => {
  ChessEngine.reset();
  assertEqual(ChessEngine.getTurn(), 'w', 'Static getTurn returns w');
  ChessEngine.makeMove('e2', 'e4');
  assertEqual(ChessEngine.getTurn(), 'b', 'Static getTurn updated to b');
  assertEqual(ChessEngine.isGameOver(), false, 'Static isGameOver returns false');
  assertEqual(typeof ChessEngine.getCapturedPieces, 'function', 'getCapturedPieces exists');
});

// Summary
console.log('\n========================================');
console.log(`TOTAL TESTS:  ${totalTests}`);
console.log(`PASSED TESTS: ${passedTests}`);
console.log(`FAILED TESTS: ${failedTests}`);
console.log('========================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\nALL TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}
