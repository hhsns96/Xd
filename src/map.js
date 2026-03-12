/**
 * map.js - Procedural city tile map (GTA2-style top-down)
 * 80×80 tiles, each tile 32×32 pixels → 2560×2560 world pixels
 */

export const TILE = Object.freeze({
  ROAD:      0,
  SIDEWALK:  1,
  BUILDING:  2,
  GRASS:     3,
  ALLEY:     4,
});

export const TILE_SIZE = 32;
export const MAP_TILES = 80;
export const WORLD_SIZE = MAP_TILES * TILE_SIZE; // 2560

// Hotline Miami 2 inspired palette for map tiles
const TILE_COLORS = {
  [TILE.ROAD]:     '#1c1c1c',
  [TILE.SIDEWALK]: '#2a2a2a',
  [TILE.GRASS]:    '#0d1f0d',
  [TILE.ALLEY]:    '#141414',
};

// Building colours – dark purple/teal variety
const BUILDING_PALETTE = [
  '#12112a', '#1a1030', '#0d1a1a', '#1a0d1a',
  '#0d1230', '#1a1212', '#14181a', '#0a1228',
];

// Road markings color
const ROAD_MARKING = '#2e2e2e';
const CURB_COLOR   = '#333344';

export class TileMap {
  constructor(seed = 42) {
    this.seed = seed;
    this.width  = MAP_TILES;
    this.height = MAP_TILES;
    this.tiles  = new Uint8Array(MAP_TILES * MAP_TILES);

    // Per-tile building colour index (only meaningful for BUILDING tiles)
    this.buildingColors = new Uint8Array(MAP_TILES * MAP_TILES);

    // Walkable zones for NPC spawning etc.
    this.spawnPoints = [];
    this.buildingRects = [];

    this._rng = this._makeRng(seed);
    this._generate();
  }

  _makeRng(s) {
    let state = s;
    return () => {
      state ^= state << 13;
      state ^= state >> 17;
      state ^= state << 5;
      return (state >>> 0) / 0xFFFFFFFF;
    };
  }

  _set(tx, ty, type) {
    this.tiles[ty * MAP_TILES + tx] = type;
  }
  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_TILES || ty >= MAP_TILES) return TILE.BUILDING;
    return this.tiles[ty * MAP_TILES + tx];
  }
  isWalkable(tx, ty) {
    const t = this.get(tx, ty);
    return t === TILE.ROAD || t === TILE.SIDEWALK || t === TILE.GRASS || t === TILE.ALLEY;
  }
  isWalkableWorld(wx, wy) {
    return this.isWalkable(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
  }

  _generate() {
    const r = this._rng;
    const W = MAP_TILES, H = MAP_TILES;

    // 1. Fill everything with SIDEWALK
    this.tiles.fill(TILE.SIDEWALK);

    // 2. Lay out a grid of city blocks
    //    Block = 10 tiles wide/tall (including roads)
    //    Road = 2 tiles wide
    const BLOCK = 10;
    const ROAD_W = 2;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const bx = tx % BLOCK;
        const by = ty % BLOCK;
        if (bx < ROAD_W || by < ROAD_W) {
          this._set(tx, ty, TILE.ROAD);
        }
      }
    }

    // 3. Place buildings inside each block
    for (let by = 0; by < Math.floor(H / BLOCK); by++) {
      for (let bx = 0; bx < Math.floor(W / BLOCK); bx++) {
        const originX = bx * BLOCK + ROAD_W;
        const originY = by * BLOCK + ROAD_W;
        const innerW  = BLOCK - ROAD_W; // 8 tiles
        const innerH  = BLOCK - ROAD_W;

        // 1-tile sidewalk border inside block
        for (let dy = 0; dy < innerH; dy++) {
          for (let dx = 0; dx < innerW; dx++) {
            const tx = originX + dx;
            const ty = originY + dy;
            if (dx === 0 || dy === 0 || dx === innerW - 1 || dy === innerH - 1) {
              this._set(tx, ty, TILE.SIDEWALK);
            } else {
              this._set(tx, ty, TILE.BUILDING);
              this.buildingColors[ty * MAP_TILES + tx] = Math.floor(r() * BUILDING_PALETTE.length);
            }
          }
        }

        // Randomly add alleys inside block (10% chance)
        if (r() < 0.10) {
          const alleyX = originX + 1 + Math.floor(r() * (innerW - 2));
          for (let dy = 0; dy < innerH; dy++) {
            this._set(alleyX, originY + dy, TILE.ALLEY);
          }
        }

        // Randomly place a small park (grass patch) — 15% chance
        if (r() < 0.15) {
          for (let dy = 1; dy < innerH - 1; dy++) {
            for (let dx = 1; dx < innerW - 1; dx++) {
              this._set(originX + dx, originY + dy, TILE.GRASS);
            }
          }
        }

        // Record building rect for camera/home use
        this.buildingRects.push({
          tx: originX + 1, ty: originY + 1,
          tw: innerW - 2,  th: innerH - 2,
          worldX: (originX + 1) * TILE_SIZE,
          worldY: (originY + 1) * TILE_SIZE,
        });
      }
    }

    // 4. Collect spawn points (sidewalk & road tiles away from border)
    for (let ty = 2; ty < H - 2; ty++) {
      for (let tx = 2; tx < W - 2; tx++) {
        const t = this.get(tx, ty);
        if (t === TILE.SIDEWALK || t === TILE.ROAD) {
          if (Math.floor(ty * W + tx) % 17 === 0) { // sparse sample
            this.spawnPoints.push({
              x: tx * TILE_SIZE + TILE_SIZE / 2,
              y: ty * TILE_SIZE + TILE_SIZE / 2,
            });
          }
        }
      }
    }
  }

  /** Pre-render entire map to an offscreen canvas for fast blitting */
  bakeToCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width  = WORLD_SIZE;
    canvas.height = WORLD_SIZE;
    const ctx = canvas.getContext('2d');
    this._renderAll(ctx);
    this._baked = canvas;
    return canvas;
  }

  _renderAll(ctx) {
    const W = MAP_TILES, H = MAP_TILES, TS = TILE_SIZE;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const t = this.get(tx, ty);
        const px = tx * TS, py = ty * TS;

        if (t === TILE.BUILDING) {
          const ci = this.buildingColors[ty * W + tx];
          ctx.fillStyle = BUILDING_PALETTE[ci % BUILDING_PALETTE.length];
          ctx.fillRect(px, py, TS, TS);
          // Building edge highlight
          ctx.strokeStyle = '#2d1b6922';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
        } else {
          ctx.fillStyle = TILE_COLORS[t] || '#111';
          ctx.fillRect(px, py, TS, TS);

          if (t === TILE.ROAD) {
            // Road markings — center dashes
            ctx.fillStyle = ROAD_MARKING;
            const bx = tx % 10, by = ty % 10;
            // Horizontal dashes on vertical roads
            if (bx < 2 && by === 5) {
              ctx.fillRect(px + 4, py + TS / 2 - 1, TS - 8, 2);
            }
            // Vertical dashes on horizontal roads
            if (by < 2 && bx === 5) {
              ctx.fillRect(px + TS / 2 - 1, py + 4, 2, TS - 8);
            }
          }

          if (t === TILE.SIDEWALK) {
            // Subtle curb line at road edge
            const below = this.get(tx, ty + 1);
            const right = this.get(tx + 1, ty);
            ctx.fillStyle = CURB_COLOR;
            if (below === TILE.ROAD) ctx.fillRect(px, py + TS - 2, TS, 2);
            if (right === TILE.ROAD) ctx.fillRect(px + TS - 2, py, 2, TS);
          }

          if (t === TILE.ALLEY) {
            // Darker stripe to mark alleys
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(px + 2, py + 2, TS - 4, TS - 4);
          }

          if (t === TILE.GRASS) {
            // Subtle texture dots
            ctx.fillStyle = '#0f2a0f';
            for (let d = 0; d < 4; d++) {
              const gx = px + ((tx * 7 + d * 13) % (TS - 4)) + 2;
              const gy = py + ((ty * 11 + d * 7) % (TS - 4)) + 2;
              ctx.fillRect(gx, gy, 2, 2);
            }
          }
        }
      }
    }

    // Building windows glow (neon accent on buildings)
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (this.get(tx, ty) !== TILE.BUILDING) continue;
        const px = tx * TS, py = ty * TS;
        // Occasionally draw a lit window
        const roll = ((tx * 31 + ty * 17) % 100);
        if (roll < 30) {
          const hue = [
            '#ff2d7833', '#00ffff33', '#39ff1433',
            '#fff20033', '#ff660033',
          ][roll % 5];
          ctx.fillStyle = hue;
          const wx = px + 4 + (roll % 5) * 4;
          const wy = py + 4 + (roll % 4) * 6;
          ctx.fillRect(wx, wy, 5, 7);
        }
      }
    }
  }

  /**
   * Render visible portion of map, using baked canvas if available
   */
  render(ctx, camera) {
    if (this._baked) {
      // Blit only visible region
      const visW = camera.width / camera.zoom;
      const visH = camera.height / camera.zoom;
      const sx = Math.max(0, camera.x);
      const sy = Math.max(0, camera.y);
      const sw = Math.min(WORLD_SIZE - sx, visW + 32);
      const sh = Math.min(WORLD_SIZE - sy, visH + 32);
      ctx.drawImage(
        this._baked,
        sx, sy, sw, sh,
        sx, sy, sw, sh,
      );
    }
  }

  /** Get a random walkable world position */
  randomWalkable() {
    if (this.spawnPoints.length === 0) return { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
  }

  /** Return the 7 best home candidates (distinct building rects) */
  getHomeCandidates(count = 7) {
    const rects = this.buildingRects;
    const step = Math.floor(rects.length / count);
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(rects[i * step]);
    }
    return result;
  }
}
