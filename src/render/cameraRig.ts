// The camera and how it moves round the subject: where it rests to frame the
// subject in the screen the panels leave free, the player's orbit held near
// the subject and above the floor, and the motions played on it (the sway of
// the demo, the flight round a cabinet, a pose of the replay).

import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createControls, MAX_POLAR } from './stageSetup';
import { CameraTour, type TourPose } from './cameraTour';

/** px from each edge of the screen */
export interface ScreenMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The subject framed (m): its centre (`cx`, `cy`) and height, half its width,
 * how far around it the shadows reach, how far towards the camera its sides come.
 */
export interface Framing {
  cy: number;
  height: number;
  halfWidth: number;
  cx: number;
  shadowWidth: number;
  near: number;
}

/** how far the camera may back away, × the distance it frames the subject from */
const MAX_ZOOM_OUT = 1.6;
/** how far what the camera looks at may be panned from the middle of the subject, × the subject's size */
const PAN_REACH = 0.6;
/** how high above the floor the camera stays (m): its near plane must not cut into it */
const ABOVE_FLOOR = 0.1;
/** how high above the floor what the camera looks at stays (m) */
const TARGET_ABOVE_FLOOR = 0.05;

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  readonly controls: OrbitControls;
  /** the subject framed (see frame()) */
  framed: Framing = { cy: 0, height: 1, halfWidth: 0.41, cx: 0.03, shadowWidth: 0.41, near: 0 };
  /**
   * Where the camera rests, relative to the framing (see frame()): its distance
   * (× the one that fits), its angle above the horizontal (rad), how far below
   * the middle of the subject it looks (m). null: the framing as it is.
   */
  view: { zoom: number; elevation: number; lower: number } | null = null;
  /** the height of the room's floor: the camera, and what it looks at, stay above it */
  floorY = -Infinity;
  private home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  /** slow sway of the camera around the cabinet (demo), stopped by the player */
  private swaying = false;
  private swayT = 0;
  /** a flight round the cabinet under way (see tour()) */
  private touring: CameraTour | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.controls = createControls(this.camera, canvas);
    this.controls.addEventListener('start', () => { this.swaying = false; this.touring?.end(); });
  }

  /** a flight round the cabinet is under way */
  get isTouring(): boolean {
    return this.touring !== null;
  }

  /** the middle of the subject, wherever the view was panned, and its size (m) */
  get subject(): { at: THREE.Vector3; size: number } {
    return { at: this.home.target, size: Math.max(this.framed.height, 2 * this.framed.halfWidth) };
  }

  /** how far the camera stands from what it looks at (m) */
  get viewDistance(): number {
    return this.camera.position.distanceTo(this.controls.target);
  }

  /**
   * Frames `f` in the screen the `margins` leave free, and puts the camera at
   * rest there; returns the distance it frames the subject from (m).
   */
  frame(f: Framing, margins: ScreenMargins): number {
    this.framed = f;
    const { cy, height, halfWidth, cx, near } = f;
    const W = window.innerWidth, H = window.innerHeight;
    const freeW = Math.max(200, W - margins.left - margins.right);
    const freeH = Math.max(200, H - margins.top - margins.bottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // fit the height in the free height, and the cabinet width (0.82 m) in the free width
    const dH = (height * 0.55) / (tanV * (freeH / H));
    const dW = halfWidth / (tanV * (W / H) * (freeW / W)) + near;
    const d = Math.max(dH, dW);
    this.home.target.set(cx, cy, 0.02);
    // slightly from above, so that the floor of the cabinet is in view
    const dist = Math.max(1.0, d);
    // a little further than it is framed, no more: past that, the room round the cabinet shows where it ends
    this.controls.maxDistance = dist * MAX_ZOOM_OUT;
    this.camera.far = Math.max(20, dist * 3);
    this.camera.updateProjectionMatrix();
    this.home.pos.set(cx, cy + dist * 0.16, dist);
    const v = this.view;
    if (v) {
      this.home.target.y -= v.lower;
      const len = Math.hypot(dist * 0.16, dist) * v.zoom;
      this.home.pos.set(cx, this.home.target.y + Math.sin(v.elevation) * len, this.home.target.z + Math.cos(v.elevation) * len);
    }
    this.resetView();
    return dist;
  }

  /** the image `w` × `h` px, its centre the centre of the screen the `margins` leave free */
  resize(w: number, h: number, margins: ScreenMargins): void {
    this.camera.aspect = w / h;
    const ox = (margins.right - margins.left) / 2;
    const oy = (margins.bottom - margins.top) / 2;
    this.camera.setViewOffset(w, h, ox, oy, w, h);
    this.camera.updateProjectionMatrix();
  }

  resetView(): void {
    this.camera.position.copy(this.home.pos);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  /** a left drag in the scene pans the view (the demo, where it grabs nothing) */
  dragPans(on: boolean): void {
    this.controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : (null as unknown as THREE.MOUSE);
    this.canvas.style.cursor = on ? 'grab' : 'default';
  }

  /**
   * A short flight round the cabinet, back to the front view; it resolves when
   * it is over, or as soon as the player takes the camera.
   */
  tour(seconds: number): Promise<void> {
    this.touring?.end();
    this.resetView();
    return new Promise((resolve) => {
      const tour = new CameraTour(seconds, () => {
        if (this.touring === tour) this.touring = null;
        resolve();
      });
      this.touring = tour;
    });
  }

  sway(on: boolean): void {
    this.swaying = on;
    this.swayT = 0;
    if (!on) this.resetView();
  }

  /** the camera at `pose`, relative to its resting place (the replay of the work moves it so) */
  place(pose: TourPose): void {
    this.fly(pose);
  }

  /** moves the camera `dt` s on: the sway, the tour, the player's orbit held near the subject and above the floor */
  update(dt: number): void {
    if (this.swaying) {
      this.swayT += dt;
      const a = 0.3 * Math.sin(this.swayT * 0.4);
      const rel = this.home.pos.clone().sub(this.home.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      this.camera.position.copy(this.home.target).add(rel);
      this.controls.target.copy(this.home.target);
    }
    if (this.touring) this.fly(this.touring.advance(dt));
    this.holdOrbitAboveFloor();
    this.controls.update();
    this.keepNearSubject();
    this.keepAboveFloor();
  }

  /** the camera where the tour puts it, relative to its resting place; home once it is over */
  private fly(pose: TourPose | null): void {
    if (!pose) { this.resetView(); return; }
    const rel = this.home.pos.clone().sub(this.home.target);
    const side = new THREE.Vector3(0, 1, 0).cross(rel).normalize();
    rel.applyAxisAngle(side, -pose.pitch).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw).multiplyScalar(pose.zoom);
    this.camera.position.copy(this.home.target).add(rel);
    this.controls.target.copy(this.home.target);
  }

  /**
   * Brings what the camera looks at back within reach of the subject, the
   * camera with it: the zoom is held to a distance from that point, but a pan
   * moves the point itself, and took the view off into the room.
   */
  private keepNearSubject(): void {
    const reach = this.subject.size * PAN_REACH;
    const off = this.controls.target.clone().sub(this.home.target);
    if (off.length() <= reach) return;
    const back = off.clone().setLength(reach).sub(off);
    this.controls.target.add(back);
    this.camera.position.add(back);
  }

  /**
   * Stops the orbit where the camera would go under the floor: the lowest it
   * may look from, at the distance it stands, is where it meets the floor.
   */
  private holdOrbitAboveFloor(): void {
    const t = this.controls.target, r = this.camera.position.distanceTo(t);
    const below = (this.floorY + ABOVE_FLOOR - t.y) / Math.max(r, 1e-6);
    this.controls.maxPolarAngle = Math.min(MAX_POLAR, Math.acos(THREE.MathUtils.clamp(below, -1, 1)));
  }

  /**
   * The point looked at, panned down, and the camera, zoomed out under the
   * orbit's limit, lifted back above the floor.
   */
  private keepAboveFloor(): void {
    const t = this.controls.target, p = this.camera.position;
    const lift = this.floorY + TARGET_ABOVE_FLOOR - t.y;
    if (lift > 0) { t.y += lift; p.y += lift; }
    p.y = Math.max(p.y, this.floorY + ABOVE_FLOOR);
  }
}
