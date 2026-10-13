import * as THREE from 'three';
import { AVATAR_LAYER } from './avatar.js';

const PHOTO_W = 600;
const PHOTO_H = 720;

// Renders a head-and-shoulders portrait of the avatar from a camera floating
// in front of it, flipped so it matches what the player saw in the mirror.
export class PhotoBooth {
  constructor(renderer, scene, avatar, { minZ }) {
    this.renderer = renderer;
    this.scene = scene;
    this.avatar = avatar;
    this.minZ = minZ; // keep the camera on the player's side of the mirror wall
    this.rt = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H, { samples: 4 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(46, PHOTO_W / PHOTO_H, 0.02, 20);
    this.camera.layers.enable(AVATAR_LAYER);
    this.pixels = new Uint8Array(PHOTO_W * PHOTO_H * 4);
    this._fwd = new THREE.Vector3();
  }

  // Returns a canvas with the portrait. `neutral` faces the head straight ahead
  // (used for challenge reference cards).
  capture({ neutral = false } = {}) {
    const { renderer, avatar, camera } = this;
    const head = avatar.head;
    const savedQ = head.quaternion.clone();
    if (neutral) {
      head.quaternion.copy(avatar.body.quaternion);
      avatar.root.updateMatrixWorld(true);
    }

    const center = avatar.headCenter;
    this._fwd.set(0, 0, -1).applyQuaternion(avatar.body.quaternion);
    camera.position.copy(center).addScaledVector(this._fwd, 0.42);
    camera.position.y -= 0.02;
    camera.position.z = Math.max(camera.position.z, this.minZ);
    camera.lookAt(center.x, center.y - 0.045, center.z);
    camera.updateMatrixWorld();

    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false; // render a plain 2D view even while in VR
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, camera);
    renderer.readRenderTargetPixels(this.rt, 0, 0, PHOTO_W, PHOTO_H, this.pixels);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;

    if (neutral) {
      head.quaternion.copy(savedQ);
      avatar.root.updateMatrixWorld(true);
    }

    // GL rows are bottom-up; also mirror horizontally like the reflection
    const c = document.createElement('canvas');
    c.width = PHOTO_W;
    c.height = PHOTO_H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(PHOTO_W, PHOTO_H);
    const src = this.pixels;
    const dst = img.data;
    for (let y = 0; y < PHOTO_H; y++) {
      const sy = PHOTO_H - 1 - y;
      for (let x = 0; x < PHOTO_W; x++) {
        const s = (sy * PHOTO_W + (PHOTO_W - 1 - x)) * 4;
        const d = (y * PHOTO_W + x) * 4;
        dst[d] = src[s];
        dst[d + 1] = src[s + 1];
        dst[d + 2] = src[s + 2];
        dst[d + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

// White-bordered instant photo with a handwritten-style caption.
export function polaroid(photo, caption) {
  const pad = 36;
  const c = document.createElement('canvas');
  c.width = photo.width + pad * 2;
  c.height = photo.height + pad + 150;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(photo, pad, pad);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.strokeRect(pad, pad, photo.width, photo.height);
  ctx.fillStyle = '#5a3341';
  ctx.font = 'bold 46px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, c.width / 2, photo.height + pad + 75);
  return c;
}

export function timeCaption() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Photos pinned to the wall beside the mirror, newest first.
export class PhotoWall {
  constructor(scene, origin, { max = 6, width = 0.11 } = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(origin);
    this.group.rotation.y = -0.45; // angled toward the player
    scene.add(this.group);
    this.max = max;
    this.width = width;
    this.cards = [];
    this.tapeMat = new THREE.MeshBasicMaterial({ color: 0xffd6e2, transparent: true, opacity: 0.85 });
  }

  add(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const h = this.width * (canvas.height / canvas.width);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(this.width, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(this.width * 0.4, this.width * 0.12), this.tapeMat);
    tape.position.set(0, h / 2, 0.001);
    tape.rotation.z = (Math.random() - 0.5) * 0.3;
    card.add(tape);
    card.userData.h = h;
    this.group.add(card);
    this.cards.unshift(card);
    while (this.cards.length > this.max) {
      const old = this.cards.pop();
      this.group.remove(old);
      old.material.map.dispose();
    }
    this.layout();
    return card;
  }

  layout() {
    this.cards.forEach((card, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      card.position.set(col * (this.width + 0.02), -row * (card.userData.h + 0.025), 0.002 + i * 0.0005);
      card.rotation.z = ((i * 7919) % 11 - 5) * 0.012; // stable little tilt
    });
  }
}
