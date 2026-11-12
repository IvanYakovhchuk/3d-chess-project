/**
 * Royal 3D Chess - Application Controller & UI Logic
 * 
 * Manages:
 * - ChessEngine & ChessScene3D integration
 * - Synthesized Web Audio API sound effects (move, capture, check, castle, victory)
 * - Game timers & clock controls (Unlimited, 5m, 10m, 15m)
 * - Material advantage & captured piece trays
 * - Move history with SAN notation & auto-scroll
 * - Camera presets, auto-flip on turn, and board theme switcher
 * - Pawn promotion modal (Q, R, B, N)
 * - Game over modal & PGN/FEN clipboard export
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. Synthesized Web Audio API Sound System
  // ==========================================================================
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.initialized = false;
    }

    _init() {
      if (this.initialized) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
          this.initialized = true;
        }
      } catch (e) {
        console.warn('Web Audio API not supported or blocked:', e);
      }
    }

    _resume() {
      this._init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }

    /**
     * Clean wooden tok / percussive move sound
     */
    playMove() {
      if (this.muted) return;
      this._resume();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    }

    /**
     * Heavy capture sound with low-end impact & snappy click
     */
    playCapture() {
      if (this.muted) return;
      this._resume();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Low thump
      const oscThump = this.ctx.createOscillator();
      const gainThump = this.ctx.createGain();
      oscThump.type = 'sine';
      oscThump.frequency.setValueAtTime(180, now);
      oscThump.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      gainThump.gain.setValueAtTime(0.5, now);
      gainThump.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      oscThump.connect(gainThump);
      gainThump.connect(this.ctx.destination);
      oscThump.start(now);
      oscThump.stop(now + 0.13);

      // Noise crack
      const bufferSize = this.ctx.sampleRate * 0.05;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(2, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      whiteNoise.start(now);
    }

    /**
     * Urgent dual-chime warning for Check
     */
    playCheck() {
      if (this.muted) return;
      this._resume();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [587.33, 880.0].forEach((freq, idx) => { // D5, A5
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.3, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.26);
      });
    }

    /**
     * Sliding double click for Castling
     */
    playCastle() {
      if (this.muted) return;
      this._resume();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [0, 0.12].forEach((offset) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, now + offset);
        osc.frequency.exponentialRampToValueAtTime(90, now + offset + 0.07);

        gain.gain.setValueAtTime(0.3, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.08);
      });
    }

    /**
     * Triumphant ascending fanfare for Checkmate / Victory
     */
    playVictory() {
      if (this.muted) return;
      this._resume();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C4, E4, G4, C5, E5, G5
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        gain.gain.setValueAtTime(0.28, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.46);
      });
    }

    /**
     * Gentle neutral chord for Draw
     */
    playDraw() {
      if (this.muted) return;
      this._resume();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [349.23, 440.0, 523.25].forEach((freq) => { // F, A, C
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.61);
      });
    }
  }

  // ==========================================================================
  // 2. Constants & Helpers
  // ==========================================================================
  const PIECE_SYMBOLS = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  };

  const PIECE_VALUES = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0
  };

  function formatTime(totalSeconds) {
    if (totalSeconds === null || totalSeconds === Infinity || (totalSeconds <= 0 && isNaN(totalSeconds))) {
      return '∞';
    }
    const secsCeil = Math.ceil(Math.max(0, totalSeconds));
    const mins = Math.floor(secsCeil / 60);
    const secs = secsCeil % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function formatDuration(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // ==========================================================================
  // 3. Application State & Controller Class
  // ==========================================================================
  class ChessApp {
    constructor() {
      // Core instances
      this.sound = new SoundManager();
      this.engine = null;
      this.scene = null;

      // Interaction state
      this.selectedSquare = null;
      this.currentLegalMoves = [];
      this.lastMove = null;
      this.pendingPromotion = null;
      this.autoFlip = false;
      this.currentTheme = 'classic';
      this.viewMode = '3d';

      // Timers & Clocks
      this.timeControl = 0; // 0 = unlimited, or seconds (e.g. 300, 600, 900)
      this.clocks = { w: 0, b: 0 };
      this.clockInterval = null;
      this.lastTickTime = null;
      this.gameStartTime = null;
      this.isGameOver = false;

      // DOM Cache
      this.dom = {};
    }

    init() {
      this._cacheDom();
      this._initEngine();
      this._initScene();
      this._bindUiEvents();
      this._bindKeyboardEvents();
      this._updateFullUi();
    }

    _cacheDom() {
      this.dom.canvasContainer = document.getElementById('chess-canvas-container');
      this.dom.turnBanner = document.getElementById('turn-banner');
      this.dom.bannerTurnIcon = document.getElementById('banner-turn-icon');
      this.dom.bannerMainText = document.getElementById('banner-main-text');
      this.dom.bannerSubText = document.getElementById('banner-sub-text');
      
      this.dom.themeSelector = document.getElementById('theme-selector');
      this.dom.btnSoundToggle = document.getElementById('btn-sound-toggle');
      this.dom.iconSoundOn = document.getElementById('icon-sound-on');
      this.dom.iconSoundOff = document.getElementById('icon-sound-off');
      this.dom.btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
      this.dom.gameSidebar = document.getElementById('game-sidebar');

      // 3D / 2D Mode Switcher
      this.dom.btnMode3D = document.getElementById('btn-mode-3d');
      this.dom.btnMode2D = document.getElementById('btn-mode-2d');
      this.dom.quickModeToggle = document.getElementById('quick-mode-toggle');
      this.dom.activeModeBadge = document.getElementById('active-mode-badge');

      this.dom.playerCardW = document.getElementById('player-card-w');
      this.dom.playerCardB = document.getElementById('player-card-b');
      this.dom.clockW = document.getElementById('clock-w');
      this.dom.clockB = document.getElementById('clock-b');
      this.dom.capturedW = document.getElementById('captured-w');
      this.dom.capturedB = document.getElementById('captured-b');
      this.dom.materialW = document.getElementById('material-w');
      this.dom.materialB = document.getElementById('material-b');

      this.dom.quickCamWhite = document.getElementById('quick-cam-white');
      this.dom.quickCamBlack = document.getElementById('quick-cam-black');
      this.dom.quickCamTop = document.getElementById('quick-cam-top');
      this.dom.quickCamFlip = document.getElementById('quick-cam-flip');

      this.dom.activeClockLabel = document.getElementById('active-clock-label');
      this.dom.tcButtons = document.querySelectorAll('.tc-btn');
      this.dom.moveCounter = document.getElementById('move-counter');
      this.dom.moveHistoryBody = document.getElementById('move-history-body');
      this.dom.moveHistoryContainer = document.getElementById('move-history-container');

      this.dom.toggleAutoflip = document.getElementById('toggle-autoflip');
      this.dom.btnNewGame = document.getElementById('btn-new-game');
      this.dom.btnUndoMove = document.getElementById('btn-undo-move');
      this.dom.btnCopyFen = document.getElementById('btn-copy-fen');
      this.dom.btnExportPgn = document.getElementById('btn-export-pgn');

      // Modals
      this.dom.modalPromotion = document.getElementById('modal-promotion');
      this.dom.promoChoiceBtns = document.querySelectorAll('.promo-choice-btn');
      this.dom.modalGameOver = document.getElementById('modal-game-over');
      this.dom.gameOverTitle = document.getElementById('game-over-title');
      this.dom.gameOverDesc = document.getElementById('game-over-desc');
      this.dom.statTotalMoves = document.getElementById('stat-total-moves');
      this.dom.statMatchTime = document.getElementById('stat-match-time');
      this.dom.statWinnerLabel = document.getElementById('stat-winner-label');
      this.dom.btnModalRematch = document.getElementById('btn-modal-rematch');
      this.dom.btnModalClose = document.getElementById('btn-modal-close');

      this.dom.toastContainer = document.getElementById('toast-container');
    }

    _initEngine() {
      if (typeof window.ChessEngine === 'function') {
        this.engine = new window.ChessEngine();
      } else if (window.ChessEngine && typeof window.ChessEngine.newGame === 'function') {
        this.engine = window.ChessEngine;
        this.engine.newGame();
      } else {
        console.error('ChessEngine is not found on window!');
      }
    }

    _initScene() {
      if (typeof window.ChessScene3D === 'function') {
        this.scene = new window.ChessScene3D(this.dom.canvasContainer, {
          onSquareClick: (square) => this.handleSquareClick(square),
          onPieceDrop: (fromSquare, toSquare) => this.handlePieceDrop(fromSquare, toSquare)
        });

        // Set initial theme and board layout
        if (this.scene.setTheme) {
          this.scene.setTheme(this.currentTheme);
        }
        if (this.scene.setViewMode && this.viewMode !== '3d') {
          this.scene.setViewMode(this.viewMode);
        }
        if (this.scene.setTurn && this.engine) {
          this.scene.setTurn(this.engine.getTurn());
        }
        if (this.scene.syncBoard && this.engine) {
          this.scene.syncBoard(this.engine.getBoard(), null);
        }
      } else {
        console.warn('ChessScene3D is not yet defined. Will retry when script loads...');
        const checkInterval = setInterval(() => {
          if (typeof window.ChessScene3D === 'function') {
            clearInterval(checkInterval);
            this._initScene();
          }
        }, 100);
      }
    }

    _bindUiEvents() {
      // Sound FX toggle
      this.dom.btnSoundToggle.addEventListener('click', () => {
        const isMuted = this.sound.toggleMute();
        this.dom.iconSoundOn.classList.toggle('hidden', isMuted);
        this.dom.iconSoundOff.classList.toggle('hidden', !isMuted);
        this.showToast(isMuted ? 'Sound muted' : 'Sound enabled');
      });

      // Mobile sidebar drawer toggle
      if (this.dom.btnSidebarToggle) {
        this.dom.btnSidebarToggle.addEventListener('click', () => {
          this.dom.gameSidebar.classList.toggle('open');
        });
      }

      // 3D / 2D Mode Switcher
      if (this.dom.btnMode3D) {
        this.dom.btnMode3D.addEventListener('click', () => this.setViewMode('3d'));
      }
      if (this.dom.btnMode2D) {
        this.dom.btnMode2D.addEventListener('click', () => this.setViewMode('2d'));
      }
      if (this.dom.quickModeToggle) {
        this.dom.quickModeToggle.addEventListener('click', () => this.toggleViewMode());
      }

      // Theme selector
      this.dom.themeSelector.addEventListener('change', (e) => {
        this.setTheme(e.target.value);
      });

      // Quick Camera controls
      this.dom.quickCamWhite.addEventListener('click', () => this.setCameraView('white'));
      this.dom.quickCamBlack.addEventListener('click', () => this.setCameraView('black'));
      this.dom.quickCamTop.addEventListener('click', () => this.setCameraView('top'));
      this.dom.quickCamFlip.addEventListener('click', () => this.flipCamera());

      // Auto-flip toggle
      this.dom.toggleAutoflip.addEventListener('change', (e) => {
        this.autoFlip = e.target.checked;
        this.showToast(this.autoFlip ? 'Auto-flip on turn enabled' : 'Auto-flip disabled');
        if (this.autoFlip && !this.isGameOver && this.engine) {
          this.setCameraView(this.engine.getTurn() === 'w' ? 'white' : 'black');
        }
      });

      // Time control buttons
      this.dom.tcButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const seconds = parseInt(btn.getAttribute('data-time'), 10);
          this.setTimeControl(seconds, btn.textContent.trim());
          this.dom.tcButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      // Main action buttons
      this.dom.btnNewGame.addEventListener('click', () => this.startNewGame());
      this.dom.btnUndoMove.addEventListener('click', () => this.undoMove());
      this.dom.btnCopyFen.addEventListener('click', () => this.copyFen());
      this.dom.btnExportPgn.addEventListener('click', () => this.copyPgn());

      // Pawn promotion buttons
      this.dom.promoChoiceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const pieceType = btn.getAttribute('data-promo');
          this.finishPromotion(pieceType);
        });
      });

      // Modal buttons
      this.dom.btnModalRematch.addEventListener('click', () => {
        this.dom.modalGameOver.classList.add('hidden');
        this.startNewGame();
      });
      this.dom.btnModalClose.addEventListener('click', () => {
        this.dom.modalGameOver.classList.add('hidden');
      });
    }

    _bindKeyboardEvents() {
      window.addEventListener('keydown', (e) => {
        // If promotion modal open, allow Q, R, B, N keys
        if (!this.dom.modalPromotion.classList.contains('hidden')) {
          const key = e.key.toLowerCase();
          if (['q', 'r', 'b', 'n'].includes(key)) {
            e.preventDefault();
            this.finishPromotion(key);
            return;
          }
        }

        // Global shortcuts:
        // 'u' for Undo
        if (e.key === 'u' || e.key === 'U') {
          if (!this.isGameOver && this.engine && this.engine.getHistory().length > 0) {
            this.undoMove();
          }
        }
        // 'f' for Flip
        if (e.key === 'f' || e.key === 'F') {
          this.flipCamera();
        }
        // 'v' for Toggle 3D / 2D View Mode
        if (e.key === 'v' || e.key === 'V') {
          this.toggleViewMode();
        }
        // 'Escape' closes modals
        if (e.key === 'Escape') {
          this.dom.modalGameOver.classList.add('hidden');
        }
      });
    }

    // ==========================================================================
    // 4. Game Interaction & Move Execution
    // ==========================================================================
    handleSquareClick(square) {
      if (this.isGameOver || !this.engine) return;

      const currentTurn = this.engine.getTurn();
      const clickedPiece = this.engine.getPiece(square);

      // Case 1: Nothing currently selected
      if (!this.selectedSquare) {
        if (clickedPiece && clickedPiece.color === currentTurn) {
          this._selectSquare(square);
        }
        return;
      }

      // Case 2: Clicked on the same selected square -> deselect
      if (this.selectedSquare === square) {
        this._clearSelection();
        return;
      }

      // Case 3: Clicked another piece of the current turn's color -> re-select
      if (clickedPiece && clickedPiece.color === currentTurn) {
        this._selectSquare(square);
        return;
      }

      // Case 4: Clicked on a destination square -> attempt move
      const matchingMove = this.currentLegalMoves.find(m => m.to === square);
      if (matchingMove) {
        // Check if pawn promotion is required
        if (this._isPromotionMove(this.selectedSquare, square)) {
          this._promptPromotion(this.selectedSquare, square);
        } else {
          this._executeMove({
            from: this.selectedSquare,
            to: square
          });
        }
      } else {
        // Invalid square clicked -> deselect
        this._clearSelection();
      }
    }

    handlePieceDrop(fromSquare, toSquare) {
      if (this.isGameOver || !this.engine) {
        if (this.scene && this.scene.syncBoard) {
          this.scene.syncBoard(this.engine.getBoard());
        }
        return;
      }

      // Verify legal move
      const legalMoves = this.engine.getLegalMoves(fromSquare);
      const isLegal = legalMoves.some(m => m.to === toSquare);

      if (!isLegal) {
        // Reset 3D mesh position
        if (this.scene && this.scene.syncBoard) {
          this.scene.syncBoard(this.engine.getBoard());
        }
        this._clearSelection();
        return;
      }

      // Legal move
      if (this._isPromotionMove(fromSquare, toSquare)) {
        this._promptPromotion(fromSquare, toSquare);
      } else {
        this._executeMove({ from: fromSquare, to: toSquare });
      }
    }

    _selectSquare(square) {
      this.selectedSquare = square;
      this.currentLegalMoves = this.engine.getLegalMoves(square);
      const destinations = this.currentLegalMoves.map(m => m.to);

      if (this.scene && this.scene.highlightSquares) {
        this.scene.highlightSquares({
          selected: square,
          legalMoves: destinations,
          lastMove: this.lastMove,
          checkSquare: this._getCheckSquare()
        });
      }
    }

    _clearSelection() {
      this.selectedSquare = null;
      this.currentLegalMoves = [];
      if (this.scene && this.scene.highlightSquares) {
        this.scene.highlightSquares({
          selected: null,
          legalMoves: [],
          lastMove: this.lastMove,
          checkSquare: this._getCheckSquare()
        });
      }
    }

    _isPromotionMove(from, to) {
      const piece = this.engine.getPiece(from);
      if (!piece || piece.type !== 'p') return false;
      const rank = to[1];
      return (piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1');
    }

    _promptPromotion(from, to) {
      this.pendingPromotion = { from, to };
      const turn = this.engine.getTurn();

      // Update symbols on promotion choice buttons
      const choices = ['q', 'r', 'b', 'n'];
      choices.forEach(type => {
        const iconEl = document.getElementById(`promo-icon-${type}`);
        if (iconEl) {
          iconEl.textContent = PIECE_SYMBOLS[turn][type];
        }
      });

      this.dom.modalPromotion.classList.remove('hidden');
    }

    finishPromotion(promotionPiece) {
      this.dom.modalPromotion.classList.add('hidden');
      if (!this.pendingPromotion) return;

      const { from, to } = this.pendingPromotion;
      this.pendingPromotion = null;

      this._executeMove({
        from,
        to,
        promotion: promotionPiece
      });
    }

    _executeMove(moveObj) {
      const turnBeforeMove = this.engine.getTurn();
      const executedMove = this.engine.makeMove(moveObj);

      if (!executedMove) {
        console.warn('Illegal move rejected by engine:', moveObj);
        if (this.scene && this.scene.syncBoard) {
          this.scene.syncBoard(this.engine.getBoard());
        }
        this._clearSelection();
        return;
      }

      // Record last move
      this.lastMove = { from: executedMove.from, to: executedMove.to };
      this.selectedSquare = null;
      this.currentLegalMoves = [];

      // Start clocks on first move if not already started
      if (!this.gameStartTime) {
        this.gameStartTime = Date.now();
        this._startClockInterval();
      } else if (this.lastTickTime !== null) {
        this.lastTickTime = performance.now();
      }

      // Trigger audio FX based on move flags
      this._playMoveAudio(executedMove);

      // Sync 3D Scene with animated pieces
      if (this.scene) {
        if (this.scene.setTurn) {
          this.scene.setTurn(this.engine.getTurn());
        }
        if (this.scene.syncBoard) {
          this.scene.syncBoard(this.engine.getBoard(), executedMove);
        }
      }

      // Update highlights for last move and check
      if (this.scene && this.scene.highlightSquares) {
        this.scene.highlightSquares({
          selected: null,
          legalMoves: [],
          lastMove: this.lastMove,
          checkSquare: this._getCheckSquare()
        });
      }

      // Auto-flip camera if enabled
      if (this.autoFlip && !this.engine.isGameOver()) {
        this.setCameraView(this.engine.getTurn() === 'w' ? 'white' : 'black');
      }

      // Update UI components
      this._updateFullUi();

      // Check for Game Over conditions
      if (this.engine.isGameOver()) {
        this._handleGameOver();
      }
    }

    _playMoveAudio(move) {
      const isCheck = this.engine.isCheck();
      const isMate = this.engine.isCheckmate();
      const isDraw = this.engine.isDraw();

      if (isMate) {
        this.sound.playVictory();
      } else if (isDraw) {
        this.sound.playDraw();
      } else if (isCheck) {
        this.sound.playCheck();
      } else if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
        this.sound.playCastle();
      } else if (move.captured || (move.flags && move.flags.includes('c'))) {
        this.sound.playCapture();
      } else {
        this.sound.playMove();
      }
    }

    _getCheckSquare() {
      if (!this.engine || !this.engine.isCheck()) return null;
      const turn = this.engine.getTurn();
      const board = this.engine.getBoard();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type === 'k' && piece.color === turn) {
            const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
            return files[c] + ranks[r];
          }
        }
      }
      return null;
    }

    // ==========================================================================
    // 5. Game Controls (New Game, Undo, Clocks, FEN, PGN)
    // ==========================================================================
    startNewGame() {
      if (this.engine) {
        this.engine.newGame();
      }
      this.selectedSquare = null;
      this.currentLegalMoves = [];
      this.lastMove = null;
      this.pendingPromotion = null;
      this.isGameOver = false;
      this.gameStartTime = null;

      // Reset Clocks
      this._resetClocks();

      // Reset 3D Scene
      if (this.scene) {
        if (this.scene.setTurn) {
          this.scene.setTurn(this.engine.getTurn());
        }
        if (this.scene.syncBoard) {
          this.scene.syncBoard(this.engine.getBoard(), null);
        }
        if (this.scene.highlightSquares) {
          this.scene.highlightSquares({ selected: null, legalMoves: [], lastMove: null, checkSquare: null });
        }
        this.setCameraView('white');
      }

      this._updateFullUi();
      this.showToast('New game started');
      this.sound.playMove();
    }

    undoMove() {
      if (!this.engine) return;
      const undone = this.engine.undo();
      if (!undone) {
        this.showToast('No moves to undo');
        return;
      }

      this.isGameOver = false;
      this.selectedSquare = null;
      this.currentLegalMoves = [];

      // Recover last move from history
      const history = this.engine.getHistory({ verbose: true });
      if (history.length > 0) {
        const prev = history[history.length - 1];
        this.lastMove = { from: prev.from, to: prev.to };
      } else {
        this.lastMove = null;
      }

      // Sync 3D Scene
      if (this.scene) {
        if (this.scene.setTurn) {
          this.scene.setTurn(this.engine.getTurn());
        }
        if (this.scene.syncBoard) {
          this.scene.syncBoard(this.engine.getBoard(), null);
        }
        if (this.scene.highlightSquares) {
          this.scene.highlightSquares({
            selected: null,
            legalMoves: [],
            lastMove: this.lastMove,
            checkSquare: this._getCheckSquare()
          });
        }
      }

      // Auto-flip camera view if enabled
      if (this.autoFlip) {
        this.setCameraView(this.engine.getTurn() === 'w' ? 'white' : 'black');
      }

      this._updateFullUi();
      this.sound.playMove();
      this.showToast(`Undid ${undone.san}`);
    }

    // ==========================================================================
    // 6. Clock & Timer Mechanics
    // ==========================================================================
    setTimeControl(seconds, label) {
      this.timeControl = seconds;
      this.dom.activeClockLabel.textContent = label;
      this._resetClocks();
      this._updateClockDisplays();
      this.showToast(`Time control: ${label}`);
    }

    _resetClocks() {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
      this.lastTickTime = null;
      if (this.timeControl > 0) {
        this.clocks.w = this.timeControl;
        this.clocks.b = this.timeControl;
      } else {
        this.clocks.w = null;
        this.clocks.b = null;
      }
    }

    startClock() {
      this._startClockInterval();
    }

    _startClockInterval() {
      if (this.timeControl <= 0) return;
      clearInterval(this.clockInterval);
      this.lastTickTime = performance.now();

      this.clockInterval = setInterval(() => {
        if (this.isGameOver) {
          clearInterval(this.clockInterval);
          return;
        }

        const now = performance.now();
        const elapsedSeconds = (now - this.lastTickTime) / 1000;
        this.lastTickTime = now;

        const turn = this.engine.getTurn();
        if (this.clocks[turn] !== null && this.clocks[turn] > 0) {
          this.clocks[turn] = Math.max(0, this.clocks[turn] - elapsedSeconds);
          this._updateClockDisplays();

          if (this.clocks[turn] <= 0) {
            this.clocks[turn] = 0;
            this._handleTimeout(turn);
          }
        }
      }, 100);
    }

    _handleTimeout(timedOutColor) {
      clearInterval(this.clockInterval);
      this.isGameOver = true;
      const winner = timedOutColor === 'w' ? 'Black' : 'White';
      this.sound.playVictory();

      this.dom.gameOverTitle.textContent = 'Time Out!';
      this.dom.gameOverDesc.textContent = `${timedOutColor === 'w' ? 'White' : 'Black'} ran out of time. ${winner} wins!`;
      this.dom.statWinnerLabel.textContent = winner;
      this.dom.statTotalMoves.textContent = this.engine.getHistory().length;
      this.dom.statMatchTime.textContent = this._getFormattedMatchDuration();

      this.dom.modalGameOver.classList.remove('hidden');
    }

    _updateClockDisplays() {
      if (this.clocks.w === null) {
        this.dom.clockW.textContent = '∞';
        this.dom.clockB.textContent = '∞';
        this.dom.clockW.classList.remove('low-time');
        this.dom.clockB.classList.remove('low-time');
        return;
      }

      this.dom.clockW.textContent = formatTime(this.clocks.w);
      this.dom.clockB.textContent = formatTime(this.clocks.b);

      this.dom.clockW.classList.toggle('low-time', this.clocks.w <= 30);
      this.dom.clockB.classList.toggle('low-time', this.clocks.b <= 30);
    }

    _getFormattedMatchDuration() {
      if (!this.gameStartTime) return '00:00';
      const elapsedSeconds = Math.floor((Date.now() - this.gameStartTime) / 1000);
      return formatDuration(elapsedSeconds);
    }

    // ==========================================================================
    // 7. Visual Themes & Camera Presets
    // ==========================================================================
    setTheme(themeName) {
      this.currentTheme = themeName;
      if (this.dom.themeSelector) {
        this.dom.themeSelector.value = themeName;
      }
      if (this.scene && this.scene.setTheme) {
        this.scene.setTheme(themeName);
      }
      if (window.ChessPieces3D && window.ChessPieces3D.setTheme) {
        window.ChessPieces3D.setTheme(themeName);
      }
      this.showToast(`Theme: ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}`);
    }

    /**
     * Switchable 3D <-> 2D Mode at any moment during the game
     * @param {'3d'|'2d'} mode 
     */
    setViewMode(mode) {
      if (mode !== '2d' && mode !== '3d') mode = '3d';
      this.viewMode = mode;

      if (this.dom.btnMode3D) {
        this.dom.btnMode3D.classList.toggle('active', mode === '3d');
      }
      if (this.dom.btnMode2D) {
        this.dom.btnMode2D.classList.toggle('active', mode === '2d');
      }
      if (this.dom.quickModeToggle) {
        this.dom.quickModeToggle.textContent = mode === '3d' ? '2D View' : '3D View';
      }
      if (this.dom.activeModeBadge) {
        this.dom.activeModeBadge.textContent = mode === '3d' ? '3D Mode' : '2D Mode';
      }

      if (this.scene && typeof this.scene.setViewMode === 'function') {
        this.scene.setViewMode(mode);
      }

      this.showToast(mode === '2d' ? 'Switched to 2D Top-Down View' : 'Switched to 3D Perspective');
    }

    toggleViewMode() {
      this.setViewMode(this.viewMode === '3d' ? '2d' : '3d');
    }

    setCameraView(viewName) {
      if (this.scene && this.scene.setCameraView) {
        this.scene.setCameraView(viewName);
      }
      this.dom.quickCamWhite.classList.toggle('active', viewName === 'white');
      this.dom.quickCamBlack.classList.toggle('active', viewName === 'black');
      this.dom.quickCamTop.classList.toggle('active', viewName === 'top');
    }

    flipCamera() {
      if (this.scene && this.scene.flipBoard) {
        this.scene.flipBoard();
      }
      this.dom.quickCamWhite.classList.remove('active');
      this.dom.quickCamBlack.classList.remove('active');
      this.dom.quickCamTop.classList.remove('active');
      this.showToast('Camera flipped 180°');
    }

    // ==========================================================================
    // 8. Game Over Handler
    // ==========================================================================
    _handleGameOver() {
      this.isGameOver = true;
      clearInterval(this.clockInterval);

      const status = this.engine.getGameStatus();
      const isMate = this.engine.isCheckmate();
      const isDraw = this.engine.isDraw();

      setTimeout(() => {
        if (isMate) {
          const winnerColor = this.engine.getTurn() === 'w' ? 'Black' : 'White';
          this.dom.gameOverTitle.textContent = 'Checkmate!';
          this.dom.gameOverDesc.textContent = `${winnerColor} wins the match by checkmate!`;
          this.dom.statWinnerLabel.textContent = winnerColor;
        } else if (isDraw) {
          const reason = this.engine.getDrawReason() || 'Draw';
          this.dom.gameOverTitle.textContent = 'Game Drawn!';
          this.dom.gameOverDesc.textContent = `Match drawn by ${reason}.`;
          this.dom.statWinnerLabel.textContent = 'Draw';
        }

        this.dom.statTotalMoves.textContent = this.engine.getHistory().length;
        this.dom.statMatchTime.textContent = this._getFormattedMatchDuration();
        this.dom.modalGameOver.classList.remove('hidden');
      }, 700);
    }

    // ==========================================================================
    // 9. UI Sync (Banner, Captured Pieces, Material, Move History)
    // ==========================================================================
    _updateFullUi() {
      this._updateStatusBanner();
      this._updatePlayerCards();
      this._updateCapturedPiecesAndMaterial();
      this._updateMoveHistory();
      this._updateClockDisplays();
    }

    _updateStatusBanner() {
      if (!this.engine) return;

      const turn = this.engine.getTurn();
      const isCheck = this.engine.isCheck();
      const isMate = this.engine.isCheckmate();
      const isDraw = this.engine.isDraw();

      const banner = this.dom.turnBanner;
      banner.className = 'status-banner';

      if (isMate) {
        const winner = turn === 'w' ? 'Black' : 'White';
        banner.classList.add('state-mate');
        this.dom.bannerTurnIcon.textContent = '🏆';
        this.dom.bannerMainText.textContent = `Checkmate - ${winner} Wins!`;
        this.dom.bannerSubText.textContent = 'Game concluded';
      } else if (isDraw) {
        const reason = this.engine.getDrawReason() || 'Draw';
        banner.classList.add('state-draw');
        this.dom.bannerTurnIcon.textContent = '🤝';
        this.dom.bannerMainText.textContent = 'Game Drawn';
        this.dom.bannerSubText.textContent = `Draw by ${reason}`;
      } else if (isCheck) {
        banner.classList.add('state-check');
        this.dom.bannerTurnIcon.textContent = '⚠️';
        this.dom.bannerMainText.textContent = `${turn === 'w' ? 'White' : 'Black'} in Check!`;
        this.dom.bannerSubText.textContent = 'Defend or move the King';
      } else {
        banner.classList.add(turn === 'w' ? 'turn-white' : 'turn-black');
        this.dom.bannerTurnIcon.textContent = turn === 'w' ? '♔' : '♚';
        this.dom.bannerMainText.textContent = `${turn === 'w' ? 'White' : 'Black'}'s Turn`;
        this.dom.bannerSubText.textContent = 'Select a piece to move';
      }
    }

    _updatePlayerCards() {
      if (!this.engine) return;
      const turn = this.engine.getTurn();
      this.dom.playerCardW.classList.toggle('active-turn', turn === 'w' && !this.isGameOver);
      this.dom.playerCardB.classList.toggle('active-turn', turn === 'b' && !this.isGameOver);
    }

    _updateCapturedPiecesAndMaterial() {
      if (!this.engine) return;

      const captured = this.engine.getCapturedPieces ? this.engine.getCapturedPieces() : { w: [], b: [] };
      const whiteCaptures = captured.w || []; // Pieces captured by White (black pieces)
      const blackCaptures = captured.b || []; // Pieces captured by Black (white pieces)

      // Render White captures (captured by White)
      this.dom.capturedW.innerHTML = '';
      let whiteScore = 0;
      whiteCaptures.forEach(pieceType => {
        const span = document.createElement('span');
        span.className = 'captured-piece-pill';
        span.textContent = PIECE_SYMBOLS.b[pieceType] || pieceType;
        this.dom.capturedW.appendChild(span);
        whiteScore += PIECE_VALUES[pieceType] || 0;
      });

      // Render Black captures (captured by Black)
      this.dom.capturedB.innerHTML = '';
      let blackScore = 0;
      blackCaptures.forEach(pieceType => {
        const span = document.createElement('span');
        span.className = 'captured-piece-pill';
        span.textContent = PIECE_SYMBOLS.w[pieceType] || pieceType;
        this.dom.capturedB.appendChild(span);
        blackScore += PIECE_VALUES[pieceType] || 0;
      });

      // Material Advantage Difference
      const diff = whiteScore - blackScore;
      if (diff > 0) {
        this.dom.materialW.textContent = `+${diff}`;
        this.dom.materialW.classList.remove('hidden');
        this.dom.materialB.classList.add('hidden');
      } else if (diff < 0) {
        this.dom.materialB.textContent = `+${Math.abs(diff)}`;
        this.dom.materialB.classList.remove('hidden');
        this.dom.materialW.classList.add('hidden');
      } else {
        this.dom.materialW.classList.add('hidden');
        this.dom.materialB.classList.add('hidden');
      }
    }

    _updateMoveHistory() {
      if (!this.engine) return;

      const history = this.engine.getHistory({ verbose: true });
      this.dom.moveCounter.textContent = `${history.length} move${history.length === 1 ? '' : 's'}`;

      if (history.length === 0) {
        this.dom.moveHistoryBody.innerHTML = `
          <tr class="empty-history-row">
            <td colspan="3">Moves will appear here...</td>
          </tr>
        `;
        return;
      }

      let html = '';
      for (let i = 0; i < history.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = history[i];
        const blackMove = history[i + 1];

        const isLastWhite = i === history.length - 1;
        const isLastBlack = (i + 1) === history.length - 1;

        html += `
          <tr>
            <td class="col-num">${moveNum}.</td>
            <td class="col-white ${isLastWhite ? 'active-move' : ''}">${whiteMove ? whiteMove.san : ''}</td>
            <td class="col-black ${isLastBlack ? 'active-move' : ''}">${blackMove ? blackMove.san : ''}</td>
          </tr>
        `;
      }

      this.dom.moveHistoryBody.innerHTML = html;

      // Auto-scroll to bottom of table
      this.dom.moveHistoryContainer.scrollTop = this.dom.moveHistoryContainer.scrollHeight;
    }

    // ==========================================================================
    // 10. FEN / PGN Clipboard Export & Toasts
    // ==========================================================================
    copyFen() {
      if (!this.engine) return;
      const fen = this.engine.exportFEN();
      navigator.clipboard.writeText(fen).then(() => {
        this.showToast('FEN copied to clipboard!');
      }).catch(() => {
        // Fallback
        prompt('Copy FEN:', fen);
      });
    }

    copyPgn() {
      if (!this.engine) return;
      const history = this.engine.getHistory({ verbose: true });
      const now = new Date();
      const dateStr = `${now.getFullYear()}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getDate().toString().padStart(2, '0')}`;

      let resultStr = '*';
      if (this.engine.isCheckmate()) {
        resultStr = this.engine.getTurn() === 'w' ? '0-1' : '1-0';
      } else if (this.engine.isDraw()) {
        resultStr = '1/2-1/2';
      }

      let pgn = `[Event "Royal 3D Chess Match"]\n`;
      pgn += `[Site "Browser"]\n`;
      pgn += `[Date "${dateStr}"]\n`;
      pgn += `[White "Player 1"]\n`;
      pgn += `[Black "Player 2"]\n`;
      pgn += `[Result "${resultStr}"]\n\n`;

      for (let i = 0; i < history.length; i += 2) {
        const num = Math.floor(i / 2) + 1;
        const w = history[i].san;
        const b = history[i + 1] ? history[i + 1].san : '';
        pgn += `${num}. ${w} ${b} `.trim() + ' ';
      }

      pgn += resultStr;

      navigator.clipboard.writeText(pgn).then(() => {
        this.showToast('PGN copied to clipboard!');
      }).catch(() => {
        prompt('Copy PGN:', pgn);
      });
    }

    showToast(message, duration = 3000) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      this.dom.toastContainer.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, duration);
    }
  }

  // ==========================================================================
  // 11. Bootstrapping
  // ==========================================================================
  function initApp() {
    if (!window.chessApp) {
      window.chessApp = new ChessApp();
      window.chessApp.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
