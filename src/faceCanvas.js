import * as THREE from 'three';

// The head is a SphereGeometry rotated so that its UV seam sits at the back:
//   face centre -> uv (0.5, 0.5); the character's right (+x) -> u = 0.25.
// Canvas is 2:1 so one radian is the same number of pixels in both directions.
export const W = 1024;
export const H = 512;
const PX_PER_RAD = W / (Math.PI * 2);

// azimuth: + to the character's right; elevation: + up (radians)
export function angleToCanvas(azimuth, elevation) {
  return [W * 0.5 - azimuth * PX_PER_RAD, H * 0.5 - elevation * PX_PER_RAD];
}

export const SKIN = '#f2c9a8';

export class FaceCanvas {
  constructor() {
    this.base = makeCanvas();   // skin + natural features, never erased
    this.paint = makeCanvas();  // makeup layer
    this.out = makeCanvas();    // composite shown on the head
    this.paintCtx = this.paint.getContext('2d');
    this.outCtx = this.out.getContext('2d');
    drawBaseFace(this.base.getContext('2d'));

    this.texture = new THREE.CanvasTexture(this.out);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.dirty = true;
    this.flush();
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
      const c = tool.erase ? '#000' : tool.color;
      g.addColorStop(0, c);
      g.addColorStop(1, hexToTransparent(c));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = tool.erase ? '#000' : tool.color;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.dirty = true;
  }

  // Dabs evenly spaced from uv a to uv b so fast strokes stay continuous.
  stroke(a, b, tool, scale = 1) {
    const du = b.x - a.x;
    if (Math.abs(du) > 0.25) { this.stamp(b, tool, scale); return; } // crossed the seam
    const dx = du * W;
    const dy = (b.y - a.y) * H;
    const dist = Math.hypot(dx, dy);
    const spacing = Math.max(1, tool.radius * scale * (tool.soft ? 0.35 : 0.2));
    const n = Math.min(200, Math.ceil(dist / spacing));
    const p = new THREE.Vector2();
    for (let i = 1; i <= n; i++) this.stamp(p.lerpVectors(a, b, i / n), tool, scale);
  }

  clear() {
    this.paintCtx.clearRect(0, 0, W, H);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.outCtx.drawImage(this.base, 0, 0);
    this.outCtx.drawImage(this.paint, 0, 0);
    this.texture.needsUpdate = true;
    this.dirty = false;
  }
}

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

function hexToTransparent(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
}

function drawBaseFace(ctx) {
  ctx.fillStyle = SKIN;
  ctx.fillRect(0, 0, W, H);

  // eyebrows
  ctx.strokeStyle = '#6b4a3a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const [x0, y0] = angleToCanvas(side * 0.17, 0.30);
    const [x1, y1] = angleToCanvas(side * 0.31, 0.34);
    const [x2, y2] = angleToCanvas(side * 0.44, 0.29);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x1, y1 - 4, x2, y2);
    ctx.stroke();
  }

  // natural lips
  const [lx, ly] = angleToCanvas(0, -0.40);
  const lw = 0.17 * PX_PER_RAD;
  const lh = 0.05 * PX_PER_RAD;
  ctx.fillStyle = '#d98f86';
  ctx.beginPath();
  ctx.moveTo(lx - lw, ly);
  ctx.quadraticCurveTo(lx - lw * 0.5, ly - lh * 1.1, lx, ly - lh * 0.55);
  ctx.quadraticCurveTo(lx + lw * 0.5, ly - lh * 1.1, lx + lw, ly);
  ctx.quadraticCurveTo(lx, ly + lh * 1.5, lx - lw, ly);
  ctx.fill();
  ctx.strokeStyle = '#a8625c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(lx - lw, ly);
  ctx.quadraticCurveTo(lx, ly + lh * 0.25, lx + lw, ly);
  ctx.stroke();
}
