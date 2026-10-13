import * as THREE from 'three';

// The head is a SphereGeometry rotated so that its UV seam sits at the back:
//   face centre -> uv (0.5, 0.5); the character's right (+x) -> u = 0.25.
// Canvas is 2:1 so one radian is the same number of pixels in both directions.
export const W = 2048;
export const H = 1024;
const PX_PER_RAD = W / (Math.PI * 2);

// azimuth: + to the character's right; elevation: + up (radians)
export function angleToCanvas(azimuth, elevation) {
  return [W * 0.5 - azimuth * PX_PER_RAD, H * 0.5 - elevation * PX_PER_RAD];
}

export const SKIN = '#ffcdb2';

export class FaceCanvas {
  constructor() {
    this.base = makeCanvas();   // skin + natural features, never erased
    this.paint = makeCanvas();  // makeup layer
    this.out = makeCanvas();    // composite shown on the head
    this.patch = document.createElement('canvas'); // dirty region, uploaded alone
    this.paintCtx = this.paint.getContext('2d');
    this.outCtx = this.out.getContext('2d');
    this.patchCtx = this.patch.getContext('2d');
    drawBaseFace(this.base.getContext('2d'));

    this.texture = new THREE.CanvasTexture(this.out);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.patchTexture = new THREE.Texture(this.patch);
    this.patchPos = new THREE.Vector2();

    this.uploaded = false;
    this.fullDirty = true;
    this.rect = null; // dirty rect in canvas pixels: [x0, y0, x1, y1]
  }

  // Stamp one dab at uv. `tool` = { color, radius, alpha, soft, erase }
  stamp(uv, tool, scale = 1) {
    const x = uv.x * W;
    const y = (1 - uv.y) * H;
    const r = Math.max(1, tool.radius * scale);
    const ctx = this.paintCtx;
    ctx.save();
    ctx.globalCompositeOperation = tool.erase ? 'destination-out' : 'source-over';
    ctx.globalAlpha = tool.alpha;
    if (tool.soft) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = tool.erase ? '#000000' : tool.color;
      g.addColorStop(0, c);
      g.addColorStop(0.5, withAlpha(c, 0.6));
      g.addColorStop(1, withAlpha(c, 0));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = tool.erase ? '#000000' : tool.color;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.markDirty(x - r - 2, y - r - 2, x + r + 2, y + r + 2);
  }

  // Dabs evenly spaced from uv a to uv b so fast strokes stay continuous.
  stroke(a, b, tool, scale = 1) {
    const du = b.x - a.x;
    if (Math.abs(du) > 0.25) { this.stamp(b, tool, scale); return; } // crossed the seam
    const dist = Math.hypot(du * W, (b.y - a.y) * H);
    const spacing = Math.max(1, tool.radius * scale * (tool.soft ? 0.3 : 0.18));
    const n = Math.min(300, Math.ceil(dist / spacing));
    const p = new THREE.Vector2();
    for (let i = 1; i <= n; i++) this.stamp(p.lerpVectors(a, b, i / n), tool, scale);
  }

  clear() {
    this.paintCtx.clearRect(0, 0, W, H);
    this.fullDirty = true;
  }

  markDirty(x0, y0, x1, y1) {
    const r = this.rect;
    if (!r) this.rect = [x0, y0, x1, y1];
    else { r[0] = Math.min(r[0], x0); r[1] = Math.min(r[1], y0); r[2] = Math.max(r[2], x1); r[3] = Math.max(r[3], y1); }
  }

  // Composite and upload. A full upload of a 2048x1024 canvas is too slow to do
  // every frame on a headset, so while painting only the dirty rect is sent.
  flush(renderer) {
    if (this.fullDirty || !this.uploaded) {
      this.outCtx.drawImage(this.base, 0, 0);
      this.outCtx.drawImage(this.paint, 0, 0);
      this.texture.needsUpdate = true;
      renderer.initTexture(this.texture);
      this.uploaded = true;
      this.fullDirty = false;
      this.rect = null;
      return;
    }
    if (!this.rect) return;
    const x0 = Math.max(0, Math.floor(this.rect[0]));
    const y0 = Math.max(0, Math.floor(this.rect[1]));
    const x1 = Math.min(W, Math.ceil(this.rect[2]));
    const y1 = Math.min(H, Math.ceil(this.rect[3]));
    this.rect = null;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;

    const o = this.outCtx;
    o.clearRect(x0, y0, w, h);
    o.drawImage(this.base, x0, y0, w, h, x0, y0, w, h);
    o.drawImage(this.paint, x0, y0, w, h, x0, y0, w, h);

    this.patch.width = w;
    this.patch.height = h;
    this.patchCtx.drawImage(this.out, x0, y0, w, h, 0, 0, w, h);
    // texture rows are bottom-up because of flipY
    renderer.copyTextureToTexture(this.patchTexture, this.texture, null, this.patchPos.set(x0, H - y1));
  }
}

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function softSpot(ctx, az, el, rx, ry, color, alpha) {
  const [x, y] = angleToCanvas(az, el);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const r = rx * PX_PER_RAD;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Cartoon base face. Eyes are separate meshes; everything here can be painted over.
function drawBaseFace(ctx) {
  ctx.fillStyle = SKIN;
  ctx.fillRect(0, 0, W, H);

  // rosy cheeks
  for (const s of [-1, 1]) softSpot(ctx, s * 0.5, -0.3, 0.13, 0.08, '#ff9aa8', 0.45);

  // rounded eyebrows
  ctx.strokeStyle = '#4a3550';
  ctx.lineCap = 'round';
  ctx.lineWidth = 11;
  for (const s of [-1, 1]) {
    const [x0, y0] = angleToCanvas(s * 0.26, 0.19);
    const [x1, y1] = angleToCanvas(s * 0.37, 0.235);
    const [x2, y2] = angleToCanvas(s * 0.47, 0.2);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x1, y1, x2, y2);
    ctx.stroke();
  }

  // small cat-like mouth with soft lips underneath for lipstick
  const [mx, my] = angleToCanvas(0, -0.4);
  const lw = 0.075 * PX_PER_RAD;
  ctx.fillStyle = '#ff9f9f';
  ctx.beginPath();
  ctx.ellipse(mx, my + 6, lw, lw * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a3a48';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(mx - lw * 0.9, my - 2);
  ctx.quadraticCurveTo(mx - lw * 0.45, my + 14, mx, my);
  ctx.quadraticCurveTo(mx + lw * 0.45, my + 14, mx + lw * 0.9, my - 2);
  ctx.stroke();
}
