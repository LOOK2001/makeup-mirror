import * as THREE from 'three';

// radius is in face-texture pixels (~0.3 mm each on the head).
export const TOOLS = [
  { id: 'lipstick', name: '口红', color: '#c8102e', radius: 14, alpha: 0.85, soft: false, kind: 'stick' },
  { id: 'blush', name: '腮红', color: '#ff6f91', radius: 68, alpha: 0.08, soft: true, kind: 'compact' },
  { id: 'shadow', name: '眼影', color: '#8a4fc4', radius: 26, alpha: 0.18, soft: true, kind: 'compact' },
  { id: 'liner', name: '眼线', color: '#1a1214', radius: 4.5, alpha: 0.95, soft: false, kind: 'pencil' },
  { id: 'glow', name: '高光', color: '#fff6dc', radius: 36, alpha: 0.12, soft: true, kind: 'compact' },
  { id: 'paint', name: '彩绘', color: '#25b8ff', radius: 12, alpha: 0.9, soft: false, kind: 'pot' },
  { id: 'remover', name: '卸妆棉', color: '#ffffff', radius: 44, alpha: 0.5, soft: true, erase: true, kind: 'pad' },
  { id: 'clear', name: '全部卸妆', color: '#9fd8e8', action: 'clear', kind: 'bottle' },
];

const gold = new THREE.MeshPhysicalMaterial({ color: 0xe0b860, metalness: 1, roughness: 0.25, clearcoat: 0.5 });
const blackGloss = new THREE.MeshPhysicalMaterial({ color: 0x1b1b1f, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05 });

const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

function product(tool) {
  return new THREE.MeshPhysicalMaterial({ color: tool.color, roughness: 0.45, clearcoat: 0.3 });
}

function pressedPowder(tool) {
  // speckled powder so pans read as powder instead of plastic
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = tool.color;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; // brush swipe
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(64, 64, 26, 0.3, 2.2);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

function buildMesh(tool) {
  const g = new THREE.Group();
  const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  switch (tool.kind) {
    case 'stick': {
      add(new THREE.Mesh(lathe([[0, 0], [0.0105, 0], [0.0105, 0.035], [0, 0.035]]), blackGloss));
      add(new THREE.Mesh(lathe([[0, 0], [0.0098, 0], [0.0098, 0.014], [0, 0.014]]), gold), 0, 0.035);
      const bullet = add(new THREE.Mesh(lathe([[0, 0], [0.0072, 0], [0.0072, 0.016], [0.004, 0.023], [0, 0.024]]), product(tool)), 0, 0.049);
      bullet.rotation.z = 0.12; // the angled tip
      const cap = add(new THREE.Mesh(lathe([[0, 0], [0.011, 0], [0.011, 0.04], [0, 0.04]]), blackGloss), 0.028, 0.011, 0.004);
      cap.rotation.z = Math.PI / 2;
      break;
    }
    case 'compact': {
      add(new THREE.Mesh(lathe([[0, 0], [0.031, 0], [0.033, 0.004], [0.032, 0.009], [0, 0.009]], 64), gold));
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 64), pressedPowder(tool)), 0, 0.009);
      // open lid with a small mirror, hinged at the back
      const lid = new THREE.Group();
      lid.position.set(0, 0.009, -0.031);
      lid.rotation.x = -1.95;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 64), gold);
      shell.position.z = 0.031;
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.025, 48), mirrorMat);
      m.rotation.x = Math.PI / 2;
      m.position.set(0, -0.0021, 0.031);
      lid.add(shell, m);
      g.add(lid);
      break;
    }
    case 'pencil': {
      const p = new THREE.Group();
      const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.11, 6), blackGloss);
      const wood = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.014, 6), new THREE.MeshStandardMaterial({ color: 0xe8c9a0, roughness: 0.9 }));
      wood.position.y = 0.062;
      const lead = new THREE.Mesh(new THREE.ConeGeometry(0.0016, 0.006, 12), product(tool));
      lead.position.y = 0.0665;
      const end = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.008, 12), gold);
      end.position.y = -0.055;
      p.add(hex, wood, lead, end);
      p.rotation.z = Math.PI / 2 - 0.15;
      p.position.y = 0.006;
      g.add(p);
      break;
    }
    case 'pot': {
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1 });
      add(new THREE.Mesh(lathe([[0, 0], [0.023, 0], [0.024, 0.004], [0.024, 0.026], [0.021, 0.028], [0, 0.028]]), glass));
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.02, 48), product(tool)), 0, 0.012);
      const lid = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 48), gold), 0.04, 0.005, -0.012);
      lid.rotation.x = 0.1;
      break;
    }
    case 'pad': {
      const cotton = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
      const padGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.005, 40);
      for (let i = 0; i < 4; i++) add(new THREE.Mesh(padGeo, cotton), (i % 2) * 0.003, 0.0026 + i * 0.0052, 0);
      break;
    }
    case 'bottle': {
      const glass = new THREE.MeshPhysicalMaterial({ color: tool.color, roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1, ior: 1.5 });
      add(new THREE.Mesh(lathe([[0, 0], [0.022, 0], [0.024, 0.006], [0.024, 0.06], [0.02, 0.07], [0.009, 0.076], [0.009, 0.084], [0, 0.084]]), glass));
      add(new THREE.Mesh(lathe([[0, 0], [0.011, 0], [0.011, 0.022], [0.009, 0.026], [0, 0.026]]), gold), 0, 0.082);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0243, 0.0243, 0.026, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
      add(label, 0, 0.035);
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  // highlight ring shown under the selected tool
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.036, 0.041, 48),
    new THREE.MeshBasicMaterial({ color: 0xff4f8b, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0008;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

function buildLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 56, 28);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(40, 36, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'bold 34px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a3341';
  ctx.fillText(text, 142, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.075, 0.021),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2.6; // tilt toward the viewer
  return m;
}

// Lays the tools out along the front edge of the counter.
export function createToolTray(counterTopY, z) {
  const tray = new THREE.Group();
  const items = [];
  const spacing = 0.098;
  TOOLS.forEach((tool, i) => {
    const mesh = buildMesh(tool);
    mesh.position.set((i - (TOOLS.length - 1) / 2) * spacing, counterTopY, z);
    const label = buildLabel(tool.name, tool.color);
    label.position.set(0, 0.002, 0.05);
    mesh.add(label);
    tray.add(mesh);
    items.push({ tool, mesh });
  });
  return { tray, items };
}

export function setSelected(items, selectedTools) {
  for (const it of items) it.mesh.userData.ring.visible = selectedTools.includes(it.tool);
}

// A makeup brush attached to an XR controller's target-ray space. The bristle
// tip takes the current tool's colour and its size follows the tool.
export function createBrush() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(lathe([[0, 0], [0.0055, 0], [0.006, 0.03], [0.0042, 0.085], [0, 0.085]], 24), new THREE.MeshPhysicalMaterial({ color: 0xf2a7bb, roughness: 0.3, clearcoat: 1 }));
  handle.rotation.x = -Math.PI / 2;
  const ferrule = new THREE.Mesh(lathe([[0, 0], [0.0043, 0], [0.0048, 0.016], [0, 0.016]], 24), gold);
  ferrule.rotation.x = -Math.PI / 2;
  ferrule.position.z = -0.085;
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  // bristles: base sits at the ferrule, length is fixed so the tip point stays put
  const tip = new THREE.Mesh(lathe([[0, 0], [0.0048, 0], [0.0062, 0.008], [0.0045, 0.014], [0, 0.017]], 24), tipMat);
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.101;
  g.add(handle, ferrule, tip);
  g.userData.tip = tip;
  g.userData.tipMat = tipMat;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function styleBrush(brush, tool) {
  brush.userData.tipMat.color.set(tool.color);
  // fluffy for powders, fine for liner/lipstick
  const w = THREE.MathUtils.clamp(0.45 + tool.radius / 40, 0.45, 2.1);
  brush.userData.tip.scale.set(w, 1, w);
}

export const BRUSH_TIP_LOCAL = new THREE.Vector3(0, 0, -0.118);
