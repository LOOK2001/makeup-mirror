import * as THREE from 'three';
import { SKIN } from './faceCanvas.js';

// The avatar is only visible to the mirror's camera. Layers 1 and 2 are
// reserved by three.js for the left/right XR eyes, so we use 5.
export const AVATAR_LAYER = 5;

// Chibi proportions: a big round head on a small body.
const HEAD_R = 0.135;
export const LOOK = {
  hair: '#4a4580',
  hairShade: '#2e2a5c',
  hairShine: '#8f8ad0',
  iris: '#3c8fd6',
  irisDark: '#1d3f78',
  dress: '#ffb3c7',
  accent: '#ffd23f',
  outline: '#3a2836',
};

const EYE_AZ = 0.36;
const EYE_EL = -0.06;
const EYE_SIZE = new THREE.Vector3(0.021, 0.026, 0.01); // ellipsoid radii
const OUTLINE = 0.0022;

const smooth = THREE.MathUtils.smoothstep;
const gauss = (az, el, caz, cel, saz, sel) => Math.exp(-(((az - caz) / saz) ** 2) - (((el - cel) / sel) ** 2));

// Soft cartoon features as radial offsets (metres).
function featureBumps(az, el) {
  let d = 0;
  d += 0.005 * gauss(az, el, 0, -0.2, 0.05, 0.05); // button nose
  for (const s of [-1, 1]) d += 0.007 * gauss(az, el, s * 0.48, -0.32, 0.2, 0.17); // puffy cheeks
  for (const s of [-1, 1]) d -= 0.003 * gauss(az, el, s * EYE_AZ, EYE_EL, 0.16, 0.18); // eyes sit flat
  return d;
}

// Surface point for a direction on the unit sphere. Keeps the sphere's UVs
// (and therefore the face-canvas layout) while giving the head its shape.
function headPointFromDir(dir, extra = 0, withFeatures = true) {
  const az = Math.atan2(dir.x, -dir.z);
  const el = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  const r = HEAD_R + (withFeatures ? featureBumps(az, el) : 0) + extra;
  const p = dir.clone().multiplyScalar(r);
  p.y *= 0.94;
  p.z *= 0.95;
  // soft, rounded chin
  const jaw = smooth(-dir.y, 0.3, 1.0);
  p.x *= 1 - 0.14 * jaw;
  if (dir.z > 0) p.z *= 1 - 0.2 * jaw;
  return p;
}

export function headPoint(az, el, extra = 0, withFeatures = true) {
  return headPointFromDir(dirFromAngles(az, el), extra, withFeatures);
}

function dirFromAngles(az, el) {
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

function sculptedSphere(ws, hs, pointFn) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.rotateY(Math.PI / 2); // face centre at uv (0.5, 0.5), seam at the back
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    pos.setXYZ(i, ...pointFn(v).toArray());
  }
  g.computeVertexNormals();
  return g;
}

// ---------- toon look ----------
const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const toon = (params) => new THREE.MeshToonMaterial({ gradientMap: toonRamp, ...params });

// Inverted-hull outline: the back faces pushed out along the normal, drawn dark.
function outlined(mesh, thickness = OUTLINE, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ color: LOOK.outline, side: THREE.BackSide, ...extra });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${thickness.toFixed(5)};`);
  };
  const o = new THREE.Mesh(mesh.geometry, m);
  mesh.add(o);
  return mesh;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Big anime eye, planar-mapped onto the front of a flattened ellipsoid.
function eyeTexture(side) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (side < 0) { ctx.translate(w, 0); ctx.scale(-1, 1); } // mirror lashes for the other eye
    const cx = 128, cy = 140;
    const g = ctx.createLinearGradient(0, cy - 90, 0, cy + 90);
    g.addColorStop(0, LOOK.irisDark);
    g.addColorStop(0.55, LOOK.iris);
    g.addColorStop(1, '#9fe0ff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 78, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = LOOK.irisDark;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#111428';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 34, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx - 30, cy - 38, 22, 26, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 34, cy + 40, 10, 0, Math.PI * 2);
    ctx.fill();
    // thick upper lash line with a flick at the outer corner
    ctx.strokeStyle = LOOK.outline;
    ctx.lineCap = 'round';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.ellipse(128, 150, 118, 128, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(26, 82);
    ctx.quadraticCurveTo(6, 64, 4, 40);
    ctx.stroke();
  });
}

function eyeGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 28);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.5 + 0.5, pos.getY(i) * 0.5 + 0.5);
  g.scale(EYE_SIZE.x, EYE_SIZE.y, EYE_SIZE.z);
  return g;
}

// ---------- hair ----------
const tooth = (x, width) => { const t = ((x / width) % 1 + 1) % 1; return Math.abs(t - 0.5) * 2; }; // 0 at a clump tip

// Pointed clumps of bangs at the front, a chin-length bob at the sides and back.
function isHair(az, el) {
  const a = Math.abs(az);
  const front = 0.28 + 0.2 * tooth(az + 0.11, 0.22);
  const back = -0.62 + 0.12 * tooth(az, 0.3);
  return el > THREE.MathUtils.lerp(front, back, smooth(a, 0.9, 1.3));
}

function hairMask() {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const el = (0.5 - (y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const az = (0.5 - (x + 0.5) / w) * Math.PI * 2;
      const v = isHair(az, el) ? 255 : 0;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function hairColor() {
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = LOOK.hair;
    ctx.fillRect(0, 0, w, h);
    // darker towards the ends
    const g = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, LOOK.hairShade);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // "angel ring": a glossy band whose lower edge dips into each clump
    ctx.fillStyle = LOOK.hairShine;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.22);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, h * 0.22 + Math.sin(x * 0.11) * 1.5);
    for (let x = w; x >= 0; x -= 4) ctx.lineTo(x, h * 0.27 + Math.abs(Math.sin(x * 0.11)) * 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function hairGeometry() {
  const extraAt = (az, el) => {
    const a = Math.abs(az);
    return 0.011 + 0.01 * smooth(a, 0.5, 2.0) + 0.018 * smooth(-el, -0.1, 0.6) * smooth(a, 0.9, 1.3);
  };
  const g = sculptedSphere(160, 96, (dir) => {
    const az = Math.atan2(dir.x, -dir.z);
    const el = Math.asin(dir.y);
    return headPointFromDir(dir, extraAt(az, el), false);
  });
  // drop triangles well outside the mask; the alpha map cuts the exact edge
  const idx = g.index.array;
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const near = (i) => {
    v.fromBufferAttribute(pos, i).normalize();
    const az = Math.atan2(v.x, -v.z), el = Math.asin(v.y);
    return isHair(az, el) || isHair(az, el + 0.08);
  };
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    if (near(idx[i]) || near(idx[i + 1]) || near(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(keep);
  return g;
}

export class Avatar {
  constructor(faceTexture) {
    this.root = new THREE.Group();
    this.head = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.head, this.body);

    const skin = toon({ color: SKIN });

    this.headMesh = new THREE.Mesh(sculptedSphere(200, 128, (d) => headPointFromDir(d)), toon({ map: faceTexture }));
    this.head.add(outlined(this.headMesh));

    // eyes
    this.eyes = [];
    const eyeGeo = eyeGeometry();
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ map: eyeTexture(side), toneMapped: false }));
      const p = headPoint(side * EYE_AZ, EYE_EL, -0.0045);
      eye.position.copy(p);
      eye.lookAt(p.clone().add(dirFromAngles(side * EYE_AZ * 0.8, EYE_EL))); // face outward, slightly forward
      this.head.add(eye);
      this.eyes.push(eye);
    }
    this.blink = { t: 0, next: 2.5 };

    // ears peeking out of the bob
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.copy(headPoint(side * Math.PI / 2, -0.12, -0.004, false));
      this.head.add(outlined(ear, 0.0015));
    }

    // hair: cut-out shell + space buns + ahoge
    const mask = hairMask();
    const hairMat = toon({ map: hairColor(), alphaMap: mask, alphaTest: 0.5, side: THREE.DoubleSide });
    const hair = new THREE.Mesh(hairGeometry(), hairMat);
    this.head.add(outlined(hair, OUTLINE, { alphaMap: mask, alphaTest: 0.5 }));
    const bunMat = toon({ color: LOOK.hair });
    const tieMat = toon({ color: LOOK.accent });
    for (const side of [-1, 1]) {
      const bunPos = headPoint(side * 0.95, 0.72, 0.03, false);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 32, 24), bunMat);
      bun.position.copy(bunPos);
      this.head.add(outlined(bun));
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 12, 32), tieMat);
      tie.position.copy(bunPos).multiplyScalar(0.9);
      tie.lookAt(bunPos.clone().multiplyScalar(2));
      this.head.add(outlined(tie, 0.0015));
    }
    const top = headPoint(0.1, 1.2, 0.008, false);
    const ahogeCurve = new THREE.CatmullRomCurve3([
      top.clone().multiplyScalar(0.95),
      top.clone().add(new THREE.Vector3(0.0, 0.035, -0.01)),
      top.clone().add(new THREE.Vector3(0.025, 0.055, -0.02)),
      top.clone().add(new THREE.Vector3(0.04, 0.045, -0.035)),
    ]);
    const ahoge = new THREE.Mesh(new THREE.TubeGeometry(ahogeCurve, 24, 0.004, 8), bunMat);
    this.head.add(outlined(ahoge, 0.0012));

    // small body: neck, A-line dress, collar with a bow, stubby arms
    const torso = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.06, 20), skin);
    neck.position.y = 0.015;
    const dressMat = toon({ color: LOOK.dress });
    // listed bottom-to-top so the lathe normals face outward
    const dressProfile = [[0, -0.205], [0.11, -0.205], [0.115, -0.2], [0.09, -0.12], [0.088, -0.07], [0.082, -0.03], [0.06, -0.008], [0.03, 0]];
    const dress = new THREE.Mesh(new THREE.LatheGeometry(dressProfile.map(([x, y]) => new THREE.Vector2(x, y)), 48), dressMat);
    dress.scale.z = 0.78;
    const collarMat = toon({ color: '#ffffff' });
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 12), collarMat);
      c.scale.set(1, 0.3, 0.8);
      c.position.set(side * 0.026, -0.008, -0.04);
      c.rotation.z = side * 0.25;
      torso.add(outlined(c, 0.0012));
    }
    const bowMat = toon({ color: LOOK.accent });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.026, 16), bowMat);
      wing.rotation.z = side * Math.PI / 2;
      wing.position.set(side * 0.013, -0.018, -0.062);
      torso.add(outlined(wing, 0.0012));
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), bowMat);
    knot.position.set(0, -0.018, -0.064);
    torso.add(knot);
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.045, 6, 16), dressMat);
      sleeve.position.y = -0.03;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), skin);
      hand.position.y = -0.07;
      arm.add(outlined(sleeve, 0.0015), outlined(hand, 0.0015));
      arm.position.set(side * 0.08, -0.02, 0);
      arm.rotation.z = side * 0.35;
      torso.add(arm);
    }
    torso.add(outlined(neck, 0.0015), outlined(dress));
    torso.position.set(0, -HEAD_R * 0.98, 0.01);
    this.body.add(torso);

    this.root.traverse((o) => o.layers.set(AVATAR_LAYER));

    // put the avatar's eyes where the viewer's eyes are (just behind the eye surface)
    const eyeMid = this.eyes[0].position.clone().add(this.eyes[1].position).multiplyScalar(0.5);
    this.headOffset = eyeMid.add(new THREE.Vector3(0, 0, 0.008)).negate();

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  // Place the head where the viewer's head is. `camera.matrixWorld` must be current.
  update(camera, dt = 0) {
    camera.matrixWorld.decompose(this.head.position, this.head.quaternion, this.head.scale);
    this.head.scale.setScalar(1);
    this.head.position.add(this.headOffset.clone().applyQuaternion(this.head.quaternion));

    this._euler.setFromQuaternion(this.head.quaternion);
    this.body.quaternion.setFromEuler(this._euler.set(0, this._euler.y, 0));
    this.body.position.copy(this.head.position);

    // occasional cartoon blink: squash the eyes
    const b = this.blink;
    b.t += dt;
    let close = 0;
    if (b.t > b.next) {
      const k = (b.t - b.next) / 0.18;
      close = k < 1 ? Math.sin(k * Math.PI) : 0;
      if (k >= 1) { b.t = 0; b.next = 2 + Math.random() * 4; }
    }
    for (const e of this.eyes) e.scale.y = 1 - close * 0.9;

    this.root.updateMatrixWorld(true);
  }

  get headCenter() {
    return this.head.position;
  }
}
