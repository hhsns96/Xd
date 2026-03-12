/**
 * game.js - Main game orchestrator and entry point
 * Imported as ES6 module from index.html
 */

import { GameLoop, InputManager, Camera }       from './engine.js';
import { AudioSystem }                           from './audio.js';
import { TileMap, TILE_SIZE, WORLD_SIZE }        from './map.js';
import { Player, NPC, Guard, spawnNPCs, NPC_TYPE } from './entities.js';
import {
  DrugSystem, TransactionSystem, TimeSystem, EconomySystem,
  TRANSACTION_RESULT, DRUGS,
} from './systems.js';
import { HUD, GameHUD, OverlayManager }          from './hud.js';
import { EventLog }                              from './events.js';

// ─── Game States ─────────────────────────────────────────────────────────────
const STATE = Object.freeze({
  START:       'START',
  BASE_SELECT: 'BASE_SELECT',
  PLAYING:     'PLAYING',
  PAUSED:      'PAUSED',
  BUSTED:      'BUSTED',
  WIN:         'WIN',
});

// ─────────────────────────────────────────────────────────────────────────────
// Game
// ─────────────────────────────────────────────────────────────────────────────
class Game {
  constructor() {
    // Canvases
    this.mainCanvas = document.getElementById('game-canvas');
    this.miniCanvas = document.getElementById('mini-screen');
    this.mainCtx    = this.mainCanvas.getContext('2d');

    // Core systems
    this.loop    = new GameLoop();
    this.input   = new InputManager();
    this.audio   = new AudioSystem();
    this.overlay = new OverlayManager();

    // Game state
    this.state = STATE.START;

    // Runtime objects (created on game start)
    this.map        = null;
    this.player     = null;
    this.npcs       = [];
    this.guards     = [];
    this.camera     = null;
    this.drugSystem = null;
    this.txSystem   = null;
    this.timeSystem = null;
    this.economy    = null;
    this.eventLog   = null;
    this.miniHud    = null;
    this.gameHud    = null;

    this._nightOverlay    = 0;
    this._npcRespawnTimer = 0;
    this._difficultyTimer = 0;
    this._selectedDrug    = 'weed';
    this._winFired        = false;

    this._bindUI();
    this.overlay.show('start');

    // Start the game loop immediately (renders start screen animation)
    this.loop.start(dt => this._update(dt), () => this._render());
  }

  // ── UI event bindings ─────────────────────────────────────────────────────
  _bindUI() {
    document.getElementById('btn-start-game')
      ?.addEventListener('click', () => {
        this.audio.resume();
        this._goToBaseSelect();
      });

    document.getElementById('btn-after-busted')
      ?.addEventListener('click', () => {
        this.audio.resume();
        this._releasedFromJail();
      });

    document.getElementById('btn-restart')
      ?.addEventListener('click', () => location.reload());

    document.getElementById('btn-resume')
      ?.addEventListener('click', () => this._resume());

    document.getElementById('btn-restart-pause')
      ?.addEventListener('click', () => location.reload());

    // Virtual D-pad
    const dpadMap = {
      'dpad-up': 'up', 'dpad-down': 'down',
      'dpad-left': 'left', 'dpad-right': 'right',
    };
    for (const [id, btn] of Object.entries(dpadMap)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.input.pressVirtualButton(btn);
        el.classList.add('pressed');
      });
      const up = e => {
        e.preventDefault();
        this.input.releaseVirtualButton(btn);
        el.classList.remove('pressed');
      };
      el.addEventListener('pointerup',    up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel',up);
    }

    // A / B / SELECT / START buttons
    const actionMap = {
      'btn-a': 'a', 'btn-b': 'b',
      'btn-select': 'select', 'btn-start': 'start',
    };
    for (const [id, btn] of Object.entries(actionMap)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.audio.resume();
        this.input.pressVirtualButton(btn);
        this.audio.playClick();
      });
      const up = e => {
        e.preventDefault();
        this.input.releaseVirtualButton(btn);
      };
      el.addEventListener('pointerup',    up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel',up);
    }

    // Toggle d-pad / joystick
    document.getElementById('toggle-control')
      ?.addEventListener('click', () => this._toggleControlMode());

    // Joystick
    this._setupJoystick();

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        if (this.state === STATE.PLAYING) this._pause();
        else if (this.state === STATE.PAUSED) this._resume();
      }
      if (e.code === 'KeyQ' && this.state === STATE.PLAYING) {
        this._cycleSelectedDrug();
      }
    });

    this.mainCanvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _setupJoystick() {
    const base  = document.getElementById('joystick-base');
    const thumb = document.getElementById('joystick-thumb');
    if (!base || !thumb) return;

    let active = false, originX = 0, originY = 0;
    const maxR = 26;

    const getTouch = e => e.touches ? e.touches[0] : e;

    const onStart = e => {
      e.preventDefault();
      this.audio.resume();
      active = true;
      const rect = base.getBoundingClientRect();
      originX = rect.left + rect.width / 2;
      originY = rect.top  + rect.height / 2;
    };
    const onMove = e => {
      if (!active) return;
      e.preventDefault();
      const t = getTouch(e);
      let dx = t.clientX - originX, dy = t.clientY - originY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
      thumb.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.setJoystick(dx / maxR, dy / maxR);
    };
    const onEnd = e => {
      e.preventDefault();
      active = false;
      thumb.style.transform = 'translate(0,0)';
      this.input.setJoystick(0, 0);
    };

    base.addEventListener('touchstart',  onStart, { passive: false });
    base.addEventListener('touchmove',   onMove,  { passive: false });
    base.addEventListener('touchend',    onEnd,   { passive: false });
    base.addEventListener('touchcancel', onEnd,   { passive: false });
    // Mouse fallback
    base.addEventListener('mousedown',   onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onEnd);
  }

  _toggleControlMode() {
    const dpad = document.getElementById('dpad');
    const joy  = document.getElementById('joystick-container');
    if (!dpad || !joy) return;
    const showDpad = dpad.classList.contains('hidden');
    dpad.classList.toggle('hidden', !showDpad);
    joy.classList.toggle('hidden',   showDpad);
    this.audio.playClick();
  }

  // ── State transitions ─────────────────────────────────────────────────────
  _goToBaseSelect() {
    this._initSystems();
    const candidates = this.map.getHomeCandidates(7);
    this.overlay.populateBaseSelect(candidates, (cand) => {
      this.audio.playClick();
      this._startGame(cand);
    });
    this.overlay.show('base-select');
    this.state = STATE.BASE_SELECT;
  }

  _initSystems() {
    this.map        = new TileMap(Date.now() & 0xFFFF);
    this.map.bakeToCanvas();
    this.timeSystem = new TimeSystem();
    this.drugSystem = new DrugSystem();
    this.txSystem   = new TransactionSystem(this.drugSystem, this.timeSystem);
    this.economy    = new EconomySystem(this.timeSystem);
    this.eventLog   = new EventLog(6);
    this.miniHud    = new HUD(this.miniCanvas);
    this.gameHud    = new GameHUD();
    this.npcs       = spawnNPCs(this.map, 55);
  }

  _startGame(homeCand) {
    this.overlay.hide();
    this.state = STATE.PLAYING;
    this._winFired = false;

    const hx = homeCand.worldX + (homeCand.tw * TILE_SIZE) / 2;
    const hy = homeCand.worldY + (homeCand.th * TILE_SIZE) / 2;

    this.player = new Player(hx, hy);
    this.player.setHome(hx, hy);
    this.player.economy = this.economy;
    this.player.setStepCallback(() => this.audio.playStep());

    this.camera = new Camera(this.mainCanvas.width, this.mainCanvas.height);
    this.camera.x = hx - this.mainCanvas.width  / (2 * this.camera.zoom);
    this.camera.y = hy - this.mainCanvas.height / (2 * this.camera.zoom);

    // Starter inventory
    this.player.addDrug('weed', 3);

    this.eventLog.push('Zaczynasz nowe życie. Pierwsze kroki.');
    this.eventLog.push('Masz 3x Grass i $50. Powodzenia.');
  }

  _pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.overlay.show('pause');
  }

  _resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.overlay.hide();
  }

  _bust(lostDrugs, lostMoney) {
    this.state = STATE.BUSTED;
    this.audio.playBusted();
    this.overlay.showBusted(lostDrugs, lostMoney);
  }

  _releasedFromJail() {
    this.player.hp      = 50;
    this.player.fatigue = 40;
    this.player.burnout = 60;
    this.player.x = this.player.homeX;
    this.player.y = this.player.homeY;
    this.state = STATE.PLAYING;
    this.overlay.hide();
    this.eventLog.push('Wyszedłeś z pierdla. Zaczynasz od nowa.');
    for (const npc of this.npcs) npc.hasDealt = false;
  }

  _win() {
    if (this._winFired) return;
    this._winFired = true;
    this.state = STATE.WIN;
    this.audio.playLevelUp();
    this.overlay.showWin(this.player.money, this.timeSystem.totalDays());
  }

  _cycleSelectedDrug() {
    if (!this.player) return;
    const have = Object.keys(this.player.inventory).filter(k => this.player.inventory[k] > 0);
    if (have.length === 0) return;
    const idx = have.indexOf(this._selectedDrug);
    this._selectedDrug = have[(idx + 1) % have.length];
    this.gameHud?.showPrompt(`Wybrany: ${DRUGS[this._selectedDrug]?.name || this._selectedDrug}`, 2);
  }

  // ── Main update ───────────────────────────────────────────────────────────
  _update(dt) {
    this.input.update();

    if (this.state === STATE.START) return;

    if (this.state === STATE.BASE_SELECT) {
      if (this.timeSystem) this.timeSystem.update(dt * 0.1);
      return;
    }

    if (this.state !== STATE.PLAYING) return;

    const p = this.player;
    if (!p) return;

    // ── Systems ─────────────────────────────────────
    this.timeSystem.update(dt);
    this.drugSystem.update(dt);
    this.txSystem.update(dt);

    // Passive income
    const income = this.economy.update(dt);
    if (income > 0) {
      p.money += income;
      this.eventLog.push(`Przychód pasywny: +$${income}`);
    }

    // Atmospheric events
    const evResult = this.eventLog.update(dt);
    if (evResult?.money) {
      p.money += evResult.money;
    }

    // HUD
    this.gameHud.update(dt);

    // ── Player ──────────────────────────────────────
    p.update(dt, this.input, this.map);

    // Passive rest at home
    if (p.isAtHome) {
      p._restTimer = (p._restTimer || 0) + dt;
      if (p._restTimer >= 5) {
        p._restTimer = 0;
        p.rest();
      }
    } else {
      p._restTimer = 0;
    }

    // ── NPCs ─────────────────────────────────────────
    for (const npc of this.npcs) {
      npc.update(dt, p, this.map);
      if (npc.type === NPC_TYPE.CRACKHEAD && npc.isAngry) {
        if (npc.tryAttack(p)) this.audio.playAttack();
      }
    }

    // ── Guards ───────────────────────────────────────
    for (const guard of this.guards) {
      guard.update(dt, this.npcs, this.map);
    }

    // ── Camera ───────────────────────────────────────
    this.camera.follow(p, WORLD_SIZE, WORLD_SIZE);

    // Night overlay fade
    const targetNight = this.timeSystem.isNight() ? 0.35 : 0;
    this._nightOverlay += (targetNight - this._nightOverlay) * 0.01;

    // ── Difficulty ramp (every 7 game-days ~ 1008 real-sec) ─────────────────
    this._difficultyTimer += dt;
    if (this._difficultyTimer >= 1008) {
      this._difficultyTimer = 0;
      this.txSystem.increaseRisk();
      this.eventLog.push('Policja się mobilizuje. Ryzyko wzrosło.');
    }

    // ── NPC respawn (every 15 real seconds) ──────────────────────────────────
    this._npcRespawnTimer += dt;
    if (this._npcRespawnTimer >= 15) {
      this._npcRespawnTimer = 0;
      this._respawnNPCs();
    }

    // ── Input actions ────────────────────────────────
    if (this.input.wasPressed('a')) this._handleAButton();
    if (this.input.wasPressed('b')) this._handleBButton();
    if (this.input.wasPressed('start')) this._pause();

    // ── Death check ──────────────────────────────────
    if (p.hp <= 0) this._handlePlayerDeath();

    // ── Win check ────────────────────────────────────
    if (p.money + this.economy.cryptoWallet >= 1_000_000) this._win();
  }

  _handleAButton() {
    const p = this.player;
    if (!p) return;

    if (p.isAtHome) {
      this._craftAtHome();
      return;
    }

    // Auto-select a drug if current selection is empty
    if (!p.hasDrug(this._selectedDrug)) {
      const have = Object.keys(p.inventory).filter(k => p.inventory[k] > 0);
      if (have.length === 0) {
        this.gameHud.showPrompt('Brak towaru! Crafuj w domu.', 2);
        this.audio.playTransactionFail();
        return;
      }
      this._selectedDrug = have[0];
    }

    const result = this.txSystem.attemptDeal(p, this.npcs, this._selectedDrug, 1);

    switch (result.result) {
      case TRANSACTION_RESULT.SUCCESS:
        this.audio.playTransactionSuccess();
        this.audio.playMoney();
        this.gameHud.flash(`+$${result.price}`, 1.2, '#39ff14');
        this.eventLog.push(`Sprzedałeś ${DRUGS[this._selectedDrug]?.name}. +$${result.price}`);
        if (result.npc) {
          // NPC wanders away
          result.npc._dirX = (Math.random() - 0.5) * 2;
          result.npc._dirY = (Math.random() - 0.5) * 2;
          result.npc._moveTimer = 5;
        }
        // Guards earn XP
        for (const g of this.guards) {
          if (g.earnXP(10)) {
            this.audio.playLevelUp();
            this.eventLog.push(`Ochroniarz awansował na poziom ${g.level}!`);
          }
        }
        break;

      case TRANSACTION_RESULT.BUSTED: {
        const { lostDrugs, lostMoney } = this.economy.processBust(p);
        this._bust(lostDrugs, lostMoney);
        break;
      }

      case TRANSACTION_RESULT.FAIL:
        this.audio.playTransactionFail();
        this.gameHud.showPrompt('Odszedł. Nie chce gadać.', 1.5);
        break;

      case TRANSACTION_RESULT.NO_DRUGS:
        this.gameHud.showPrompt('Brak towaru!', 1.5);
        this.audio.playTransactionFail();
        break;

      case TRANSACTION_RESULT.NO_NPC:
        this.gameHud.showPrompt('Brak klientów w pobliżu.', 1.5);
        break;
    }
  }

  _handleBButton() {
    const p = this.player;
    if (!p) return;

    if (p.isAtHome) {
      p.rest();
      this.audio.playMoney();
      this.gameHud.showPrompt('Odpoczynek... +HP, -Zmęczenie', 2);
      this.eventLog.push('Odpoczęłeś. Zdrowie +15%.');
      return;
    }

    // Sprint burst away from danger
    this.gameHud.showPrompt('Nogi za pas!', 1);
    const origSpeed = p.speed;
    p.speed = origSpeed * 1.8;
    setTimeout(() => { if (p) p.speed = origSpeed; }, 1500);
  }

  _craftAtHome() {
    const p = this.player;
    const drug = DRUGS[this._selectedDrug];

    // If it's a base drug with a craft cost, craft it
    if (drug && drug.craftCost > 0) {
      if (p.money < drug.craftCost) {
        this.gameHud.showPrompt(`Brak kasy. Potrzebujesz $${drug.craftCost}.`, 2);
        this.audio.playTransactionFail();
        return;
      }
      p.money -= drug.craftCost;
      p.addDrug(this._selectedDrug, 1);
      this.audio.playMoney();
      this.gameHud.flash(`+1 ${drug.name}`, 1, '#39ff14');
      this.eventLog.push(`Zrobiłeś 1x ${drug.name} za $${drug.craftCost}.`);
      return;
    }

    // Otherwise try to mix drugs
    this._tryMix();
  }

  _tryMix() {
    const p = this.player;
    const have = Object.keys(p.inventory).filter(k => p.inventory[k] > 0);
    if (have.length < 2) {
      this.gameHud.showPrompt('Potrzebujesz 2 różnych dragów.', 2);
      return;
    }
    for (let i = 0; i < have.length; i++) {
      for (let j = i + 1; j < have.length; j++) {
        const recipe = this.drugSystem.findMix(have[i], have[j]);
        if (recipe) {
          p.removeDrug(recipe.inputs[0], 1);
          p.removeDrug(recipe.inputs[1], 1);
          p.addDrug(recipe.output, 1);
          this.audio.playLevelUp();
          this.gameHud.flash(`MIESZANINA: ${DRUGS[recipe.output]?.name}!`, 2, '#fff200');
          this.eventLog.push(`Mix: ${DRUGS[recipe.inputs[0]]?.name} + ${DRUGS[recipe.inputs[1]]?.name} = ${DRUGS[recipe.output]?.name}`);
          return;
        }
      }
    }
    this.gameHud.showPrompt('Brak receptury dla tych dragów.', 2);
  }

  _handlePlayerDeath() {
    this.player.hp = Math.max(1, Math.floor(this.player.maxHp * 0.5));
    this.player.money = Math.floor(this.player.money * 0.7);
    this.player.x = this.player.homeX;
    this.player.y = this.player.homeY;
    this.player._invincibleTimer = 3;
    this.gameHud.flash('KO! Wróciłeś do domu.', 2.5, '#ff4444');
    this.eventLog.push('Dostałeś w twarz. Wróciłeś do bazy.');
    this.audio.playAttack();
  }

  _respawnNPCs() {
    const types = [NPC_TYPE.NORMAL, NPC_TYPE.NORMAL, NPC_TYPE.CLIENT, NPC_TYPE.CRACKHEAD];
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (npc.isDead || npc.hasDealt) {
        const sp   = this.map.randomWalkable();
        const type = types[Math.floor(Math.random() * types.length)];
        this.npcs[i] = new NPC(sp.x, sp.y, type);
      }
    }
  }

  // ── Main render ───────────────────────────────────────────────────────────
  _render() {
    const ctx = this.mainCtx;
    const W = this.mainCanvas.width, H = this.mainCanvas.height;

    ctx.fillStyle = '#0a000f';
    ctx.fillRect(0, 0, W, H);

    if (this.state === STATE.START) {
      this._renderStartBackground(ctx, W, H);
      return;
    }

    if (this.state === STATE.BASE_SELECT) {
      this._renderStartBackground(ctx, W, H);
      return;
    }

    if (!this.camera || !this.player) return;

    // World-space rendering
    this.camera.apply(ctx);
    if (this.map) this.map.render(ctx, this.camera);
    for (const npc of this.npcs) npc.render(ctx, this.camera);
    for (const g   of this.guards) g.render(ctx, this.camera);
    this.player.render(ctx, this.camera);

    // Night vignette (world-space semi-transparent overlay)
    if (this._nightOverlay > 0) {
      const visW = W / this.camera.zoom;
      const visH = H / this.camera.zoom;
      ctx.fillStyle = `rgba(0,0,30,${this._nightOverlay.toFixed(2)})`;
      ctx.fillRect(this.camera.x, this.camera.y, visW, visH);
    }

    this.camera.restore(ctx);

    // Screen-space HUD
    const nearby = this._findNearbyNPC();
    this.gameHud.render(ctx, W, H, this.player, nearby, this.camera, this.loop.fps);

    // Mini-screen HUD canvas
    if (this.miniHud && this.eventLog && this.timeSystem) {
      this.miniHud.render(this.player, this.timeSystem, this.eventLog);
    }
  }

  _findNearbyNPC() {
    if (!this.player) return null;
    let closest = null, closestD = 48;
    for (const npc of this.npcs) {
      if (npc.isDead) continue;
      const dx = npc.x - this.player.x, dy = npc.y - this.player.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < closestD) { closest = npc; closestD = d; }
    }
    return closest;
  }

  _renderStartBackground(ctx, W, H) {
    const t = performance.now() / 1000;
    ctx.fillStyle = '#12062a';
    ctx.fillRect(0, 0, W, H);

    // Animated diagonal neon lines
    ctx.save();
    ctx.strokeStyle = '#ff2d7820';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const y = ((t * 25 + i * 55) % (H + 80)) - 40;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + 40);
      ctx.stroke();
    }
    ctx.strokeStyle = '#00ffff10';
    for (let i = 0; i < 6; i++) {
      const y = ((-t * 15 + i * 90) % (H + 80) + H + 80) % (H + 80) - 40;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y - 25);
      ctx.stroke();
    }
    ctx.restore();

    // Centered title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pulse = 0.7 + 0.3 * Math.sin(t * 2);
    ctx.font = `bold ${Math.floor(W * 0.1)}px monospace`;
    ctx.fillStyle = `rgba(255,45,120,${pulse})`;
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur  = 30;
    ctx.fillText('DEALERZ', W / 2, H / 2);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas resize — maintain 4:3 ratio inside screen-container
// ─────────────────────────────────────────────────────────────────────────────
function resizeCanvas() {
  const container = document.getElementById('screen-container');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  let w = rect.width, h = w * (3 / 4);
  if (h > rect.height) { h = rect.height; w = h * (4 / 3); }
  const canvas = document.getElementById('game-canvas');
  if (canvas) {
    canvas.style.width  = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(h)}px`;
  }
}

window.addEventListener('resize', resizeCanvas);
// Small delay to ensure layout is painted before measuring
setTimeout(resizeCanvas, 100);

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────
window._game = new Game();
