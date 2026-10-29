// Where the mouse is over the view, and what it points at in the scene: the
// pointer in pixels and in normalised device coordinates, the ray through it,
// and the conversions between the screen and the cabinet.

import * as THREE from 'three';
import type { Stage } from '../render/stage';

/** a position on the canvas, in CSS pixels from its top left corner */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** projects a point to the screen (px) and its depth, into out[o..o+2] */
export type Projector = (px: number, py: number, pz: number, out: Float32Array, o: number) => void;

export class Pointer {
  /** the pointer on the canvas (px) */
  readonly px: ScreenPoint = { x: 0, y: 0 };
  /** the same in normalised device coordinates (−1..1, y up) */
  readonly ndc = new THREE.Vector2();
  readonly raycaster = new THREE.Raycaster();

  constructor(private stage: Stage) {}

  private get canvas(): HTMLCanvasElement {
    return this.stage.renderer.domElement;
  }

  /** follows a mouse event */
  update(e: PointerEvent | WheelEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.px.x = e.clientX - r.left;
    this.px.y = e.clientY - r.top;
    this.ndc.set((this.px.x / r.width) * 2 - 1, -(this.px.y / r.height) * 2 + 1);
  }

  /** the ray from the camera through the pointer */
  ray(): THREE.Ray {
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    return this.raycaster.ray;
  }

  /** the ray from the camera through a point of the canvas (px) */
  rayAt(p: ScreenPoint): THREE.Ray {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((p.x / r.width) * 2 - 1, -(p.y / r.height) * 2 + 1), this.stage.camera);
    return this.raycaster.ray;
  }

  /** where the pointer meets `plane` moved `depth` along its normal, or null */
  onPlane(plane: THREE.Plane, depth: number): THREE.Vector3 | null {
    const p = new THREE.Plane().copy(plane);
    p.constant -= depth;
    return this.ray().intersectPlane(p, new THREE.Vector3());
  }

  /** a point of the scene on the canvas (px) */
  toScreen(x: number, y: number, z: number): ScreenPoint {
    const v = new THREE.Vector3(x, y, z).project(this.stage.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
  }

  /** how far (px) a point of the scene is from the pointer, on the screen */
  screenDistance(x: number, y: number, z: number): number {
    const s = this.toScreen(x, y, z);
    return Math.hypot(s.x - this.px.x, s.y - this.px.y);
  }

  /** a projector for the current camera: much faster than toScreen over thousands of points */
  projector(): Projector {
    const cam = this.stage.camera;
    const rect = this.canvas.getBoundingClientRect();
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    const W = rect.width, H = rect.height;
    return (px, py, pz, out, o) => {
      const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
      const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
      const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
      out[o] = (cx / cw * 0.5 + 0.5) * W;
      out[o + 1] = (-cy / cw * 0.5 + 0.5) * H;
      out[o + 2] = cw;
    };
  }

  /** metres covered by one pixel of the canvas, at `distance` from the camera */
  metresPerPixel(distance: number): number {
    const cam = this.stage.camera;
    return (2 * distance * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / this.canvas.clientHeight;
  }

  setCursor(cursor: string): void {
    this.canvas.style.cursor = cursor;
  }

  /** the rest of the gesture comes to the canvas, even outside it */
  capture(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
  }
}
