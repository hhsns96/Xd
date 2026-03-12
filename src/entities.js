/**
 * entities.js - Player, NPC, and Guard classes
 */

import { TILE_SIZE, WORLD_SIZE } from './map.js';

// ─── Palette ──────────────────────────────────────────────────────────────────
const PLAYER_COLOR  = '#ff2d78';  // neon pink
const PLAYER_GLOW   = '#ff2d7888';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── NPC TYPES ────────────────────────────────────────────────────────────────
export const NPC_TYPE = Object.freeze({
  NORMAL:   'NORMAL',
  CLIENT:   'CLIENT',
  CRACKHEAD:'CRACKHEAD',
});

const NPC_CONFIG = {
  [NPC_TYPE.NORMAL]:    { buyProb: 0.10, riskMult: 1.0,  color: '#8888ff', speed: 28 },
  [NPC_TYPE.CLIENT]:    { buyProb: 0.70, riskMult: 0.2,  color: '#88ff88', speed: 40 },
  [NPC_TYPE.CRACKHEAD]: { buyProb: 0.95, riskMult: 2.0,  color: '#ff8800', speed: 65 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Player
// ─────────────────────────────────────────────────────────────────────────────
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 10;

    // Stats
    this.hp      = 100;
    this.maxHp   = 100;
    this.money   = 50;
    this.fatigue = 0;   // 0–100
    this.burnout = 0;   // 0–100
    this.respect = 0;

    this.inventory = {};  // drugId → quantity
    this.stats = { charisma: 1, strength: 1, intelligence: 1 };

    this.speed   = 90;  // pixels/second
    this.isAtHome = false;
    this.homeX   = 0;   // world pixel x
    this.homeY   = 0;

    // Internal
    this._stepTimer   = 0;
    this._stepSoundCb = null;
    this._invincibleTimer = 0;
  }

  setHome(worldX, worldY) {
    this.homeX = worldX;
    this.homeY = worldY;
    this.x = worldX;
    this.y = worldY;
  }

  setStepCallback(fn) { this._stepSoundCb = fn; }

  update(dt, input, map) {
    this._invincibleTimer = Math.max(0, this._invincibleTimer - dt);

    // Movement
    let dx = 0, dy = 0;
    if (input.isDown('up'))    dy -= 1;
    if (input.isDown('down'))  dy += 1;
    if (input.isDown('left'))  dx -= 1;
    if (input.isDown('right')) dx += 1;

    // Also support raw joystick for diagonal
    if (Math.abs(input._joyDx) > 0.1) dx = input._joyDx;
    if (Math.abs(input._joyDy) > 0.1) dy = input._joyDy;

    // Normalise diagonal
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len; dy /= len;
    }

    const spd = this.speed * (1 - this.fatigue * 0.004);
    const nx = this.x + dx * spd * dt;
    const ny = this.y + dy * spd * dt;

    // Collision — try to slide along walls
    if (map.isWalkableWorld(nx, this.y)) this.x = nx;
    if (map.isWalkableWorld(this.x, ny)) this.y = ny;

    // Clamp to world
    this.x = clamp(this.x, this.radius, WORLD_SIZE - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_SIZE - this.radius);

    // Fatigue — increases with movement
    if (len > 0) {
      this.fatigue = clamp(this.fatigue + 2 * dt, 0, 100);
      this._stepTimer += dt;
      if (this._stepTimer > 0.35) {
        this._stepTimer = 0;
        if (this._stepSoundCb) this._stepSoundCb();
      }
    } else {
      // Slow fatigue recovery when standing still
      this.fatigue = clamp(this.fatigue - 1.5 * dt, 0, 100);
    }

    // Check at home
    const homeDist = dist(this.x, this.y, this.homeX, this.homeY);
    this.isAtHome = homeDist < TILE_SIZE * 2;
  }

  takeDamage(amount) {
    if (this._invincibleTimer > 0) return;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this._invincibleTimer = 1.5; // 1.5s invincibility frames
  }

  rest() {
    this.hp      = clamp(this.hp + this.maxHp * 0.15, 0, this.maxHp);
    this.fatigue = clamp(this.fatigue - 30, 0, 100);
    this.burnout = clamp(this.burnout - 10, 0, 100);
  }

  addDrug(drugId, qty) {
    this.inventory[drugId] = (this.inventory[drugId] || 0) + qty;
  }

  removeDrug(drugId, qty) {
    const have = this.inventory[drugId] || 0;
    this.inventory[drugId] = Math.max(0, have - qty);
    if (this.inventory[drugId] === 0) delete this.inventory[drugId];
  }

  hasDrug(drugId, qty = 1) {
    return (this.inventory[drugId] || 0) >= qty;
  }

  totalDrugs() {
    return Object.values(this.inventory).reduce((s, v) => s + v, 0);
  }

  render(ctx, camera) {
    if (!camera.isVisible(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2)) return;

    const { x, y } = camera.worldToScreen(this.x, this.y);
    const r = this.radius * camera.zoom;

    // Glow ring
    const grad = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
    grad.addColorStop(0, PLAYER_GLOW);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Body — octagon shape for pre-alpha "top-down" look
    ctx.fillStyle = this._invincibleTimer > 0
      ? (Math.floor(this._invincibleTimer * 10) % 2 ? '#ffffff' : PLAYER_COLOR)
      : PLAYER_COLOR;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator (facing last movement)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.45, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  renderScreenSpace(ctx, sx, sy) {
    const r = this.radius;
    const grad = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 2);
    grad.addColorStop(0, PLAYER_GLOW);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NPC
// ─────────────────────────────────────────────────────────────────────────────
export class NPC {
  constructor(x, y, type = NPC_TYPE.NORMAL) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = 8;

    const cfg = NPC_CONFIG[type];
    this.buyProb  = cfg.buyProb;
    this.riskMult = cfg.riskMult;
    this.color    = cfg.color;
    this.baseSpeed = cfg.speed;

    this.hp = 40;
    this.maxHp = 40;
    this.isAngry  = false;
    this.isDead   = false;
    this.hasDealt = false; // already made a transaction this round

    this._moveTimer   = Math.random() * 3;
    this._dirX        = 0;
    this._dirY        = 0;
    this._attackTimer = 0;
    this._bobTimer    = Math.random() * Math.PI * 2;
    this._lookRadius  = 80;
  }

  update(dt, player, map) {
    if (this.isDead) return;

    this._moveTimer -= dt;
    this._bobTimer  += dt * 3;
    this._attackTimer = Math.max(0, this._attackTimer - dt);

    const d = dist(this.x, this.y, player.x, player.y);

    if (this.type === NPC_TYPE.CRACKHEAD) {
      this._updateCrackhead(dt, player, d, map);
    } else if (this.type === NPC_TYPE.CLIENT) {
      this._updateClient(dt, player, d, map);
    } else {
      this._updateNormal(dt, map);
    }
  }

  _updateNormal(dt, map) {
    if (this._moveTimer <= 0) {
      this._moveTimer = 1.5 + Math.random() * 3;
      const angle = Math.random() * Math.PI * 2;
      this._dirX = Math.cos(angle);
      this._dirY = Math.sin(angle);
    }
    this._move(dt, map, this.baseSpeed * 0.5);
  }

  _updateClient(dt, player, d, map) {
    if (d < 160 && !this.hasDealt) {
      // Walk toward player slowly
      const dx = player.x - this.x, dy = player.y - this.y;
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l > 0) { this._dirX = dx / l; this._dirY = dy / l; }
      this._move(dt, map, this.baseSpeed * 0.8);
    } else {
      this._updateNormal(dt, map);
    }
  }

  _updateCrackhead(dt, player, d, map) {
    if (d < 120) {
      this.isAngry = true;
    }
    if (this.isAngry) {
      // Chase player
      const dx = player.x - this.x, dy = player.y - this.y;
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l > 0) { this._dirX = dx / l; this._dirY = dy / l; }
      this._move(dt, map, this.baseSpeed);
    } else {
      // Erratic wandering
      if (this._moveTimer <= 0) {
        this._moveTimer = 0.5 + Math.random() * 1.5;
        const angle = Math.random() * Math.PI * 2;
        this._dirX = Math.cos(angle);
        this._dirY = Math.sin(angle);
      }
      this._move(dt, map, this.baseSpeed * 0.7);
    }

    // Attack if adjacent
    if (d < 30 && this._attackTimer <= 0) {
      this._attackTimer = 1.0;
      return true; // signal to call tryAttack outside
    }
  }

  _move(dt, map, speed) {
    const nx = this.x + this._dirX * speed * dt;
    const ny = this.y + this._dirY * speed * dt;
    // Slide collision
    const tx = Math.floor(nx / TILE_SIZE);
    const ty = Math.floor(ny / TILE_SIZE);
    const tx0 = Math.floor(this.x / TILE_SIZE);
    const ty0 = Math.floor(this.y / TILE_SIZE);
    if (map.isWalkable(tx, ty0)) this.x = nx;
    if (map.isWalkable(tx0, ty)) this.y = ny;
    // Clamp
    this.x = clamp(this.x, this.radius, WORLD_SIZE - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_SIZE - this.radius);
  }

  tryAttack(player) {
    if (this.isDead || this._attackTimer > 0) return false;
    const d = dist(this.x, this.y, player.x, player.y);
    if (d < 32) {
      player.takeDamage(8 + (this.type === NPC_TYPE.CRACKHEAD ? 7 : 0));
      this._attackTimer = 1.0;
      return true;
    }
    return false;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.isDead = true;
  }

  render(ctx, camera) {
    if (this.isDead) return;
    if (!camera.isVisible(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2)) return;

    const { x, y } = camera.worldToScreen(this.x, this.y);
    const r = this.radius * camera.zoom;
    const bob = Math.sin(this._bobTimer) * 1.5;

    // Glow
    ctx.shadowColor = this.isAngry ? '#ff4400' : this.color;
    ctx.shadowBlur  = 8;

    ctx.fillStyle = this.isAngry ? '#ff4400' : this.color;
    ctx.beginPath();
    ctx.arc(x, y + bob, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // HP bar above head (only if damaged)
    if (this.hp < this.maxHp) {
      const barW = r * 2.5, barH = 3;
      const bx = x - barW / 2, by = y + bob - r - 6;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(bx, by, barW * (this.hp / this.maxHp), barH);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard
// ─────────────────────────────────────────────────────────────────────────────
export class Guard {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 9;

    this.hp    = 60;
    this.maxHp = 60;
    this.level = 1;
    this.xp    = 0;
    this.xpToNext = 100;
    this.isDead = false;

    this.stats = { charisma: 1, strength: 1, intelligence: 1 };
    this.assignedZone = null;   // { cx, cy, radius } — patrol zone

    this._patrolAngle = 0;
    this._bobTimer = Math.random() * Math.PI * 2;
    this._attackTimer = 0;
  }

  earnXP(amount) {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.levelUp();
      return true;
    }
    return false;
  }

  levelUp() {
    this.level++;
    this.xp -= this.xpToNext;
    this.xpToNext = Math.floor(this.xpToNext * 1.5);
    this.maxHp += 20;
    this.hp = this.maxHp;
    // Random stat gain
    const stats = ['charisma', 'strength', 'intelligence'];
    const picked = stats[Math.floor(Math.random() * stats.length)];
    this.stats[picked]++;
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  update(dt, npcs, map) {
    if (this.isDead) return;
    this._bobTimer += dt * 2;
    this._attackTimer = Math.max(0, this._attackTimer - dt);

    if (!this.assignedZone) return;

    // Patrol circle around assigned zone
    this._patrolAngle += dt * 0.5;
    const px = this.assignedZone.cx + Math.cos(this._patrolAngle) * this.assignedZone.radius;
    const py = this.assignedZone.cy + Math.sin(this._patrolAngle) * this.assignedZone.radius;

    // Move toward patrol target
    const dx = px - this.x, dy = py - this.y;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l > 5) {
      const spd = 50;
      const nx = this.x + (dx / l) * spd * dt;
      const ny = this.y + (dy / l) * spd * dt;
      if (map.isWalkableWorld(nx, this.y)) this.x = nx;
      if (map.isWalkableWorld(this.x, ny)) this.y = ny;
    }

    // Attack nearby angry NPCs
    if (this._attackTimer <= 0) {
      for (const npc of npcs) {
        if (npc.isDead || !npc.isAngry) continue;
        const d = dist(this.x, this.y, npc.x, npc.y);
        if (d < 40) {
          npc.takeDamage(15 + this.stats.strength * 5);
          this._attackTimer = 0.8;
          break;
        }
      }
    }
  }

  takeDamage(amount) {
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    if (this.hp === 0) this.isDead = true;
  }

  render(ctx, camera) {
    if (this.isDead) return;
    if (!camera.isVisible(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2)) return;

    const { x, y } = camera.worldToScreen(this.x, this.y);
    const r = this.radius * camera.zoom;
    const bob = Math.sin(this._bobTimer) * 1;

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#00ccdd';
    ctx.beginPath();
    // Diamond shape for guard
    ctx.moveTo(x, y + bob - r);
    ctx.lineTo(x + r, y + bob);
    ctx.lineTo(x, y + bob + r);
    ctx.lineTo(x - r, y + bob);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Level badge
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(8, r * 0.9)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.level, x, y + bob);
  }
}

/**
 * Spawn ~50 NPCs across the map using spawn points
 */
export function spawnNPCs(map, count = 50) {
  const types = [NPC_TYPE.NORMAL, NPC_TYPE.NORMAL, NPC_TYPE.CLIENT, NPC_TYPE.CRACKHEAD];
  const npcs = [];
  for (let i = 0; i < count; i++) {
    const sp = map.randomWalkable();
    const type = types[Math.floor(Math.random() * types.length)];
    npcs.push(new NPC(sp.x, sp.y, type));
  }
  return npcs;
}
