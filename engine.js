/**
 * ChessEngine - Standalone Vanilla JavaScript Chess Engine
 * 
 * Supports:
 * - Full standard FIDE rules
 * - 8x8 board representation
 * - All piece moves: Pawns (double-push, en passant, promotion), Knights,
 *   Bishops, Rooks, Queens, Kings (Kingside and Queenside castling)
 * - Check, checkmate, stalemate detection
 * - Absolute pins, discovered checks, move legality filtering
 * - Draw rules: 50-move rule, insufficient material, threefold repetition
 * - Full move history & undo support
 * - FEN import/export and SAN (Standard Algebraic Notation) generation
 * - Dual environment: Node.js (CommonJS) & Browser (window.ChessEngine)
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.ChessEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Constants
  const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']; // row 0 = rank 8, row 7 = rank 1

  function squareToCoords(square) {
    if (typeof square !== 'string' || square.length < 2) return null;
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

  function cloneBoard(board) {
    return board.map((row, r) =>
      row.map((cell, c) => (cell ? { type: cell.type, color: cell.color, square: coordsToSquare(r, c) } : null))
    );
  }

  function createFlags(flagsStr = '', isCapture = false, promo = null, isEP = false, isKCastle = false, isQCastle = false) {
    const flagsObj = {
      capture: Boolean(isCapture || flagsStr.includes('c') || flagsStr.includes('e')),
      promotion: Boolean(promo || flagsStr.includes('p')),
      enPassant: Boolean(isEP || flagsStr.includes('e')),
      kingsideCastle: Boolean(isKCastle || flagsStr.includes('k')),
      queensideCastle: Boolean(isQCastle || flagsStr.includes('q')),
      doublePush: Boolean(flagsStr.includes('b')),
      toString() { return flagsStr; },
      includes(ch) { return flagsStr.includes(ch); }
    };
    return flagsObj;
  }

  class ChessEngine {
    constructor(fen = DEFAULT_FEN) {
      this.newGame(fen);
    }

    /**
     * Initializes or resets the board to a given FEN (default is starting position).
     */
    newGame(fen = DEFAULT_FEN) {
      this.board = Array(8).fill(null).map(() => Array(8).fill(null));
      this.turn = 'w';
      this.castling = {
        w: { k: true, q: true },
        b: { k: true, q: true }
      };
      this.enPassant = null; // target square e.g. 'e3'
      this.halfmoveClock = 0;
      this.fullmoveNumber = 1;
      this.history = []; // Array of move details
      this.positionCounts = {}; // FEN key -> count for 3-fold repetition
      this.capturedPieces = { w: [], b: [] }; // w: captured by white, b: captured by black

      this.loadFEN(fen);
      return this;
    }

    reset(fen = DEFAULT_FEN) {
      return this.newGame(fen);
    }

    /**
     * Returns an 8x8 array representation of the board.
     * Each cell is null or { type: 'p'|'n'|'b'|'r'|'q'|'k', color: 'w'|'b', square: 'e4' }.
     */
    getBoard() {
      return cloneBoard(this.board);
    }

    /**
     * Returns the piece at a given square or null: { type, color, square }.
     */
    getPiece(square) {
      const coords = squareToCoords(square);
      if (!coords) return null;
      const piece = this.board[coords.row][coords.col];
      return piece ? { type: piece.type, color: piece.color, square: coordsToSquare(coords.row, coords.col) } : null;
    }

    /**
     * Returns current turn: 'w' or 'b'.
     */
    getTurn() {
      return this.turn;
    }

    /**
     * Exports current game state to standard FEN string.
     */
    exportFEN() {
      let fen = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
          const piece = this.board[r][c];
          if (!piece) {
            empty++;
          } else {
            if (empty > 0) {
              fen += empty;
              empty = 0;
            }
            const char = piece.type;
            fen += (piece.color === 'w' ? char.toUpperCase() : char.toLowerCase());
          }
        }
        if (empty > 0) fen += empty;
        if (r < 7) fen += '/';
      }

      fen += ` ${this.turn} `;

      let castling = '';
      if (this.castling.w.k) castling += 'K';
      if (this.castling.w.q) castling += 'Q';
      if (this.castling.b.k) castling += 'k';
      if (this.castling.b.q) castling += 'q';
      fen += (castling || '-') + ' ';

      fen += (this.enPassant || '-') + ' ';
      fen += `${this.halfmoveClock} ${this.fullmoveNumber}`;

      return fen;
    }

    /**
     * Loads a FEN string.
     */
    loadFEN(fen) {
      if (typeof fen !== 'string') return false;
      const parts = fen.trim().split(/\s+/);
      if (parts.length < 4) return false;

      const [ranksStr, turnStr, castlingStr, epStr, halfmoveStr, fullmoveStr] = parts;
      const ranks = ranksStr.split('/');
      if (ranks.length !== 8) return false;

      const newBoard = Array(8).fill(null).map(() => Array(8).fill(null));

      for (let r = 0; r < 8; r++) {
        const rowStr = ranks[r];
        let c = 0;
        for (let i = 0; i < rowStr.length; i++) {
          const ch = rowStr[i];
          if (ch >= '1' && ch <= '8') {
            c += parseInt(ch, 10);
          } else {
            const isWhite = ch === ch.toUpperCase();
            const type = ch.toLowerCase();
            if (!PIECE_NAMES[type] || c > 7) return false;
            newBoard[r][c] = { type, color: isWhite ? 'w' : 'b', square: coordsToSquare(r, c) };
            c++;
          }
        }
        if (c !== 8) return false;
      }

      this.board = newBoard;
      this.turn = (turnStr === 'b') ? 'b' : 'w';

      this.castling = {
        w: { k: castlingStr.includes('K'), q: castlingStr.includes('Q') },
        b: { k: castlingStr.includes('k'), q: castlingStr.includes('q') }
      };

      this.enPassant = (epStr && epStr !== '-') ? epStr.toLowerCase() : null;
      this.halfmoveClock = halfmoveStr ? parseInt(halfmoveStr, 10) : 0;
      this.fullmoveNumber = fullmoveStr ? parseInt(fullmoveStr, 10) : 1;
      this.history = [];
      this.capturedPieces = { w: [], b: [] };
      this.positionCounts = {};
      this._recordPosition();

      return true;
    }

    _getPositionKey() {
      // Repetition key: board + turn + castling + legal ep
      let epSquare = '-';
      if (this.enPassant) {
        const pseudoMoves = this._generateMovesForColor(this.turn, this.board, false);
        const hasLegalEP = pseudoMoves.some(m => m.flagsStr && m.flagsStr.includes('e') && this._isLegalMove(m));
        if (hasLegalEP) {
          epSquare = this.enPassant;
        }
      }

      const boardPart = this.exportFEN().split(' ').slice(0, 3).join(' ');
      return `${boardPart} ${epSquare}`;
    }

    _recordPosition() {
      const key = this._getPositionKey();
      this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
    }

    _unrecordPosition() {
      const key = this._getPositionKey();
      if (this.positionCounts[key]) {
        this.positionCounts[key]--;
        if (this.positionCounts[key] <= 0) {
          delete this.positionCounts[key];
        }
      }
    }

    /**
     * Check if a square is attacked by a given color.
     */
    isSquareAttacked(square, byColor, board = this.board) {
      const coords = typeof square === 'string' ? squareToCoords(square) : square;
      if (!coords) return false;
      const { row, col } = coords;

      // 1. Pawn attacks: from square's point of view
      const pawnPusherRow = byColor === 'w' ? row + 1 : row - 1;
      if (pawnPusherRow >= 0 && pawnPusherRow <= 7) {
        for (const dc of [-1, 1]) {
          const c = col + dc;
          if (c >= 0 && c <= 7) {
            const p = board[pawnPusherRow][c];
            if (p && p.color === byColor && p.type === 'p') return true;
          }
        }
      }

      // 2. Knight attacks
      const knightOffsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightOffsets) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
          const p = board[r][c];
          if (p && p.color === byColor && p.type === 'n') return true;
        }
      }

      // 3. King attacks (adjacent squares)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
            const p = board[r][c];
            if (p && p.color === byColor && p.type === 'k') return true;
          }
        }
      }

      // 4. Sliding pieces: Orthogonal (Rook & Queen)
      const orthogonalDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of orthogonalDirs) {
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
          const p = board[r][c];
          if (p) {
            if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
            break;
          }
          r += dr;
          c += dc;
        }
      }

      // 5. Sliding pieces: Diagonal (Bishop & Queen)
      const diagonalDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of diagonalDirs) {
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
          const p = board[r][c];
          if (p) {
            if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
            break;
          }
          r += dr;
          c += dc;
        }
      }

      return false;
    }

    _findKing(color, board = this.board) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.type === 'k' && p.color === color) {
            return { row: r, col: c, square: coordsToSquare(r, c) };
          }
        }
      }
      return null;
    }

    /**
     * Checks if the specified color (or current turn if omitted) is currently in check.
     */
    isCheck(color = this.turn) {
      const kingCoords = this._findKing(color);
      if (!kingCoords) return false;
      const opponentColor = color === 'w' ? 'b' : 'w';
      return this.isSquareAttacked(kingCoords, opponentColor);
    }

    /**
     * Generates pseudo-legal moves for a specific piece/square.
     */
    _generatePseudoMoves(row, col, board = this.board) {
      const piece = board[row][col];
      if (!piece) return [];
      const moves = [];
      const { type, color } = piece;
      const opponentColor = color === 'w' ? 'b' : 'w';
      const fromSq = coordsToSquare(row, col);

      const addMove = (toRow, toCol, flagsStr = '', capturedPiece = null, promo = null) => {
        const toSq = coordsToSquare(toRow, toCol);
        const isCapture = Boolean(capturedPiece || flagsStr.includes('c') || flagsStr.includes('e'));
        const isEP = flagsStr.includes('e');
        const isKCastle = flagsStr.includes('k');
        const isQCastle = flagsStr.includes('q');

        moves.push({
          from: fromSq,
          to: toSq,
          fromRow: row,
          fromCol: col,
          toRow,
          toCol,
          piece: type,
          color,
          captured: capturedPiece ? capturedPiece.type : null,
          promotion: promo,
          flagsStr,
          flags: createFlags(flagsStr, isCapture, promo, isEP, isKCastle, isQCastle)
        });
      };

      if (type === 'p') {
        const forward = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;

        // 1 step forward
        const r1 = row + forward;
        if (r1 >= 0 && r1 <= 7 && !board[r1][col]) {
          if (r1 === promoRow) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              addMove(r1, col, 'p', null, promo);
            }
          } else {
            addMove(r1, col, '');
            // 2 steps forward from initial rank
            const r2 = row + 2 * forward;
            if (row === startRow && !board[r2][col]) {
              addMove(r2, col, 'b');
            }
          }
        }

        // Diagonal captures & En Passant
        for (const dc of [-1, 1]) {
          const c = col + dc;
          if (c >= 0 && c <= 7) {
            const target = board[r1][c];
            if (target && target.color === opponentColor) {
              if (r1 === promoRow) {
                for (const promo of ['q', 'r', 'b', 'n']) {
                  addMove(r1, c, 'cp', target, promo);
                }
              } else {
                addMove(r1, c, 'c', target);
              }
            } else if (!target && this.enPassant) {
              const epCoords = squareToCoords(this.enPassant);
              if (epCoords && epCoords.row === r1 && epCoords.col === c) {
                const epCapturedPawn = board[row][c];
                if (epCapturedPawn && epCapturedPawn.color === opponentColor && epCapturedPawn.type === 'p') {
                  addMove(r1, c, 'e', epCapturedPawn);
                }
              }
            }
          }
        }
      } else if (type === 'n') {
        const knightOffsets = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of knightOffsets) {
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
            const target = board[r][c];
            if (!target) {
              addMove(r, c);
            } else if (target.color === opponentColor) {
              addMove(r, c, 'c', target);
            }
          }
        }
      } else if (type === 'b' || type === 'r' || type === 'q') {
        const dirs = [];
        if (type === 'b' || type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        if (type === 'r' || type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

        for (const [dr, dc] of dirs) {
          let r = row + dr;
          let c = col + dc;
          while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
            const target = board[r][c];
            if (!target) {
              addMove(r, c);
            } else {
              if (target.color === opponentColor) {
                addMove(r, c, 'c', target);
              }
              break;
            }
            r += dr;
            c += dc;
          }
        }
      } else if (type === 'k') {
        // Standard 1-square king moves
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
              const target = board[r][c];
              if (!target) {
                addMove(r, c);
              } else if (target.color === opponentColor) {
                addMove(r, c, 'c', target);
              }
            }
          }
        }

        // Castling
        const kingRow = color === 'w' ? 7 : 0;
        if (row === kingRow && col === 4) {
          const rights = this.castling[color];

          // Kingside Castle
          if (rights.k) {
            if (!board[kingRow][5] && !board[kingRow][6]) {
              const rook = board[kingRow][7];
              if (rook && rook.type === 'r' && rook.color === color) {
                if (!this.isSquareAttacked({ row: kingRow, col: 4 }, opponentColor, board) &&
                    !this.isSquareAttacked({ row: kingRow, col: 5 }, opponentColor, board) &&
                    !this.isSquareAttacked({ row: kingRow, col: 6 }, opponentColor, board)) {
                  addMove(kingRow, 6, 'k');
                }
              }
            }
          }

          // Queenside Castle
          if (rights.q) {
            if (!board[kingRow][1] && !board[kingRow][2] && !board[kingRow][3]) {
              const rook = board[kingRow][0];
              if (rook && rook.type === 'r' && rook.color === color) {
                if (!this.isSquareAttacked({ row: kingRow, col: 4 }, opponentColor, board) &&
                    !this.isSquareAttacked({ row: kingRow, col: 3 }, opponentColor, board) &&
                    !this.isSquareAttacked({ row: kingRow, col: 2 }, opponentColor, board)) {
                  addMove(kingRow, 2, 'q');
                }
              }
            }
          }
        }
      }

      return moves;
    }

    _generateMovesForColor(color, board = this.board) {
      const moves = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.color === color) {
            moves.push(...this._generatePseudoMoves(r, c, board));
          }
        }
      }
      return moves;
    }

    _isLegalMove(move) {
      const tempBoard = cloneBoard(this.board);
      const { fromRow, fromCol, toRow, toCol, piece, color, flagsStr, promotion } = move;

      tempBoard[toRow][toCol] = {
        type: promotion ? promotion.toLowerCase() : piece,
        color,
        square: coordsToSquare(toRow, toCol)
      };
      tempBoard[fromRow][fromCol] = null;

      // En passant: remove captured pawn
      if (flagsStr && flagsStr.includes('e')) {
        tempBoard[fromRow][toCol] = null;
      }

      // Castling: move rook
      if (flagsStr && flagsStr.includes('k')) {
        tempBoard[toRow][5] = tempBoard[toRow][7];
        tempBoard[toRow][7] = null;
      } else if (flagsStr && flagsStr.includes('q')) {
        tempBoard[toRow][3] = tempBoard[toRow][0];
        tempBoard[toRow][0] = null;
      }

      const kingCoords = this._findKing(color, tempBoard);
      if (!kingCoords) return false;
      const opponentColor = color === 'w' ? 'b' : 'w';
      return !this.isSquareAttacked(kingCoords, opponentColor, tempBoard);
    }

    /**
     * Compute Standard Algebraic Notation (SAN) for a legal move.
     */
    _moveToSAN(move, legalMovesForTurn) {
      if (move.flagsStr && move.flagsStr.includes('k')) return 'O-O';
      if (move.flagsStr && move.flagsStr.includes('q')) return 'O-O-O';

      let san = '';
      const isPawn = move.piece === 'p';
      const isCapture = Boolean(move.captured || (move.flagsStr && (move.flagsStr.includes('c') || move.flagsStr.includes('e'))));

      if (isPawn) {
        if (isCapture) {
          san += move.from[0] + 'x' + move.to;
        } else {
          san += move.to;
        }
        if (move.promotion) {
          san += '=' + move.promotion.toUpperCase();
        }
      } else {
        san += move.piece.toUpperCase();

        const candidates = (legalMovesForTurn || []).filter(m =>
          m.piece === move.piece &&
          m.to === move.to &&
          m.from !== move.from
        );

        if (candidates.length > 0) {
          const sameFile = candidates.some(m => m.from[0] === move.from[0]);
          const sameRank = candidates.some(m => m.from[1] === move.from[1]);

          if (!sameFile) {
            san += move.from[0];
          } else if (!sameRank) {
            san += move.from[1];
          } else {
            san += move.from;
          }
        }

        if (isCapture) {
          san += 'x';
        }
        san += move.to;
      }

      // Check / Checkmate suffix
      const undoData = this._applyMoveInternal(move);
      const inCheck = this.isCheck(this.turn);
      const isMate = inCheck && this._getAllLegalMoves().length === 0;
      this._undoMoveInternal(undoData);

      if (isMate) {
        san += '#';
      } else if (inCheck) {
        san += '+';
      }

      return san;
    }

    _getAllLegalMoves() {
      const pseudo = this._generateMovesForColor(this.turn);
      return pseudo.filter(m => this._isLegalMove(m));
    }

    /**
     * Returns legal moves.
     * If square is specified, returns legal moves starting from that square.
     * If square is omitted, returns all legal moves for current player.
     * 
     * Move object format:
     *   { from, to, piece, color, captured, promotion, flags, san }
     */
    getLegalMoves(square = null) {
      const allLegal = this._getAllLegalMoves();

      let filtered;
      if (square) {
        const targetSq = typeof square === 'string' ? square.toLowerCase() : null;
        if (!targetSq) return [];
        filtered = allLegal.filter(m => m.from === targetSq);
      } else {
        filtered = allLegal;
      }

      const result = filtered.map(m => {
        const san = this._moveToSAN(m, allLegal);
        const obj = {
          from: m.from,
          to: m.to,
          piece: m.piece,
          color: m.color,
          captured: m.captured,
          promotion: m.promotion,
          san,
          flags: m.flags,
          flagsStr: m.flagsStr,
          toString() { return this.to; }
        };
        return obj;
      });

      result.includes = function (val) {
        if (typeof val === 'string') {
          const lower = val.toLowerCase();
          return this.some(m => m.to === lower || m.san === val || (m.from + m.to) === lower);
        }
        return Array.prototype.includes.call(this, val);
      };

      result.destinations = result.map(m => m.to);

      return result;
    }

    _applyMoveInternal(move) {
      const { fromRow, fromCol, toRow, toCol, piece, color, flagsStr, promotion, captured } = move;

      const undoState = {
        move,
        captured,
        prevCastling: JSON.parse(JSON.stringify(this.castling)),
        prevEnPassant: this.enPassant,
        prevHalfmoveClock: this.halfmoveClock,
        prevFullmoveNumber: this.fullmoveNumber,
        prevTurn: this.turn,
        epCapturedSquare: null,
        epCapturedPiece: null
      };

      if (piece === 'p' || captured || (flagsStr && (flagsStr.includes('c') || flagsStr.includes('e')))) {
        this.halfmoveClock = 0;
      } else {
        this.halfmoveClock++;
      }

      if (this.turn === 'b') {
        this.fullmoveNumber++;
      }

      this.board[toRow][toCol] = {
        type: promotion ? promotion.toLowerCase() : piece,
        color,
        square: coordsToSquare(toRow, toCol)
      };
      this.board[fromRow][fromCol] = null;

      // Handle En Passant capture
      if (flagsStr && flagsStr.includes('e')) {
        undoState.epCapturedSquare = { row: fromRow, col: toCol };
        undoState.epCapturedPiece = this.board[fromRow][toCol];
        this.board[fromRow][toCol] = null;
      }

      // Set new En Passant target square if double pawn push
      if (flagsStr && flagsStr.includes('b')) {
        const epRow = color === 'w' ? fromRow - 1 : fromRow + 1;
        this.enPassant = coordsToSquare(epRow, fromCol);
      } else {
        this.enPassant = null;
      }

      // Handle Castling rook move
      if (flagsStr && flagsStr.includes('k')) {
        this.board[toRow][5] = { ...this.board[toRow][7], square: coordsToSquare(toRow, 5) };
        this.board[toRow][7] = null;
      } else if (flagsStr && flagsStr.includes('q')) {
        this.board[toRow][3] = { ...this.board[toRow][0], square: coordsToSquare(toRow, 3) };
        this.board[toRow][0] = null;
      }

      // Update Castling rights
      if (piece === 'k') {
        this.castling[color].k = false;
        this.castling[color].q = false;
      }
      if (piece === 'r') {
        if (fromRow === 7 && fromCol === 7) this.castling.w.k = false;
        else if (fromRow === 7 && fromCol === 0) this.castling.w.q = false;
        else if (fromRow === 0 && fromCol === 7) this.castling.b.k = false;
        else if (fromRow === 0 && fromCol === 0) this.castling.b.q = false;
      }
      if (captured === 'r') {
        if (toRow === 7 && toCol === 7) this.castling.w.k = false;
        else if (toRow === 7 && toCol === 0) this.castling.w.q = false;
        else if (toRow === 0 && toCol === 7) this.castling.b.k = false;
        else if (toRow === 0 && toCol === 0) this.castling.b.q = false;
      }

      this.turn = (this.turn === 'w') ? 'b' : 'w';

      return undoState;
    }

    _undoMoveInternal(undoState) {
      const {
        move,
        captured,
        prevCastling,
        prevEnPassant,
        prevHalfmoveClock,
        prevFullmoveNumber,
        prevTurn,
        epCapturedSquare,
        epCapturedPiece
      } = undoState;

      const { fromRow, fromCol, toRow, toCol, piece, color, flagsStr } = move;

      this.board[fromRow][fromCol] = { type: piece, color, square: coordsToSquare(fromRow, fromCol) };

      if (flagsStr && flagsStr.includes('e')) {
        this.board[toRow][toCol] = null;
        if (epCapturedSquare && epCapturedPiece) {
          this.board[epCapturedSquare.row][epCapturedSquare.col] = epCapturedPiece;
        }
      } else if (captured) {
        const opponentColor = color === 'w' ? 'b' : 'w';
        this.board[toRow][toCol] = { type: captured, color: opponentColor, square: coordsToSquare(toRow, toCol) };
      } else {
        this.board[toRow][toCol] = null;
      }

      if (flagsStr && flagsStr.includes('k')) {
        this.board[toRow][7] = { ...this.board[toRow][5], square: coordsToSquare(toRow, 7) };
        this.board[toRow][5] = null;
      } else if (flagsStr && flagsStr.includes('q')) {
        this.board[toRow][0] = { ...this.board[toRow][3], square: coordsToSquare(toRow, 0) };
        this.board[toRow][3] = null;
      }

      this.castling = prevCastling;
      this.enPassant = prevEnPassant;
      this.halfmoveClock = prevHalfmoveClock;
      this.fullmoveNumber = prevFullmoveNumber;
      this.turn = prevTurn;
    }

    /**
     * Executes a move on the board if legal.
     * Returns executed move object or null if illegal.
     */
    makeMove(moveInput, toArg = null, promoArg = null) {
      let from, to, promotion;

      if (typeof moveInput === 'string') {
        const trimmed = moveInput.trim();
        if (toArg && typeof toArg === 'string') {
          from = trimmed.toLowerCase();
          to = toArg.toLowerCase();
          promotion = promoArg ? promoArg.toLowerCase() : null;
        } else if (trimmed.length === 4 || (trimmed.length === 5 && !trimmed.includes('='))) {
          from = trimmed.slice(0, 2).toLowerCase();
          to = trimmed.slice(2, 4).toLowerCase();
          promotion = trimmed.length === 5 ? trimmed[4].toLowerCase() : null;
        } else {
          const legalMoves = this.getLegalMoves();
          const match = legalMoves.find(m =>
            m.san === trimmed ||
            m.san.replace(/[+#]/g, '') === trimmed.replace(/[+#]/g, '')
          );
          if (match) {
            from = match.from;
            to = match.to;
            promotion = match.promotion;
          } else {
            return null;
          }
        }
      } else if (typeof moveInput === 'object' && moveInput !== null) {
        from = moveInput.from ? moveInput.from.toLowerCase() : null;
        to = moveInput.to ? moveInput.to.toLowerCase() : null;
        promotion = moveInput.promotion ? moveInput.promotion.toLowerCase() : null;
      }

      if (!from || !to) return null;

      const allLegal = this._getAllLegalMoves();
      const matchedMove = allLegal.find(m => {
        if (m.from !== from || m.to !== to) return false;
        if (m.promotion) {
          const targetPromo = promotion || 'q';
          return m.promotion.toLowerCase() === targetPromo;
        }
        return true;
      });

      if (!matchedMove) return null;

      const san = this._moveToSAN(matchedMove, allLegal);

      // Determine rookMove for castling
      let rookMove = null;
      if (matchedMove.flagsStr && matchedMove.flagsStr.includes('k')) {
        rookMove = matchedMove.color === 'w' ? { from: 'h1', to: 'f1' } : { from: 'h8', to: 'f8' };
      } else if (matchedMove.flagsStr && matchedMove.flagsStr.includes('q')) {
        rookMove = matchedMove.color === 'w' ? { from: 'a1', to: 'd1' } : { from: 'a8', to: 'd8' };
      }

      // Apply move
      const undoState = this._applyMoveInternal(matchedMove);

      // Record captured piece
      if (matchedMove.captured) {
        if (matchedMove.color === 'w') {
          this.capturedPieces.w.push(matchedMove.captured);
        } else {
          this.capturedPieces.b.push(matchedMove.captured);
        }
      }

      const historyEntry = {
        from: matchedMove.from,
        to: matchedMove.to,
        piece: matchedMove.piece,
        color: matchedMove.color,
        captured: matchedMove.captured,
        promotion: matchedMove.promotion,
        flags: matchedMove.flags,
        flagsStr: matchedMove.flagsStr,
        rookMove,
        san,
        fen: this.exportFEN(),
        undoState
      };

      this.history.push(historyEntry);
      this._recordPosition();

      return {
        from: historyEntry.from,
        to: historyEntry.to,
        piece: historyEntry.piece,
        color: historyEntry.color,
        captured: historyEntry.captured,
        promotion: historyEntry.promotion,
        san: historyEntry.san,
        flags: historyEntry.flags,
        rookMove: historyEntry.rookMove
      };
    }

    /**
     * Undoes the last move played.
     */
    undo() {
      if (this.history.length === 0) return null;

      this._unrecordPosition();
      const lastEntry = this.history.pop();
      this._undoMoveInternal(lastEntry.undoState);

      // Revert captured pieces
      if (lastEntry.captured) {
        if (lastEntry.color === 'w') {
          this.capturedPieces.w.pop();
        } else {
          this.capturedPieces.b.pop();
        }
      }

      return {
        from: lastEntry.from,
        to: lastEntry.to,
        piece: lastEntry.piece,
        color: lastEntry.color,
        captured: lastEntry.captured,
        promotion: lastEntry.promotion,
        san: lastEntry.san,
        rookMove: lastEntry.rookMove
      };
    }

    /**
     * Checks if current turn is checkmated.
     */
    isCheckmate() {
      return this.isCheck(this.turn) && this._getAllLegalMoves().length === 0;
    }

    /**
     * Checks if current position is stalemate.
     */
    isStalemate() {
      return !this.isCheck(this.turn) && this._getAllLegalMoves().length === 0;
    }

    /**
     * Checks 50-move rule.
     */
    isFiftyMoveRule() {
      return this.halfmoveClock >= 100;
    }

    /**
     * Checks threefold repetition.
     */
    isThreefoldRepetition() {
      const key = this._getPositionKey();
      return (this.positionCounts[key] || 0) >= 3;
    }

    /**
     * Checks insufficient material.
     */
    isInsufficientMaterial() {
      const pieces = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = this.board[r][c];
          if (p) {
            pieces.push({ type: p.type, color: p.color, row: r, col: c });
          }
        }
      }

      if (pieces.some(p => p.type === 'p' || p.type === 'r' || p.type === 'q')) {
        return false;
      }

      // K vs K
      if (pieces.length === 2) return true;

      // K + Minor vs K
      if (pieces.length === 3) {
        return pieces.some(p => p.type === 'b' || p.type === 'n');
      }

      // K + B vs K + B (same color square)
      if (pieces.length === 4) {
        const bishops = pieces.filter(p => p.type === 'b');
        if (bishops.length === 2) {
          const wBishop = bishops.find(b => b.color === 'w');
          const bBishop = bishops.find(b => b.color === 'b');
          if (wBishop && bBishop) {
            const wSquareColor = (wBishop.row + wBishop.col) % 2;
            const bSquareColor = (bBishop.row + bBishop.col) % 2;
            return wSquareColor === bSquareColor;
          }
        }
      }

      return false;
    }

    /**
     * Returns true if any draw condition is met.
     */
    isDraw() {
      return (
        this.isStalemate() ||
        this.isFiftyMoveRule() ||
        this.isInsufficientMaterial() ||
        this.isThreefoldRepetition()
      );
    }

    /**
     * Returns human-readable draw reason or null.
     */
    getDrawReason() {
      if (this.isStalemate()) return 'stalemate';
      if (this.isFiftyMoveRule()) return '50-move rule';
      if (this.isInsufficientMaterial()) return 'insufficient material';
      if (this.isThreefoldRepetition()) return 'threefold repetition';
      return null;
    }

    /**
     * Returns whether game is over (checkmate or draw).
     */
    isGameOver() {
      return this.isCheckmate() || this.isDraw();
    }

    /**
     * Returns game status summary.
     */
    getGameStatus() {
      const inCheck = this.isCheck(this.turn);
      const kingInfo = this._findKing(this.turn);
      const kingSquare = kingInfo ? kingInfo.square : null;

      if (this.isCheckmate()) {
        const winner = this.turn === 'w' ? 'b' : 'w';
        return {
          over: true,
          winner,
          reason: 'checkmate',
          inCheck: true,
          turn: this.turn,
          kingSquare,
          description: `Checkmate! ${winner === 'w' ? 'White' : 'Black'} wins.`
        };
      }
      if (this.isDraw()) {
        const reason = this.getDrawReason();
        return {
          over: true,
          winner: null,
          reason,
          inCheck,
          turn: this.turn,
          kingSquare,
          description: `Draw by ${reason}.`
        };
      }
      return {
        over: false,
        winner: null,
        reason: 'in_progress',
        inCheck,
        turn: this.turn,
        kingSquare,
        description: `${this.turn === 'w' ? 'White' : 'Black'} to move${inCheck ? ' (in check)' : ''}.`
      };
    }

    /**
     * Returns captured pieces.
     * w: pieces captured by White
     * b: pieces captured by Black
     */
    getCapturedPieces() {
      return {
        w: [...this.capturedPieces.w],
        b: [...this.capturedPieces.b],
        whiteCaptured: [...this.capturedPieces.w],
        blackCaptured: [...this.capturedPieces.b]
      };
    }

    /**
     * Returns move history.
     */
    getHistory(options = { verbose: false }) {
      if (options && options.verbose) {
        return this.history.map(h => ({
          from: h.from,
          to: h.to,
          piece: h.piece,
          color: h.color,
          captured: h.captured,
          promotion: h.promotion,
          san: h.san,
          fen: h.fen,
          flags: h.flags,
          rookMove: h.rookMove
        }));
      }
      return this.history.map(h => h.san);
    }
  }

  // Static / Singleton API on ChessEngine for convenience
  const defaultGame = new ChessEngine();
  ChessEngine.ChessEngine = ChessEngine;
  ChessEngine.newGame = (fen) => defaultGame.newGame(fen);
  ChessEngine.reset = (fen) => defaultGame.reset(fen);
  ChessEngine.getBoard = () => defaultGame.getBoard();
  ChessEngine.getPiece = (square) => defaultGame.getPiece(square);
  ChessEngine.getTurn = () => defaultGame.getTurn();
  ChessEngine.getLegalMoves = (square) => defaultGame.getLegalMoves(square);
  ChessEngine.makeMove = (move, to, promo) => defaultGame.makeMove(move, to, promo);
  ChessEngine.undo = () => defaultGame.undo();
  ChessEngine.isCheck = (color) => defaultGame.isCheck(color);
  ChessEngine.isCheckmate = () => defaultGame.isCheckmate();
  ChessEngine.isStalemate = () => defaultGame.isStalemate();
  ChessEngine.isDraw = () => defaultGame.isDraw();
  ChessEngine.isFiftyMoveRule = () => defaultGame.isFiftyMoveRule();
  ChessEngine.isInsufficientMaterial = () => defaultGame.isInsufficientMaterial();
  ChessEngine.isThreefoldRepetition = () => defaultGame.isThreefoldRepetition();
  ChessEngine.getDrawReason = () => defaultGame.getDrawReason();
  ChessEngine.isGameOver = () => defaultGame.isGameOver();
  ChessEngine.getGameStatus = () => defaultGame.getGameStatus();
  ChessEngine.getCapturedPieces = () => defaultGame.getCapturedPieces();
  ChessEngine.getHistory = (opts) => defaultGame.getHistory(opts);
  ChessEngine.exportFEN = () => defaultGame.exportFEN();
  ChessEngine.loadFEN = (fen) => defaultGame.loadFEN(fen);

  return ChessEngine;
});
