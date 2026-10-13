import * as THREE from 'three';

// radius is in face-texture pixels (~0.6 mm each on the head).
export const TOOLS = [
  { id: 'lipstick', name: '口红', color: '#c8102e', radius: 7, alpha: 0.85, soft: false, kind: 'stick' },
  { id: 'blush', name: '腮红', color: '#ff6f91', radius: 34, alpha: 0.10, soft: true, kind: 'compact' },
  { id: 'shadow', name: '眼影', color: '#8a4fc4', radius: 13, alpha: 0.22, soft: true, kind: 'compact' },
  { id: 'liner', name: '眼线', color: '#1a1214', radius: 2.2, alpha: 0.95, soft: false, kind: 'pencil' },
  { id: 'glow', name: '高光', color: '#fff6dc', radius: 18, alpha: 0.14, soft: true, kind: 'compact' },
  { id: 'paint', name: '彩绘', color: '#25b8ff', radius: 6, alpha: 0.9, soft: false, kind: 'pot' },
  { id: 'remover', name: '卸妆棉', color: '#ffffff', radius: 22, alpha: 0.5, soft: true, erase: true, kind: 'pad' },
  { id: 'clear', name: '全部卸妆', color: '#9fd8e8', action: 'clear', kind: 'bottle' },
];

const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
const black = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

function colored(tool) {
  return new THREE.MeshStandardMaterial({ color: tool.color, roughness: 0.5, emissive: 0x000000 });
}

function buildMesh(tool) {
  const g = new THREE.Group();
  const mat = colored(tool);
  switch (tool.kind) {
    case 'stick': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 20), gold);
      body.position.y = 0.025;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.02, 20), mat);
      tip.position.y = 0.06;
      g.add(body, tip);
      break;
    }
    case 'compact': {
      const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 32), gold);
      caseM.position.y = 0.005;
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 32), mat);
      pan.position.y = 0.011;
      g.add(caseM, pan);
      break;
    }
    case 'pencil': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 12), black);
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.006;
      g.add(body);
      break;
    }
    case 'pot': {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
      jar.position.y = 0.0125;
      const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.004, 24), mat);
      paint.position.y = 0.026;
      g.add(jar, paint);
      break;
    }
    case 'pad': {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
      pad.position.y = 0.004;
      g.add(pad);
      break;
    }
    case 'bottle': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 24), new THREE.MeshStandardMaterial({ color: tool.color, roughness: 0.1, transparent: true, opacity: 0.8 }));
      b.position.y = 0.04;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 16), gold);
      cap.position.y = 0.09;
      g.add(b, cap);
      break;
    }
  }
  // highlight ring shown under the selected tool
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.034, 0.04, 32),
    new THREE.MeshBasicMaterial({ color: 0xff4f8b, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

function buildLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 40px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a3341';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 0.02),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  m.rotation.x = -Math.PI / 2.6; // tilt toward the viewer
  return m;
}

// Lays the tools out along the front edge of the counter.
export function createToolTray(counterTopY, z) {
  const tray = new THREE.Group();
  const items = [];
  const spacing = 0.095;
  TOOLS.forEach((tool, i) => {
    const mesh = buildMesh(tool);
    mesh.position.set((i - (TOOLS.length - 1) / 2) * spacing, counterTopY, z);
    const label = buildLabel(tool.name);
    label.position.set(0, 0.002, 0.05);
    mesh.add(label);
    tray.add(mesh);
    items.push({ tool, mesh, touchPoint: new THREE.Vector3() });
  });
  return { tray, items };
}

export function setSelected(items, selectedTools) {
  for (const it of items) it.mesh.userData.ring.visible = selectedTools.includes(it.tool);
}

// A makeup brush attached to an XR controller's target-ray space. The tip
// colour shows the current tool.
export function createBrush() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4 }));
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.045;
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.004, 0.015, 12), gold);
  ferrule.rotation.x = Math.PI / 2;
  ferrule.position.z = -0.097;
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 16, 12), tipMat);
  tip.scale.z = 2;
  tip.position.z = -0.11;
  g.add(handle, ferrule, tip);
  g.userData.tip = tip;
  g.userData.tipMat = tipMat;
  return g;
}

export const BRUSH_TIP_LOCAL = new THREE.Vector3(0, 0, -0.118);
