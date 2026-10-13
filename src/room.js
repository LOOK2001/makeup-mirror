import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Arched outline centred on the origin: rounded bottom corners, semicircular top.
export function archShape(w, h, corner = 0.03) {
  const s = new THREE.Shape();
  const x = w / 2;
  const yb = -h / 2;
  const yc = h / 2 - x; // arch centre
  s.moveTo(-x + corner, yb);
  s.lineTo(x - corner, yb);
  s.quadraticCurveTo(x, yb, x, yb + corner);
  s.lineTo(x, yc);
  s.absarc(0, yc, x, 0, Math.PI, false);
  s.lineTo(-x, yb + corner);
  s.quadraticCurveTo(-x, yb, -x + corner, yb);
  return s;
}

function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

const wallpaper = () => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#f7dfe3';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2d0d7';
  ctx.fillRect(0, 0, w / 2, h);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = 16; y < h; y += 32) for (const x of [64, 192]) {
    ctx.beginPath();
    ctx.arc(x + ((y / 32) % 2) * 0, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}, [10, 4]);

const woodFloor = () => canvasTexture(512, 512, (ctx, w, h) => {
  const plankH = 64;
  for (let y = 0; y < h; y += plankH) {
    let x = -Math.random() * 200;
    while (x < w) {
      const len = 160 + Math.random() * 200;
      const tone = 170 + Math.random() * 30;
      ctx.fillStyle = `rgb(${tone + 30},${tone - 5},${tone - 45})`;
      ctx.fillRect(x, y, len, plankH);
      for (let i = 0; i < 14; i++) { // grain
        ctx.strokeStyle = `rgba(110,70,40,${0.06 + Math.random() * 0.08})`;
        ctx.beginPath();
        const gy = y + Math.random() * plankH;
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(x + len * 0.3, gy + 4, x + len * 0.6, gy - 4, x + len, gy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(80,50,30,0.35)';
      ctx.fillRect(x, y, 2, plankH);
      x += len;
    }
    ctx.fillStyle = 'rgba(80,50,30,0.35)';
    ctx.fillRect(0, y, w, 2);
  }
}, [4, 4]);

const marble = () => canvasTexture(512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#fbf8f6';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(170,160,170,${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    let x = Math.random() * w;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < h) { x += (Math.random() - 0.5) * 40; y += 10 + Math.random() * 20; ctx.lineTo(x, y); }
    ctx.stroke();
  }
});

const artwork = () => canvasTexture(256, 320, (ctx, w, h) => {
  ctx.fillStyle = '#fff4e8';
  ctx.fillRect(0, 0, w, h);
  const blobs = [['#ffb5c5', 90, 120, 70], ['#ffd27a', 170, 190, 55], ['#9fd8c8', 110, 230, 45], ['#c8a8e8', 175, 95, 35]];
  for (const [c, x, y, r] of blobs) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#5a3341';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(40, 280);
  ctx.bezierCurveTo(100, 200, 160, 300, 220, 60);
  ctx.stroke();
});

export function buildRoom(scene, L) {
  const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m; };

  // floor + rug
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: woodFloor(), roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  shadowed(floor, false, true);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), new THREE.MeshStandardMaterial({ color: 0xfbe9ee, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.003, 0.2);
  shadowed(rug, false, true);

  // walls with baseboards
  const wallMat = new THREE.MeshStandardMaterial({ map: wallpaper(), roughness: 0.95 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const wall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 3), wallMat);
    m.position.set(x, 1.5, z);
    m.rotation.y = ry;
    shadowed(m, false, true);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.015), trim);
    b.position.set(x, 0.05, z);
    b.rotation.y = ry;
    b.translateZ(0.008);
    scene.add(b);
    return m;
  };
  wall(3.2, 0, L.MIRROR_Z - 0.05, 0);
  wall(3.2, 0, 2.2, Math.PI);
  wall(2.8, -1.6, 0.8, Math.PI / 2);
  wall(2.8, 1.6, 0.8, -Math.PI / 2);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 2.8, 0.8);
  scene.add(ceiling);

  // window on the left wall with a bright sky and curtains
  const win = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshBasicMaterial({
    map: canvasTexture(64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#9fd3ff');
      g.addColorStop(1, '#fff3e0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
    toneMapped: false,
  }));
  win.add(sky);
  for (const [w, h, x, y] of [[0.96, 0.04, 0, 0.57], [0.96, 0.06, 0, -0.58], [0.04, 1.1, -0.47, 0], [0.04, 1.1, 0.47, 0], [0.02, 1.1, 0, 0], [0.9, 0.02, 0, 0]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), trim);
    f.position.set(x, y, 0.01);
    win.add(f);
  }
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0xffc9d6, roughness: 1, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.3, 1.4, 24, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 60) * 0.015 + 0.02);
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, curtainMat);
    c.position.set(s * 0.6, -0.05, 0.03);
    win.add(c);
  }
  win.position.set(-1.59, 1.55, 0.3);
  win.rotation.y = Math.PI / 2;
  scene.add(win);

  // art + shelf behind the player (shows up in the mirror)
  const art = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xe0b860, metalness: 1, roughness: 0.3 }));
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.56), new THREE.MeshStandardMaterial({ map: artwork(), roughness: 0.9 }));
  canvas.position.z = 0.016;
  art.add(frame, canvas);
  art.position.set(-0.55, 1.75, 2.18);
  art.rotation.y = Math.PI;
  scene.add(art);

  const shelf = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.035, 0.22, 2, 0.008), trim);
  shelf.position.set(0.45, 1.35, 2.08);
  shadowed(shelf);
  [0x8fd3c7, 0xffc857, 0xb39ddb].forEach((c, i) => {
    const x = 0.2 + i * 0.25;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.1, 32), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    pot.position.set(x, 1.42, 2.08);
    shadowed(pot);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 2), new THREE.MeshStandardMaterial({ color: 0x5fae6b, flatShading: true, roughness: 0.8 }));
    plant.position.set(x, 1.53, 2.08);
    plant.scale.y = 1.2;
    shadowed(plant);
  });

  // vanity counter + cabinet with drawers
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.04, 0.05, 0.38, 3, 0.012), new THREE.MeshPhysicalMaterial({ map: marble(), roughness: 0.25, clearcoat: 0.6 }));
  top.position.set(0, L.COUNTER_TOP - 0.025, L.MIRROR_Z + 0.18);
  shadowed(top, true, true);
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xd99aac, roughness: 0.6 });
  const cabinet = new THREE.Mesh(new RoundedBoxGeometry(0.98, L.COUNTER_TOP - 0.05, 0.33, 3, 0.01), cabMat);
  cabinet.position.set(0, (L.COUNTER_TOP - 0.05) / 2, L.MIRROR_Z + 0.17);
  shadowed(cabinet, false, true);
  const knob = new THREE.MeshPhysicalMaterial({ color: 0xe0b860, metalness: 1, roughness: 0.25 });
  for (let row = 0; row < 3; row++) for (const s of [-1, 1]) {
    const y = L.COUNTER_TOP - 0.16 - row * 0.28;
    const d = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.24, 0.02, 2, 0.006), cabMat);
    d.position.set(s * 0.235, y, L.MIRROR_Z + 0.34);
    shadowed(d, false, true);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), knob);
    k.position.set(s * 0.235, y, L.MIRROR_Z + 0.36);
    scene.add(k);
  }

  // decor at the back corners of the counter, out of the way of the tools
  const vaseGlass = new THREE.MeshPhysicalMaterial({ color: 0xd8f0ff, roughness: 0.05, transparent: true, opacity: 0.5, clearcoat: 1 });
  const vase = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.035, 0], [0.045, 0.05], [0.03, 0.12], [0.034, 0.15], [0, 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), 32), vaseGlass);
  vase.position.set(-0.43, L.COUNTER_TOP, L.MIRROR_Z + 0.09);
  shadowed(vase);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4f9a5a });
  const petals = [0xff7fa3, 0xffffff, 0xffb3c6, 0xff5c8a, 0xfff0a0];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const h = 0.26 + Math.random() * 0.06;
    const tip = new THREE.Vector3(Math.cos(a) * 0.05, h, Math.sin(a) * 0.04);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, h, 6), stemMat);
    stem.position.copy(tip).multiplyScalar(0.5);
    stem.lookAt(tip);
    stem.rotateX(Math.PI / 2);
    const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 1), new THREE.MeshStandardMaterial({ color: petals[i], roughness: 0.7, flatShading: true }));
    flower.position.copy(tip);
    const grp = new THREE.Group();
    grp.add(stem, flower);
    grp.position.copy(vase.position);
    scene.add(grp);
  }
  const perfume = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.07, 0.03, 3, 0.008), new THREE.MeshPhysicalMaterial({ color: 0xffc0d8, roughness: 0.05, transparent: true, opacity: 0.7, clearcoat: 1 }));
  perfume.position.set(0.42, L.COUNTER_TOP + 0.035, L.MIRROR_Z + 0.1);
  shadowed(perfume);
  const pcap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), knob);
  pcap.position.set(0.42, L.COUNTER_TOP + 0.08, L.MIRROR_Z + 0.1);
  shadowed(pcap);
}

export function buildMirrorFrame(scene, L) {
  const t = 0.05;
  const outer = archShape(L.MIRROR_W + 2 * t, L.MIRROR_H + 2 * t, 0.05);
  outer.holes.push(archShape(L.MIRROR_W, L.MIRROR_H));
  const depth = 0.02;
  const geo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 4, curveSegments: 64 });
  const frame = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 0.8 }));
  frame.position.set(0, L.MIRROR_Y, L.MIRROR_Z - depth / 2);
  frame.castShadow = true;
  frame.receiveShadow = true;
  scene.add(frame);

  // Hollywood bulbs along the frame (not on the bottom edge)
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0cc, emissiveIntensity: 2.2 });
  const socketMat = new THREE.MeshPhysicalMaterial({ color: 0xe0b860, metalness: 1, roughness: 0.3 });
  const bulbGeo = new THREE.SphereGeometry(0.017, 24, 16);
  const socketGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.014, 16);
  const path = archShape(L.MIRROR_W + t, L.MIRROR_H + t, 0.04);
  for (const p of path.getSpacedPoints(22)) {
    if (p.y < -L.MIRROR_H / 2 + 0.06) continue;
    const s = new THREE.Mesh(socketGeo, socketMat);
    s.rotation.x = Math.PI / 2;
    s.position.set(p.x, L.MIRROR_Y + p.y, L.MIRROR_Z + depth / 2 + 0.012);
    const b = new THREE.Mesh(bulbGeo, bulbMat);
    b.position.set(p.x, L.MIRROR_Y + p.y, L.MIRROR_Z + depth / 2 + 0.03);
    scene.add(s, b);
  }
}
