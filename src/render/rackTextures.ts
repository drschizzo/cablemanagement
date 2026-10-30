// Textures drawn on a canvas for the cabinet: the perforated grille of the
// doors, the holes of the rails, and the soft contact shadow on the floor.

import * as THREE from 'three';
import { U } from '../game/rack';
import { shared } from './dispose';
import { once } from '../lib/once';

/** the perforated grille of the doors */
export const grilleMaterial = once((): THREE.MeshStandardMaterial =>
  shared(new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.6, metalness: 0.6, transparent: true })));

const grilleTexture = once((): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a3038'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#07090c';
  for (let y = 6; y < 60; y += 9) for (let x = 6 + ((y / 9) % 2) * 4; x < 252; x += 9) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  const grille = shared(new THREE.CanvasTexture(c));
  grille.colorSpace = THREE.SRGBColorSpace;
  return grille;
});

export function railMaterial(height: number): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a4049'; g.fillRect(0, 0, 32, 128);
  g.fillStyle = '#07090b';
  // three square holes per unit
  for (let i = 0; i < 3; i++) g.fillRect(11, 8 + i * 42, 10, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, height / U);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.7 });
}

/** a dark soft-edged plane lying on the floor: the contact shadow a light map would give */
export function softShadow(w: number, d: number, x: number, y: number, z: number, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: '#000000' }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.0005, z);
  m.renderOrder = -1;
  return m;
}

const blobTexture = once((): THREE.CanvasTexture => {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  // stacked faint rounded rectangles: dense in the middle, fading at the edges
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 24; i++) {
    const m = 2 + i * 1.4;
    g.beginPath();
    g.roundRect(m, m, N - 2 * m, N - 2 * m, 30 - i);
    g.fill();
  }
  // only the alpha counts: the material colour is black
  return shared(new THREE.CanvasTexture(c));
});
