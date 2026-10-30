// The materials of the cabinet and its equipment, made once and shared by
// every level; and the ghosts of the supports tool.

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { shared } from './dispose';
import { worn, type Wear } from './wear';

/** a painted or plastic part, worn by years in the room */
function used(params: THREE.MeshStandardMaterialParameters, wear: Wear): THREE.MeshStandardMaterial {
  return worn(new MeshStandardNodeMaterial(params), wear) as unknown as THREE.MeshStandardMaterial;
}

// warm graphite powder-coat rather than blue-grey steel
export const rackMat = {
  frame: used({ color: '#333134', roughness: 0.5, metalness: 0.65 }, { scratches: 0.8, grime: 0.5, dust: 0.6 }),
  wall: used({ color: '#211f21', roughness: 0.62, metalness: 0.4 }, { scratches: 0.6, grime: 0.5, dust: 0.7 }),
  back: new THREE.MeshStandardMaterial({ color: '#131213', roughness: 0.9, metalness: 0.2 }),
  body: used({ color: '#1d1e20', roughness: 0.55, metalness: 0.5 }, { scratches: 0.3, grime: 0.4, dust: 0.6 }),
  floor: used({ color: '#46494b', roughness: 0.7, metalness: 0.3 }, { scratches: 1.0, grime: 0.6, dust: 0.8 }),
  panel: used({ color: '#d6d5d2', roughness: 0.42, metalness: 0.45 }, { scratches: 0.3, grime: 0.35, dust: 0.4 }),
  switchFace: used({ color: '#272629', roughness: 0.48, metalness: 0.5 }, { scratches: 0.3, grime: 0.3, dust: 0.4 }),
  blank: used({ color: '#201f22', roughness: 0.65, metalness: 0.4 }, { scratches: 0.5, grime: 0.4, dust: 0.5 }),
  hole: new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1 }),
  cage: new THREE.MeshStandardMaterial({ color: '#aba8a3', roughness: 0.32, metalness: 0.9 }),
  adapterSM: new THREE.MeshStandardMaterial({ color: '#2d6fd8', roughness: 0.45 }),
  adapterMM: new THREE.MeshStandardMaterial({ color: '#d8cfa8', roughness: 0.45 }),
  ring: new THREE.MeshStandardMaterial({ color: '#19181a', roughness: 0.45, metalness: 0.1 }),
  duct: used({ color: '#353437', roughness: 0.55, metalness: 0.1 }, { scratches: 0.4, grime: 0.4, dust: 0.5 }),
  ductBack: new THREE.MeshStandardMaterial({ color: '#2f2e31', roughness: 0.8 }),
  mgrPlate: used({ color: '#19181b', roughness: 0.55, metalness: 0.3 }, { scratches: 0.5, grime: 0.4, dust: 0.4 }),
  copperFace: new THREE.MeshStandardMaterial({ color: '#1e1d20', roughness: 0.5, metalness: 0.5 }),
  // a shade off white and matt: under the lamp, a brighter one passed the threshold of the bloom
  keystone: new THREE.MeshStandardMaterial({ color: '#dcd9d2', roughness: 0.65 }),
  firewall: new THREE.MeshStandardMaterial({ color: '#7a2020', roughness: 0.45, metalness: 0.5 }),
  router: new THREE.MeshStandardMaterial({ color: '#173c6e', roughness: 0.45, metalness: 0.5 }),
  ups: used({ color: '#2d2c30', roughness: 0.55, metalness: 0.4 }, { scratches: 0.4, grime: 0.4, dust: 0.5 }),
  // the power strip, and its C13 sockets
  pdu: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.6, metalness: 0.35 }),
  socket: new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.7 }),
  crate: used({ color: '#2c2f32', roughness: 0.6, metalness: 0.0 }, { scratches: 0.6, grime: 0.5, dust: 0.4 }),
  // the core of the lamp passes the bloom threshold (see leds.ts); its lens and the screen, larger
  // surfaces, stay just below it: they would have spread into a blot
  core: new THREE.MeshStandardMaterial({ color: '#fff1dc', emissive: '#ffd7a3', emissiveIntensity: 5 }),
  // the diffuser of the cabinet's lamp: bright, but under the threshold, like the screen
  lens: new THREE.MeshStandardMaterial({ color: '#fff6ea', emissive: '#ffe2bd', emissiveIntensity: 1.8, roughness: 0.9 }),
  lcd: new THREE.MeshStandardMaterial({ color: '#0a1a14', emissive: '#3ff0a8', emissiveIntensity: 3 }),
};

// made once, used by every level
for (const m of Object.values(rackMat)) shared(m);

export const ghostMat = shared(new THREE.MeshStandardMaterial({ color: '#6fd3ff', transparent: true, opacity: 0.45, emissive: '#1f6f99', depthWrite: false }));
export const ghostBadMat = shared(new THREE.MeshStandardMaterial({ color: '#ff6f6f', transparent: true, opacity: 0.4, emissive: '#992020', depthWrite: false }));
