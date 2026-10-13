import * as THREE from 'three';
import { W, H, angleToCanvas } from './faceCanvas.js';
import { TOOLS } from './tools.js';

const PX_PER_RAD = W / (Math.PI * 2);
const color = (id) => TOOLS.find((t) => t.id === id).color;

// ---------- target looks, drawn in the same UV layout as the face canvas ----------
function painter(ctx) {
  const at = (az, el) => angleToCanvas(az, el);
  return {
    soft(az, el, r, c, a) {
      const [x, y] = at(az, el);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hexA(c, a));
      g.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    dot(az, el, r, c) {
      const [x, y] = at(az, el);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    line(pts, width, c) {
      ctx.strokeStyle = c;
      ctx.lineWidth = width;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([az, el], i) => { const [x, y] = at(az, el); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    },
    poly(pts, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      pts.forEach(([az, el], i) => { const [x, y] = at(az, el); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.fill();
    },
    lips(c) {
      const [mx, my] = at(0, -0.4);
      const lw = 0.075 * PX_PER_RAD;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(mx, my + 6, lw * 1.05, lw * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

function star(p, az, el, r, c) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([az + Math.cos(a) * rr, el - Math.sin(a) * rr]);
  }
  p.poly(pts, c);
}

export const LOOKS = [
  {
    name: '甜美日常',
    hint: '腮红 + 口红',
    draw(p) {
      for (const s of [-1, 1]) p.soft(s * 0.5, -0.3, 80, color('blush'), 0.55);
      p.lips(color('lipstick'));
    },
  },
  {
    name: '小猫咪',
    hint: '眼线画胡须和鼻头',
    draw(p) {
      const liner = color('liner');
      p.dot(0, -0.2, 16, liner);
      for (const s of [-1, 1]) {
        for (const [el0, el1] of [[-0.27, -0.2], [-0.31, -0.31], [-0.35, -0.42]]) p.line([[s * 0.24, el0], [s * 0.7, el1]], 7, liner);
      }
      for (const s of [-1, 1]) p.soft(s * 0.5, -0.3, 60, color('blush'), 0.35);
    },
  },
  {
    name: '星光闪闪',
    hint: '眼影 + 彩绘星星 + 口红',
    draw(p) {
      for (const s of [-1, 1]) {
        for (let i = 0; i <= 8; i++) p.soft(s * (0.24 + i * 0.032), 0.16 + Math.sin((i / 8) * Math.PI) * 0.03, 26, color('shadow'), 0.5);
      }
      star(p, 0.55, -0.3, 0.11, color('paint'));
      star(p, -0.52, -0.42, 0.06, color('paint'));
      p.lips(color('lipstick'));
    },
  },
  {
    name: '小丑',
    hint: '红鼻头 + 大笑脸 + 蓝菱形',
    draw(p) {
      const red = color('lipstick');
      p.dot(0, -0.2, 30, red);
      p.line([[-0.3, -0.33], [-0.15, -0.46], [0, -0.49], [0.15, -0.46], [0.3, -0.33]], 22, red);
      for (const s of [-1, 1]) {
        const az = s * 0.36;
        p.poly([[az, 0.22], [az + 0.05, 0.1], [az, -0.02], [az - 0.05, 0.1]], color('paint'));
        p.poly([[az, -0.1], [az + 0.045, -0.2], [az, -0.31], [az - 0.045, -0.2]], color('paint'));
      }
    },
  },
];

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawLook(look) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  look.draw(painter(c.getContext('2d')));
  return c;
}

// ---------- scoring ----------
// Compare the face region of (base + player paint) against (base + target),
// downsampled so small offsets are forgiven. Only pixels where either side has
// makeup count, so a bare face scores 0 rather than "mostly matching".
const REGION = (() => {
  const [x0, y0] = angleToCanvas(1.25, 0.55);
  const [x1, y1] = angleToCanvas(-1.25, -1.0);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
})();
const SW = 80;
const SH = Math.round((SW * REGION.h) / REGION.w);

function sample(base, layer) {
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  const { x, y, w, h } = REGION;
  ctx.drawImage(base, x, y, w, h, 0, 0, SW, SH);
  if (layer) ctx.drawImage(layer, x, y, w, h, 0, 0, SW, SH);
  return ctx.getImageData(0, 0, SW, SH).data;
}

// Per pixel, compare the colour shift the player's makeup causes (mine - bare)
// with the shift the target causes (goal - bare). The error is relative to the
// amount of makeup, so a faint blush that was skipped counts as fully missed,
// and every pixel is weighted by how much makeup it carries.
export function rawScore(face, targetLayer) {
  const bare = sample(face.base, null);
  const mine = sample(face.base, face.paint);
  const goal = sample(face.base, targetLayer);
  let total = 0;
  let weight = 0;
  for (let i = 0; i < bare.length; i += 4) {
    let g = 0, m = 0, e = 0;
    for (let k = 0; k < 3; k++) {
      const dg = goal[i + k] - bare[i + k];
      const dm = mine[i + k] - bare[i + k];
      g += Math.abs(dg);
      m += Math.abs(dm);
      e += Math.abs(dm - dg);
    }
    const w = Math.max(g, m);
    if (w < 12) continue; // no makeup on either side
    total += w * Math.max(0, 1 - e / w);
    weight += w;
  }
  return weight ? total / weight : 0;
}

// Hand-painting never matches a procedural target exactly (a careful copy
// lands around 0.6 raw, a rough one around 0.4), so stretch and ease the scale.
// Bare face or the wrong look stays at 0; an exact copy is 100.
export function scoreFace(face, targetLayer) {
  return Math.round(Math.min(1, rawScore(face, targetLayer) / 0.65) ** 0.8 * 100);
}

export const stars = (score) => '★★★★★'.slice(0, Math.max(1, Math.round(score / 20))).padEnd(5, '☆');

// ---------- board on the wall: reference card, timer, result ----------
export class ChallengeBoard {
  constructor(scene, origin) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 760;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2 * (760 / 512)),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    this.mesh.position.copy(origin);
    this.mesh.rotation.y = 0.45; // angled toward the player
    scene.add(this.mesh);
    this.render({ title: '化妆挑战', lines: ['碰一下铃铛开始', '（或按 B / Y 键）'] });
  }

  render({ title, reference = null, lines = [] }) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    ctx.fillStyle = '#fff7f9';
    ctx.fillRect(0, 0, w, canvas.height);
    ctx.strokeStyle = '#ff8fb1';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, canvas.height - 10);
    ctx.fillStyle = '#5a3341';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(title, w / 2, 52);
    const imgY = 92;
    const imgH = 470;
    if (reference) {
      const iw = imgH * (reference.width / reference.height);
      ctx.drawImage(reference, (w - iw) / 2, imgY, iw, imgH);
    } else {
      ctx.fillStyle = '#ffe3ec';
      ctx.fillRect(40, imgY, w - 80, imgH);
      ctx.fillStyle = '#ff8fb1';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('?', w / 2, imgY + imgH / 2);
    }
    ctx.fillStyle = '#5a3341';
    ctx.font = 'bold 38px "Microsoft YaHei", "PingFang SC", sans-serif';
    lines.forEach((l, i) => ctx.fillText(l, w / 2, imgY + imgH + 52 + i * 54));
    this.texture.needsUpdate = true;
  }
}

// ---------- the game loop ----------
export class Challenge {
  constructor({ duration = 120, onChange }) {
    this.duration = duration;
    this.onChange = onChange; // (state) => void, for the 3D board and the HUD
    this.state = { phase: 'idle' };
    this._lastSecond = -1;
  }

  get running() { return this.state.phase === 'running'; }

  start(look, reference, targetLayer) {
    this.state = { phase: 'running', look, reference, targetLayer, timeLeft: this.duration };
    this._lastSecond = -1;
    this.onChange(this.state);
  }

  finish(score) {
    this.state = { ...this.state, phase: 'result', score };
    this.onChange(this.state);
  }

  // returns true when time just ran out
  update(dt) {
    if (!this.running) return false;
    this.state.timeLeft = Math.max(0, this.state.timeLeft - dt);
    const s = Math.ceil(this.state.timeLeft);
    if (s !== this._lastSecond) { this._lastSecond = s; this.onChange(this.state); }
    return this.state.timeLeft === 0;
  }
}

export function formatTime(t) {
  const s = Math.ceil(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
