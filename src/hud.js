/**
 * hud.js - HUD rendering on the mini-screen canvas, and overlay management
 * All rendering uses Canvas2D on the 200×120 mini-screen canvas
 */

import { DRUGS, BUSINESSES } from './systems.js';

// Mini-screen palette
const C = {
  bg:          '#0a0014',
  border:      '#2d1b69',
  text:        '#e0e0ff',
  textDim:     '#6666aa',
  neonPink:    '#ff2d78',
  neonCyan:    '#00ffff',
  neonGreen:   '#39ff14',
  neonYellow:  '#fff200',
  barBg:       '#1a1a3a',
  barHp:       '#39ff14',
  barFatigue:  '#ff9f00',
  barBurnout:  '#ff2d78',
};

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.width  = canvas.width;   // 200
    this.height = canvas.height;  // 120
    this._scrollOffset = 0;
    this._scrollTimer  = 0;
    this._lastLines    = [];
  }

  render(player, timeSystem, eventLog) {
    const ctx = this.ctx;
    const W = this.width, H = this.height;

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Thin inner border
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    const COL1 = 4, COL2 = 105;
    let y = 8;

    // ── Time & Date ──────────────────────────────────
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = C.neonCyan;
    ctx.textAlign = 'left';
    ctx.fillText(timeSystem.getTimeString(), COL1, y);

    ctx.fillStyle = C.neonPink;
    ctx.fillText(timeSystem.isNight() ? '🌙 NOC' : '☀ DZIEŃ', COL1 + 34, y);

    ctx.fillStyle = C.textDim;
    ctx.font = '7px monospace';
    ctx.fillText(timeSystem.getDateString(), COL2, y);
    y += 11;

    // ── Money ────────────────────────────────────────
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = C.neonYellow;
    ctx.textAlign = 'left';
    ctx.fillText(`$${player.money.toLocaleString()}`, COL1, y);

    ctx.fillStyle = C.textDim;
    ctx.font = '7px monospace';
    ctx.fillText(`₿ ${player.economy?.cryptoWallet ?? 0}`, COL2, y);
    y += 11;

    // ── HP Bar ───────────────────────────────────────
    this._bar(ctx, COL1, y, 90, 6, player.hp / player.maxHp, C.barHp, 'HP');
    ctx.fillStyle = C.text;
    ctx.font = '7px monospace';
    ctx.fillText(`${player.hp}/${player.maxHp}`, COL1 + 92, y + 5);
    y += 10;

    // ── Fatigue Bar ──────────────────────────────────
    this._bar(ctx, COL1, y, 90, 5, player.fatigue / 100, C.barFatigue, 'FAT');
    y += 9;

    // ── Burnout Bar ──────────────────────────────────
    this._bar(ctx, COL1, y, 90, 5, player.burnout / 100, C.barBurnout, 'BRN');
    y += 9;

    // ── Inventory ────────────────────────────────────
    const drugIds = Object.keys(player.inventory).filter(k => player.inventory[k] > 0);
    ctx.font = '7px monospace';
    if (drugIds.length === 0) {
      ctx.fillStyle = C.textDim;
      ctx.fillText('Brak towaru', COL1, y);
    } else {
      ctx.fillStyle = C.neonGreen;
      let ix = COL1;
      for (const id of drugIds.slice(0, 4)) {
        const name = (DRUGS[id]?.name || id).slice(0, 4);
        const qty  = player.inventory[id];
        ctx.fillText(`${name}:${qty}`, ix, y);
        ix += 46;
        if (ix > W - 10) break;
      }
    }
    y += 9;

    // ── Divider ──────────────────────────────────────
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(COL1, y); ctx.lineTo(W - COL1, y);
    ctx.stroke();
    y += 4;

    // ── Event log (scrolling bottom section) ────────
    const lines = eventLog.getLines();
    const logH  = H - y - 2;
    const lineH = 9;
    const visLines = Math.floor(logH / lineH);

    ctx.font = '7px monospace';
    ctx.textAlign = 'left';

    // Clip log region
    ctx.save();
    ctx.rect(COL1, y, W - COL1 * 2, logH);
    ctx.clip();

    const start = Math.max(0, lines.length - visLines);
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      const age  = Date.now() - (line.timestamp || 0);
      // Newer lines brighter
      const alpha = i === lines.length - 1 ? 1 : 0.6;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === lines.length - 1 ? C.neonCyan : C.textDim;
      const ly = y + (i - start) * lineH + 7;
      ctx.fillText(line.text, COL1, ly);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _bar(ctx, x, y, w, h, ratio, color, label) {
    // Background
    ctx.fillStyle = C.barBg;
    ctx.fillRect(x, y, w, h);
    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, w * Math.min(1, ratio)), h);
    // Label
    ctx.fillStyle = C.textDim;
    ctx.font = '6px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(label, x - 1, y + h - 1);
    ctx.textAlign = 'left';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay / Menu Manager
// ─────────────────────────────────────────────────────────────────────────────
export class OverlayManager {
  constructor() {
    this.overlay     = document.getElementById('overlay');
    this.screens     = {};

    const ids = ['start', 'base-select', 'busted', 'win', 'pause'];
    for (const id of ids) {
      const el = document.getElementById(`screen-${id}`);
      if (el) this.screens[id] = el;
    }
  }

  show(screenId) {
    this.overlay.classList.remove('hidden');
    for (const [id, el] of Object.entries(this.screens)) {
      el.classList.toggle('active', id === screenId);
    }
  }

  hide() {
    this.overlay.classList.add('hidden');
    for (const el of Object.values(this.screens)) {
      el.classList.remove('active');
    }
  }

  showBusted(lostDrugs, lostMoney) {
    this.show('busted');
    const el = document.getElementById('busted-stats');
    if (!el) return;
    let lines = [`Utracone: $${lostMoney}`];
    for (const [id, qty] of Object.entries(lostDrugs)) {
      lines.push(`• ${DRUGS[id]?.name || id}: ${qty}`);
    }
    el.innerHTML = lines.map(l => `<p>${l}</p>`).join('');
  }

  showWin(money, days) {
    this.show('win');
  }

  populateBaseSelect(candidates, onSelect) {
    const BASE_NAMES = [
      'Stara kamienica',
      'Brudna piwnica',
      'Opuszczona fabryka',
      'Zrujnowana willa',
      'Blok za torami',
      'Schron pod mostem',
      'Biuro na odludziu',
    ];
    const container = document.getElementById('base-options');
    if (!container) return;
    container.innerHTML = '';
    candidates.forEach((cand, i) => {
      const btn = document.createElement('button');
      btn.className = 'base-option';
      btn.innerHTML = `
        <div class="base-icon">${BASE_ICONS[i % BASE_ICONS.length]}</div>
        <div class="base-name">${BASE_NAMES[i] || `Baza ${i + 1}`}</div>
      `;
      btn.addEventListener('click', () => onSelect(cand, i));
      container.appendChild(btn);
    });
  }
}

const BASE_ICONS = ['🏠','🏚','🏭','🏛','🏢','🌉','🏗'];

// ─────────────────────────────────────────────────────────────────────────────
// Game Canvas HUD overlay (drawn directly on main canvas, screen-space)
// ─────────────────────────────────────────────────────────────────────────────
export class GameHUD {
  constructor() {
    this._promptTimer = 0;
    this._promptText  = '';
    this._flashTimer  = 0;
    this._flashText   = '';
    this._flashColor  = '#fff';
    this._interactionRange = 40;
  }

  showPrompt(text, duration = 3) {
    this._promptText  = text;
    this._promptTimer = duration;
  }

  flash(text, duration = 1.5, color = '#ff2d78') {
    this._flashText   = text;
    this._flashTimer  = duration;
    this._flashColor  = color;
  }

  update(dt) {
    this._promptTimer = Math.max(0, this._promptTimer - dt);
    this._flashTimer  = Math.max(0, this._flashTimer  - dt);
  }

  render(ctx, canvasW, canvasH, player, nearbyNPC, camera, fps) {
    // Interaction prompt
    if (nearbyNPC && !nearbyNPC.hasDealt) {
      const text = nearbyNPC.type === 'CRACKHEAD'
        ? '⚠ CRACKHEAD — [A] Sprzedaj / [B] Uciekaj'
        : '[A] Sprzedaj towar';
      this._drawPrompt(ctx, canvasW, canvasH - 40, text, '#00ffff');
    }

    if (this._promptTimer > 0) {
      const alpha = Math.min(1, this._promptTimer);
      this._drawPrompt(ctx, canvasW, canvasH - 60, this._promptText, '#fff200', alpha);
    }

    // Flash message (center screen)
    if (this._flashTimer > 0) {
      const alpha = Math.min(1, this._flashTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = this._flashColor;
      ctx.shadowBlur  = 20;
      ctx.fillStyle   = this._flashColor;
      ctx.fillText(this._flashText, canvasW / 2, canvasH / 2 - 20);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // At-home indicator
    if (player.isAtHome) {
      this._drawPrompt(ctx, canvasW, 20, '🏠 DOM — [B] Odpoczynek / [A] Craft', '#39ff14', 1, 'top');
    }

    // Minimap (top-right, 70×70)
    this._drawMinimap(ctx, canvasW - 78, 8, 70, 70, player, camera);

    // Respect & stats (top-left corner of game canvas)
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ff2d78';
    ctx.textAlign = 'left';
    ctx.fillText(`REP: ${player.respect}`, 6, 14);
    ctx.fillStyle = '#6666aa';
    ctx.fillText(`${fps} FPS`, 6, 25);

    // Night overlay tint
    // (rendered via CSS or can be a semi-transparent canvas layer)
  }

  _drawPrompt(ctx, cx, y, text, color, alpha = 1, baseline = 'bottom') {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = baseline;
    const tw = ctx.measureText(text).width;
    const pad = 6;
    ctx.fillStyle = '#00000099';
    ctx.fillRect(cx / 2 - tw / 2 - pad, y - 14, tw + pad * 2, 17);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 8;
    ctx.fillText(text, cx / 2, y);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawMinimap(ctx, ox, oy, mw, mh, player, camera) {
    const WORLD = 2560;
    const scaleX = mw / WORLD, scaleY = mh / WORLD;

    ctx.save();
    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(ox, oy, mw, mh);
    ctx.strokeStyle = '#2d1b69';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, mw, mh);

    // Camera viewport box
    const camX = camera.x * scaleX + ox;
    const camY = camera.y * scaleY + oy;
    const camW = (camera.width / camera.zoom) * scaleX;
    const camH = (camera.height / camera.zoom) * scaleY;
    ctx.strokeStyle = '#2d1b6966';
    ctx.strokeRect(camX, camY, camW, camH);

    // Player dot
    const px = player.x * scaleX + ox;
    const py = player.y * scaleY + oy;
    ctx.fillStyle = '#ff2d78';
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Home dot
    if (player.homeX > 0) {
      const hx = player.homeX * scaleX + ox;
      const hy = player.homeY * scaleY + oy;
      ctx.fillStyle = '#39ff14';
      ctx.beginPath();
      ctx.arc(hx, hy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
