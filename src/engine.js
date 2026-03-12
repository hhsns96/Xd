/**
 * engine.js - Game loop, input management, and camera
 */

// ---------------------------------------------------------------------------
// GameLoop
// ---------------------------------------------------------------------------
export class GameLoop {
  constructor() {
    this.running = false;
    this.lastTime = 0;
    this.fps = 0;
    this._frameCount = 0;
    this._fpsTimer = 0;
    this._updateFn = null;
    this._renderFn = null;
    this._rafId = null;
  }

  start(updateFn, renderFn) {
    this._updateFn = updateFn;
    this._renderFn = renderFn;
    this.running = true;
    this.lastTime = performance.now();
    this._rafId = requestAnimationFrame(t => this._loop(t));
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _loop(timestamp) {
    if (!this.running) return;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // cap at 50ms
    this.lastTime = timestamp;

    this._frameCount++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 1) {
      this.fps = this._frameCount;
      this._frameCount = 0;
      this._fpsTimer = 0;
    }

    this._updateFn(dt);
    this._renderFn();
    this._rafId = requestAnimationFrame(t => this._loop(t));
  }
}

// ---------------------------------------------------------------------------
// InputManager
// ---------------------------------------------------------------------------
export class InputManager {
  constructor() {
    this._keys = {};
    this._prevButtons = {};
    this.buttons = {
      up: false, down: false, left: false, right: false,
      a: false, b: false, start: false, select: false,
    };
    this._justPressed = {};

    // Joystick state (set by HUD touch handler)
    this._joyDx = 0;
    this._joyDy = 0;

    this._setupKeyboard();
  }

  _setupKeyboard() {
    const preventedKeys = new Set([
      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space',
    ]);
    window.addEventListener('keydown', e => {
      if (preventedKeys.has(e.code)) e.preventDefault();
      this._keys[e.code] = true;
    });
    window.addEventListener('keyup', e => {
      this._keys[e.code] = false;
    });
  }

  /** Called once per frame to sync state */
  update() {
    this._prevButtons = { ...this.buttons };

    const k = this._keys;
    // Keyboard mappings
    const kbUp    = !!(k['ArrowUp']    || k['KeyW']);
    const kbDown  = !!(k['ArrowDown']  || k['KeyS']);
    const kbLeft  = !!(k['ArrowLeft']  || k['KeyA']);
    const kbRight = !!(k['ArrowRight'] || k['KeyD']);
    const kbA     = !!(k['KeyZ']);
    const kbB     = !!(k['KeyX']);
    const kbStart  = !!(k['Enter']);
    const kbSelect = !!(k['ShiftLeft'] || k['ShiftRight']);

    // Joystick axes
    const jUp    = this._joyDy < -0.3;
    const jDown  = this._joyDy > 0.3;
    const jLeft  = this._joyDx < -0.3;
    const jRight = this._joyDx > 0.3;

    this.buttons.up     = kbUp    || jUp    || this.buttons._touchUp    || false;
    this.buttons.down   = kbDown  || jDown  || this.buttons._touchDown  || false;
    this.buttons.left   = kbLeft  || jLeft  || this.buttons._touchLeft  || false;
    this.buttons.right  = kbRight || jRight || this.buttons._touchRight || false;
    this.buttons.a      = kbA     || this.buttons._touchA     || false;
    this.buttons.b      = kbB     || this.buttons._touchB     || false;
    this.buttons.start  = kbStart  || this.buttons._touchStart  || false;
    this.buttons.select = kbSelect || this.buttons._touchSelect || false;

    // Compute just-pressed
    this._justPressed = {};
    for (const btn in this.buttons) {
      if (btn.startsWith('_')) continue;
      if (this.buttons[btn] && !this._prevButtons[btn]) {
        this._justPressed[btn] = true;
      }
    }
  }

  isDown(btn) { return !!this.buttons[btn]; }
  wasPressed(btn) { return !!this._justPressed[btn]; }

  setJoystick(dx, dy) {
    this._joyDx = dx;
    this._joyDy = dy;
  }

  /** Touch button press/release */
  setTouchButton(btn, state) {
    this.buttons['_touch' + btn.charAt(0).toUpperCase() + btn.slice(1)] = state;
  }

  pressVirtualButton(btn) {
    const key = '_touch' + btn.charAt(0).toUpperCase() + btn.slice(1);
    this.buttons[key] = true;
  }

  releaseVirtualButton(btn) {
    const key = '_touch' + btn.charAt(0).toUpperCase() + btn.slice(1);
    this.buttons[key] = false;
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
export class Camera {
  constructor(canvasWidth, canvasHeight) {
    this.x = 0;           // world-space top-left of viewport
    this.y = 0;
    this.width = canvasWidth;
    this.height = canvasHeight;
    this.zoom = 1.5;
    this.mode = 'STREET'; // 'STREET' | 'MANAGER'

    // Smooth follow targets
    this._targetX = 0;
    this._targetY = 0;
  }

  setMode(mode) {
    this.mode = mode;
    this.zoom = mode === 'STREET' ? 1.5 : 0.7;
  }

  /** Follow an entity smoothly (STREET mode) */
  follow(entity, worldW, worldH) {
    if (this.mode !== 'STREET') return;
    const visW = this.width / this.zoom;
    const visH = this.height / this.zoom;
    this._targetX = entity.x - visW / 2;
    this._targetY = entity.y - visH / 2;
    this.x += (this._targetX - this.x) * 0.12;
    this.y += (this._targetY - this.y) * 0.12;
    this._clamp(worldW, worldH);
  }

  /** Pan camera freely (MANAGER mode) */
  pan(dx, dy) {
    if (this.mode !== 'MANAGER') return;
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
  }

  _clamp(worldW, worldH) {
    const visW = this.width / this.zoom;
    const visH = this.height / this.zoom;
    this.x = Math.max(0, Math.min(worldW - visW, this.x));
    this.y = Math.max(0, Math.min(worldH - visH, this.y));
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  /** AABB visibility check (world coords) */
  isVisible(wx, wy, w = 32, h = 32) {
    const visW = this.width / this.zoom;
    const visH = this.height / this.zoom;
    return (
      wx + w > this.x && wx < this.x + visW &&
      wy + h > this.y && wy < this.y + visH
    );
  }

  apply(ctx) {
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  restore(ctx) {
    ctx.restore();
  }
}
