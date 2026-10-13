import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { FaceCanvas } from './faceCanvas.js';
import { Avatar, AVATAR_LAYER } from './avatar.js';
import { TOOLS, createToolTray, setSelected, createBrush, BRUSH_TIP_LOCAL } from './tools.js';

// ---------- layout (metres; the player stands at the origin facing -Z) ----------
const COUNTER_TOP = 1.0;
const MIRROR_Z = -0.6;
const MIRROR_W = 0.8;
const MIRROR_H = 1.0;
const MIRROR_Y = COUNTER_TOP + 0.08 + MIRROR_H / 2;
const DESKTOP_EYE = new THREE.Vector3(0, 1.58, 0);
const DESKTOP_FOV = 32; // narrow so the reflection fills the screen on desktop

// contact tuning for painting with a controller
const CONTACT_GAP = 0.006;   // start painting this far before touching the skin
const PRESS_RANGE = 0.018;   // pushing this far "into" the face gives full pressure
const TOOL_TOUCH_R = 0.035;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.cameraAutoUpdate = false; // we update it ourselves so the avatar has no frame lag
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3e6e8);

const camera = new THREE.PerspectiveCamera(DESKTOP_FOV, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.copy(DESKTOP_EYE);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xffffff, 0xcdb3bb, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(0.5, 2.5, 1.5);
scene.add(key);
// vanity light in front of the face so the reflection is well lit
const faceLight = new THREE.PointLight(0xfff1e0, 0.35, 3, 2);
faceLight.position.set(0, MIRROR_Y + 0.2, MIRROR_Z + 0.15);
scene.add(faceLight);

buildRoom();

// ---------- mirror ----------
const mirror = new Reflector(new THREE.PlaneGeometry(MIRROR_W, MIRROR_H), {
  textureWidth: 1536,
  textureHeight: 1920,
  color: 0xe6e6e6,
  clipBias: 0.003,
});
mirror.position.set(0, MIRROR_Y, MIRROR_Z);
mirror.camera.layers.enable(AVATAR_LAYER); // only the mirror sees the avatar
scene.add(mirror);
buildMirrorFrame();

// ---------- avatar + face paint ----------
const face = new FaceCanvas();
const avatar = new Avatar(face.texture);
scene.add(avatar.root);

// ---------- tools ----------
const { tray, items } = createToolTray(COUNTER_TOP, -0.34);
scene.add(tray);

const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();

// ---------- XR controllers ----------
const modelFactory = new XRControllerModelFactory();
const hands = [0, 1].map((i) => {
  const controller = renderer.xr.getController(i);
  const brush = createBrush();
  controller.add(brush);
  scene.add(controller);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(modelFactory.createControllerModel(grip));
  scene.add(grip);

  const hand = { controller, brush, tool: TOOLS[i === 0 ? 0 : 1], lastUV: null, touching: new Set(), inputSource: null };
  controller.addEventListener('connected', (e) => { hand.inputSource = e.data; });
  controller.addEventListener('disconnected', () => { hand.inputSource = null; });
  return hand;
});

// ---------- desktop state ----------
const desktop = { tool: TOOLS[0], yaw: 0, pitch: 0, painting: false, lastUV: null, keys: new Set() };
const toolsEl = document.getElementById('tools');
TOOLS.forEach((tool, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<i style="background:${tool.color}"></i>${i + 1} ${tool.name}`;
  b.onclick = () => pickDesktopTool(tool);
  toolsEl.appendChild(b);
});
pickDesktopTool(TOOLS[0]);
refreshSelection();

function pickDesktopTool(tool) {
  if (tool.action === 'clear') { face.clear(); return; }
  desktop.tool = tool;
  [...toolsEl.children].forEach((b, i) => b.classList.toggle('on', TOOLS[i] === tool));
}

function refreshSelection() {
  const selected = renderer.xr.isPresenting ? hands.map((h) => h.tool) : [desktop.tool];
  setSelected(items, selected);
  for (const h of hands) h.brush.userData.tipMat.color.set(h.tool.color);
}

window.addEventListener('keydown', (e) => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= TOOLS.length) { pickDesktopTool(TOOLS[n - 1]); refreshSelection(); }
  desktop.keys.add(e.key);
});
window.addEventListener('keyup', (e) => desktop.keys.delete(e.key));

const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  desktop.painting = true;
  desktop.lastUV = null;
  paintFromPointer(e);
});
renderer.domElement.addEventListener('pointermove', (e) => { if (desktop.painting) paintFromPointer(e); });
window.addEventListener('pointerup', () => { desktop.painting = false; desktop.lastUV = null; });

// Mouse ray -> hits the mirror -> reflect -> hits the real head behind the camera.
const _n = new THREE.Vector3();
function paintFromPointer(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const m = raycaster.intersectObject(mirror, false)[0];
  if (!m) { desktop.lastUV = null; return; }
  _n.set(0, 0, 1).applyQuaternion(mirror.quaternion);
  const d = raycaster.ray.direction.clone();
  d.addScaledVector(_n, -2 * d.dot(_n));
  raycaster.set(m.point, d);
  const h = raycaster.intersectObject(avatar.headMesh, false)[0];
  if (!h) { desktop.lastUV = null; return; }
  paintAt(desktop, desktop.tool, h.uv, 1);
}

function paintAt(state, tool, uv, scale) {
  if (state.lastUV) face.stroke(state.lastUV, uv, tool, scale);
  else face.stamp(uv, tool, scale);
  state.lastUV = (state.lastUV || new THREE.Vector2()).copy(uv);
}

// ---------- VR interaction ----------
const _tip = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

function updateHand(hand) {
  if (!hand.inputSource) return;
  hand.controller.updateMatrixWorld(true);
  _tip.copy(BRUSH_TIP_LOCAL);
  hand.controller.localToWorld(_tip);

  // dip the brush into a product to pick it up
  for (const it of items) {
    it.mesh.localToWorld(_tp.set(0, 0.025, 0));
    const inside = _tip.distanceTo(_tp) < TOOL_TOUCH_R;
    if (inside && !hand.touching.has(it)) {
      if (it.tool.action === 'clear') face.clear();
      else hand.tool = it.tool;
      refreshSelection();
      pulse(hand, 0.6, 60);
    }
    if (inside) hand.touching.add(it); else hand.touching.delete(it);
  }

  if (hand.tool.action) { hand.lastUV = null; return; }

  // project the tip onto the head surface along the line from the head centre
  const center = avatar.headCenter;
  _dir.subVectors(_tip, center);
  const tipDist = _dir.length();
  if (tipDist > 0.3) { hand.lastUV = null; return; }
  _dir.divideScalar(tipDist || 1);
  raycaster.set(_origin.copy(center).addScaledVector(_dir, 0.3), _dir.clone().negate());
  const hit = raycaster.intersectObject(avatar.headMesh, false)[0];
  if (!hit) { hand.lastUV = null; return; }

  const depth = hit.point.distanceTo(center) - tipDist; // >0 means the tip is under the skin
  if (depth < -CONTACT_GAP) { hand.lastUV = null; return; }
  const pressure = THREE.MathUtils.clamp((depth + CONTACT_GAP) / PRESS_RANGE, 0, 1);
  paintAt(hand, hand.tool, hit.uv, 0.7 + 0.7 * pressure);
  pulse(hand, 0.08 + 0.3 * pressure, 20);
}

function pulse(hand, intensity, ms) {
  const act = hand.inputSource?.gamepad?.hapticActuators?.[0];
  if (act?.pulse) act.pulse(intensity, ms);
}

renderer.xr.addEventListener('sessionstart', refreshSelection);
renderer.xr.addEventListener('sessionend', refreshSelection);

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (renderer.xr.isPresenting) {
    renderer.xr.updateCamera(camera);
  } else {
    const k = desktop.keys;
    const turn = 1.2 * dt;
    if (k.has('ArrowLeft')) desktop.yaw += turn;
    if (k.has('ArrowRight')) desktop.yaw -= turn;
    if (k.has('ArrowUp')) desktop.pitch += turn;
    if (k.has('ArrowDown')) desktop.pitch -= turn;
    desktop.yaw = THREE.MathUtils.clamp(desktop.yaw, -0.9, 0.9);
    desktop.pitch = THREE.MathUtils.clamp(desktop.pitch, -0.6, 0.6);
    camera.position.copy(DESKTOP_EYE);
    camera.rotation.set(desktop.pitch, desktop.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
  }

  avatar.update(camera);
  if (renderer.xr.isPresenting) hands.forEach(updateHand);
  face.flush();

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- set dressing ----------
function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0xd9c2b0, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf6d7de, roughness: 1 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat);
  back.position.set(0, 1.5, MIRROR_Z - 0.05);
  scene.add(back);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), wallMat);
    w.rotation.y = -side * Math.PI / 2;
    w.position.set(side * 1.6, 1.5, 0.8);
    scene.add(w);
  }
  const behind = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ color: 0xe9c6cf, roughness: 1 }));
  behind.rotation.y = Math.PI;
  behind.position.set(0, 1.5, 2.2);
  scene.add(behind);

  // a couple of things behind the player so the reflection has depth
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.25), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  shelf.position.set(0, 1.4, 2.08);
  scene.add(shelf);
  const potColors = [0x8fd3c7, 0xffc857, 0xb39ddb];
  potColors.forEach((c, i) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 20), new THREE.MeshStandardMaterial({ color: c }));
    pot.position.set(-0.4 + i * 0.4, 1.48, 2.08);
    scene.add(pot);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshStandardMaterial({ color: 0x5fae6b, flatShading: true }));
    plant.position.set(-0.4 + i * 0.4, 1.6, 2.08);
    scene.add(plant);
  });

  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.36), new THREE.MeshStandardMaterial({ color: 0xfffaf7, roughness: 0.4 }));
  counter.position.set(0, COUNTER_TOP - 0.03, MIRROR_Z + 0.18);
  scene.add(counter);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.96, COUNTER_TOP - 0.06, 0.32), new THREE.MeshStandardMaterial({ color: 0xc98ea0, roughness: 0.8 }));
  cabinet.position.set(0, (COUNTER_TOP - 0.06) / 2, MIRROR_Z + 0.17);
  scene.add(cabinet);
}

function buildMirrorFrame() {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const t = 0.05;
  const parts = [
    [MIRROR_W + 2 * t, t, 0, MIRROR_H / 2 + t / 2],
    [MIRROR_W + 2 * t, t, 0, -MIRROR_H / 2 - t / 2],
    [t, MIRROR_H, -MIRROR_W / 2 - t / 2, 0],
    [t, MIRROR_H, MIRROR_W / 2 + t / 2, 0],
  ];
  for (const [w, h, x, y] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), frameMat);
    m.position.set(x, MIRROR_Y + y, MIRROR_Z);
    scene.add(m);
  }
  // Hollywood-style bulbs
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 1.5 });
  const bulbGeo = new THREE.SphereGeometry(0.016, 16, 12);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.set(side * (MIRROR_W / 2 + t / 2), MIRROR_Y - MIRROR_H / 2 + 0.08 + i * (MIRROR_H - 0.16) / 5, MIRROR_Z + 0.025);
      scene.add(b);
    }
  }
}
