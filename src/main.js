import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FaceCanvas } from './faceCanvas.js';
import { Avatar, AVATAR_LAYER } from './avatar.js';
import { TOOLS, createToolTray, setSelected, createBrush, styleBrush, BRUSH_TIP_LOCAL } from './tools.js';
import { buildRoom, buildMirrorFrame, archShape } from './room.js';

// ---------- layout (metres; the player stands at the origin facing -Z) ----------
const COUNTER_TOP = 1.0;
const MIRROR_Z = -0.6;
const MIRROR_W = 0.56;
const MIRROR_H = 0.78;
const MIRROR_Y = COUNTER_TOP + 0.15 + MIRROR_H / 2; // centre ~1.54 m, around face height when standing
const LAYOUT = { COUNTER_TOP, MIRROR_Z, MIRROR_W, MIRROR_H, MIRROR_Y };
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
renderer.toneMapping = THREE.NeutralToneMapping; // keeps cartoon colours saturated
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.cameraAutoUpdate = false; // we update it ourselves so the avatar has no frame lag
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3e6e8);
// soft image-based lighting for reflections on gold, glass and skin
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(DESKTOP_FOV, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.copy(DESKTOP_EYE);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xfff6f0, 0xd8b8c0, 0.6));
// key light from above-front: casts the soft shadows of the products on the counter
const key = new THREE.DirectionalLight(0xfff4ea, 1.4);
key.position.set(0.4, 2.6, 0.9);
key.target.position.set(0, COUNTER_TOP, MIRROR_Z + 0.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -0.7, right: 0.7, top: 0.7, bottom: -0.7, near: 0.5, far: 4 });
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.01;
key.shadow.radius = 4;
scene.add(key, key.target);
// daylight from the window on the left
const windowLight = new THREE.DirectionalLight(0xdbeeff, 0.5);
windowLight.position.set(-2, 1.8, 0.3);
scene.add(windowLight);
// warm vanity bulbs lighting the face (seen in the mirror)
const faceLight = new THREE.PointLight(0xffe6c8, 0.4, 2.5, 2);
faceLight.position.set(0, MIRROR_Y + 0.15, MIRROR_Z + 0.2);
scene.add(faceLight);

buildRoom(scene, LAYOUT);

// ---------- mirror ----------
const mirror = new Reflector(new THREE.ShapeGeometry(archShape(MIRROR_W, MIRROR_H), 64), {
  textureWidth: 1152,
  textureHeight: 1600,
  color: 0xeeeeee,
  clipBias: 0.003,
});
mirror.position.set(0, MIRROR_Y, MIRROR_Z);
mirror.camera.layers.enable(AVATAR_LAYER); // only the mirror sees the avatar
scene.add(mirror);
buildMirrorFrame(scene, LAYOUT);

// ---------- avatar + face paint ----------
const face = new FaceCanvas();
const avatar = new Avatar(face.texture);
scene.add(avatar.root);

// ---------- tools ----------
const { tray, items } = createToolTray(COUNTER_TOP, MIRROR_Z + 0.27);
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
  b.onclick = () => { pickDesktopTool(tool); refreshSelection(); };
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
  for (const h of hands) styleBrush(h.brush, h.tool);
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

  avatar.update(camera, dt);
  if (renderer.xr.isPresenting) hands.forEach(updateHand);
  face.flush(renderer);

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
