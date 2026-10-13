import * as THREE from 'three';
import { SKIN } from './faceCanvas.js';

// The avatar is only visible to the mirror's camera. Layers 1 and 2 are
// reserved by three.js for the left/right XR eyes, so we use 5.
export const AVATAR_LAYER = 5;

const HEAD_R = 0.1;
const HEAD_Y_SCALE = 1.12;
// Head centre relative to the viewer's eyes (camera space): a bit behind, a bit lower.
const HEAD_OFFSET = new THREE.Vector3(0, -0.012, 0.082);

// Point on the head surface at a given azimuth/elevation (head-local space).
// Matches the UV layout in faceCanvas.js.
function surface(azimuth, elevation, inset = 0) {
  const r = HEAD_R - inset;
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation) * r,
    Math.sin(elevation) * r * HEAD_Y_SCALE,
    -Math.cos(azimuth) * Math.cos(elevation) * r,
  );
}

export class Avatar {
  constructor(faceTexture) {
    this.root = new THREE.Group();
    this.head = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.head, this.body);

    const headGeo = new THREE.SphereGeometry(HEAD_R, 96, 48);
    headGeo.rotateY(Math.PI / 2); // put the UV seam at the back of the head
    headGeo.scale(1, HEAD_Y_SCALE, 1);
    this.headMesh = new THREE.Mesh(
      headGeo,
      new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.6 }),
    );
    this.head.add(this.headMesh);

    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });

    // eyes
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const iris = new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.1 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 24, 16), white);
      eye.position.copy(surface(side * 0.3, 0.14, 0.008));
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 16, 12), iris);
      pupil.position.set(0, 0, -0.0105);
      eye.add(pupil);
      this.head.add(eye);
    }

    // nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 20, 14), skin);
    nose.scale.set(0.8, 1.3, 1);
    nose.position.copy(surface(0, -0.1, 0.004));
    this.head.add(nose);

    // ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), skin);
      ear.scale.set(0.45, 1.2, 0.8);
      ear.position.set(side * HEAD_R * 0.98, 0.0, 0.005);
      this.head.add(ear);
    }

    // hair: a cap on top plus a shell over the back
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a2318, roughness: 0.8, side: THREE.DoubleSide });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.07, 48, 16, 0, Math.PI * 2, 0, 1.12), hairMat);
    cap.scale.y = HEAD_Y_SCALE;
    const back = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R * 1.08, 48, 24, Math.PI / 2 - 1.25, 2.5, 0, 2.35),
      hairMat,
    );
    back.scale.y = HEAD_Y_SCALE * 1.05;
    this.head.add(cap, back);

    // body: neck + shoulders + chest. Follows the head's yaw only.
    const shirt = new THREE.MeshStandardMaterial({ color: 0xe88aa6, roughness: 0.9 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 20), skin);
    neck.position.set(0, -0.14, 0.02);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), shirt);
    shoulders.scale.set(0.2, 0.08, 0.1);
    shoulders.position.set(0, -0.24, 0.03);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.35, 32), shirt);
    chest.scale.z = 0.6;
    chest.position.set(0, -0.42, 0.03);
    this.body.add(neck, shoulders, chest);

    this.root.traverse((o) => o.layers.set(AVATAR_LAYER));

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._q = new THREE.Quaternion();
  }

  // Place the head where the viewer's head is. `camera.matrixWorld` must be current.
  update(camera) {
    camera.matrixWorld.decompose(this.head.position, this.head.quaternion, this.head.scale);
    this.head.scale.setScalar(1);
    this.head.position.add(HEAD_OFFSET.clone().applyQuaternion(this.head.quaternion));

    this._euler.setFromQuaternion(this.head.quaternion);
    this.body.quaternion.setFromEuler(this._euler.set(0, this._euler.y, 0));
    this.body.position.copy(this.head.position);

    this.root.updateMatrixWorld(true);
  }

  get headCenter() {
    return this.head.position;
  }
}
