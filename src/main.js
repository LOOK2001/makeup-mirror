import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FaceCanvas } from './faceCanvas.js';
import { Avatar, AVATAR_LAYER } from './avatar.js';
import { TOOLS, createToolTray, setSelected, createBrush, styleBrush, BRUSH_TIP_LOCAL } from './tools.js';
import { buildRoom, buildMirrorFrame, archShape } from './room.js';
import { PhotoBooth, PhotoWall, polaroid, timeCaption } from './photo.js';
import { LOOKS, drawLook, scoreFace, stars, ChallengeBoard, Challenge, formatTime } from './challenge.js';
import * as sfx from './sfx.js';

// ---------- layout (metres; the player stands at the origin facing -Z) ----------
const COUNTER_TOP = 1.0;
const MIRROR_Z = -0.4; // close, like leaning in to a vanity
const MIRROR_W = 0.46;
const MIRROR_H = 0.6; // a flat mirror shows ~2x its height: head, neck, a bit of chest
const MIRROR_Y = COUNTER_TOP + 0.25 + MIRROR_H / 2; // centre ~1.55 m, around eye height when standing
// the products sit on a shelf right under the mirror: a short glance down, easy reach
const SHELF_Y = MIRROR_Y - MIRROR_H / 2 - 0.06;
const TOOLS_Z = MIRROR_Z + 0.1;
const LAYOUT = { COUNTER_TOP, MIRROR_Z, MIRROR_W, MIRROR_H, MIRROR_Y, SHELF_Y };
const DESKTOP_EYE = new THREE.Vector3(0, 1.58, 0);
const DESKTOP_FOV = 28; // narrow so the reflection fills the screen on desktop
const SHELF_FOV = 60;

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
key.target.position.set(0, SHELF_Y, TOOLS_Z);
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
const faceLight = new THREE.PointLight(0xffe6c8, 0.22, 2.5, 2);
faceLight.position.set(0, MIRROR_Y + 0.15, MIRROR_Z + 0.2);
scene.add(faceLight);

buildRoom(scene, LAYOUT);

// ---------- mirror ----------
const mirror = new Reflector(new THREE.ShapeGeometry(archShape(MIRROR_W, MIRROR_H), 64), {
  textureWidth: 1024,
  textureHeight: 1336,
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
const { tray, items } = createToolTray(SHELF_Y, TOOLS_Z);
scene.add(tray);

const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();

// ---------- photos ----------
const booth = new PhotoBooth(renderer, scene, avatar, { minZ: MIRROR_Z + 0.06 });
const photoWall = new PhotoWall(scene, new THREE.Vector3(MIRROR_W / 2 + 0.145, MIRROR_Y + 0.17, MIRROR_Z - 0.045));
const galleryEl = document.getElementById('gallery');

// white flash in front of the player's eyes; on its own layer so photos don't see it
const FLASH_LAYER = 6;
const flash = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, toneMapped: false }),
);
flash.position.z = -0.05;
flash.renderOrder = 999;
flash.layers.set(FLASH_LAYER);
camera.add(flash);
camera.layers.enable(FLASH_LAYER);

function takePhoto(caption = timeCaption()) {
  face.flush(renderer);
  const card = polaroid(booth.capture(), caption);
  photoWall.add(card);
  const a = document.createElement('a');
  a.href = card.toDataURL('image/png');
  a.download = `makeup-${Date.now()}.png`;
  a.title = '点击下载';
  a.innerHTML = `<img src="${a.href}" alt="${caption}">`;
  galleryEl.prepend(a);
  while (galleryEl.children.length > 12) galleryEl.lastChild.remove();
  flash.material.opacity = 0.9;
  sfx.shutter();
}

// ---------- makeup challenge ----------
const board = new ChallengeBoard(scene, new THREE.Vector3(-(MIRROR_W / 2 + 0.17), MIRROR_Y, MIRROR_Z - 0.045));
const challengeEl = document.getElementById('challenge');
const challenge = new Challenge({ duration: 120, onChange: showChallenge });
let lastLook = null;

function startChallenge() {
  const pool = LOOKS.filter((l) => l !== lastLook); // never the same look twice in a row
  const look = pool[Math.floor(Math.random() * pool.length)];
  lastLook = look;
  const targetLayer = drawLook(look);

  // reference card: the avatar wearing the target look, facing straight ahead
  const refTex = new THREE.CanvasTexture(face.compose(targetLayer));
  refTex.colorSpace = THREE.SRGBColorSpace;
  const mat = avatar.headMesh.material;
  mat.map = refTex;
  hands.forEach((h) => { h.controller.visible = false; });
  const reference = booth.capture({ neutral: true });
  hands.forEach((h) => { h.controller.visible = !!h.inputSource; });
  mat.map = face.texture;
  refTex.dispose();

  face.clear();
  challenge.start(look, reference, targetLayer);
  sfx.ding();
}

function finishChallenge() {
  const { look, targetLayer } = challenge.state;
  const score = scoreFace(face, targetLayer);
  challenge.finish(score);
  takePhoto(`${look.name} · ${score}分`);
  sfx.fanfare();
}

function showChallenge(st) {
  if (st.phase === 'running') {
    const lines = [`剩余 ${formatTime(st.timeLeft)}`, '画好了碰铃铛提交'];
    board.render({ title: st.look.name, reference: st.reference, lines });
    if (!challengeEl.dataset.look || challengeEl.dataset.look !== st.look.name) {
      challengeEl.dataset.look = st.look.name;
      challengeEl.innerHTML = `<img src="${st.reference.toDataURL()}" alt=""><div><b>${st.look.name}</b><br><small>${st.look.hint}</small><br><span class="time"></span><br><small>按 C 提交</small></div>`;
    }
    challengeEl.querySelector('.time').textContent = `剩余 ${formatTime(st.timeLeft)}`;
    challengeEl.hidden = false;
  } else if (st.phase === 'result') {
    board.render({ title: st.look.name, reference: st.reference, lines: [`得分 ${st.score}`, stars(st.score)] });
    challengeEl.dataset.look = '';
    challengeEl.innerHTML = `<img src="${st.reference.toDataURL()}" alt=""><div><b>${st.look.name}</b><br>得分 <b>${st.score}</b><br><span class="stars">${stars(st.score)}</span><br><small>按 C 再来一局</small></div>`;
  }
}

function toggleChallenge() {
  if (challenge.running) finishChallenge();
  else startChallenge();
}

// clear / photo / challenge items run an action instead of becoming the brush
function runAction(action) {
  if (action === 'clear') face.clear();
  else if (action === 'photo') takePhoto();
  else if (action === 'challenge') toggleChallenge();
}

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

  const hand = { controller, brush, tool: TOOLS[i === 0 ? 0 : 1], lastUV: null, touching: new Set(), inputSource: null, pressed: [] };
  controller.addEventListener('connected', (e) => { hand.inputSource = e.data; });
  controller.addEventListener('disconnected', () => { hand.inputSource = null; });
  return hand;
});

// ---------- desktop state ----------
const desktop = { tool: TOOLS[0], yaw: 0, pitch: 0, targetPitch: 0, painting: false, lastUV: null, keys: new Set() };
// pitch that puts the shelf in the middle of the desktop view
const SHELF_PITCH = -Math.atan2(DESKTOP_EYE.y - SHELF_Y - 0.03, -TOOLS_Z);
const toolsEl = document.getElementById('tools');
TOOLS.forEach((tool, i) => {
  const b = document.createElement('button');
  const keyName = { photo: 'P', challenge: 'C' }[tool.id] ?? (i + 1);
  b.innerHTML = `<i style="background:${tool.color}"></i>${keyName} ${tool.name}`;
  b.onclick = () => { pickDesktopTool(tool); refreshSelection(); };
  toolsEl.appendChild(b);
});
pickDesktopTool(TOOLS[0]);
refreshSelection();

function pickDesktopTool(tool) {
  if (tool.action) { runAction(tool.action); return; }
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
  if (n >= 1 && n <= 8) { pickDesktopTool(TOOLS[n - 1]); refreshSelection(); }
  if (e.code === 'KeyP' && !e.repeat) takePhoto();
  if (e.code === 'KeyC' && !e.repeat) toggleChallenge();
  if (e.code === 'Space') { // glance down at the shelf / back up at the mirror
    e.preventDefault();
    desktop.targetPitch = desktop.targetPitch === 0 ? SHELF_PITCH : 0;
  }
  desktop.keys.add(e.key);
});
window.addEventListener('keyup', (e) => desktop.keys.delete(e.key));

const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  // clicking a product picks it up, like dipping the brush in VR
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hitTool = items.find((it) => raycaster.intersectObject(it.mesh, true).length > 0);
  if (hitTool) { pickDesktopTool(hitTool.tool); refreshSelection(); return; }
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
  // A / X takes a photo, B / Y starts or submits a challenge
  const buttons = hand.inputSource.gamepad?.buttons ?? [];
  for (const [i, action] of [[4, 'photo'], [5, 'challenge']]) {
    const down = !!buttons[i]?.pressed;
    if (down && !hand.pressed[i]) runAction(action);
    hand.pressed[i] = down;
  }
  hand.controller.updateMatrixWorld(true);
  _tip.copy(BRUSH_TIP_LOCAL);
  hand.controller.localToWorld(_tip);

  // dip the brush into a product to pick it up
  for (const it of items) {
    it.mesh.localToWorld(_tp.set(0, 0.025, 0));
    const inside = _tip.distanceTo(_tp) < TOOL_TOUCH_R;
    if (inside && !hand.touching.has(it)) {
      if (it.tool.action) runAction(it.tool.action);
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
    if (k.has('ArrowUp')) desktop.targetPitch = desktop.pitch += turn;
    if (k.has('ArrowDown')) desktop.targetPitch = desktop.pitch -= turn;
    desktop.pitch += (desktop.targetPitch - desktop.pitch) * Math.min(1, dt * 8);
    desktop.yaw = THREE.MathUtils.clamp(desktop.yaw, -0.9, 0.9);
    desktop.pitch = THREE.MathUtils.clamp(desktop.pitch, -1.1, 0.6);
    desktop.targetPitch = THREE.MathUtils.clamp(desktop.targetPitch, -1.1, 0.6);
    camera.position.copy(DESKTOP_EYE);
    camera.rotation.set(desktop.pitch, desktop.yaw, 0, 'YXZ');
    // widen the view while glancing down so the whole shelf fits
    camera.fov = THREE.MathUtils.lerp(DESKTOP_FOV, SHELF_FOV, THREE.MathUtils.clamp(desktop.pitch / SHELF_PITCH, 0, 1));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  avatar.update(camera, dt);
  if (challenge.update(dt)) finishChallenge();
  if (flash.material.opacity > 0) flash.material.opacity = Math.max(0, flash.material.opacity - dt * 3);
  if (renderer.xr.isPresenting) hands.forEach(updateHand);
  face.flush(renderer);

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
