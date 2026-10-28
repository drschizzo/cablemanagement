// Ropes falling in a heap (avbd-cables), drawn by three-cable-tubes on
// WebGPURenderer: the tubes in TSL, a node material that stripes them along
// `tubeCoord` and glows with `tubeTint`, and their shadows.

import * as THREE from 'three/webgpu';
import { fract, mix, step, vertexColor } from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CABLES, CableSim, type CableInit } from 'avbd-cables';
import { TubeMesh, TubeNodes, TubeSync, tubeCoord, tubeTint } from 'three-cable-tubes/webgpu';

const ROPES = 120, LENGTH = 1.5;
const kind = CABLES.rope;

// --- the ropes, crossed over one another above the floor
const sim = new CableSim(kind.params);
const defs: CableInit[] = [];
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
for (let c = 0; c < ROPES; c++) {
  const a = rnd() * Math.PI, h = 0.1 + c * 0.025, cx = (rnd() - 0.5) * 0.6, cz = (rnd() - 0.5) * 0.6;
  const n = Math.round(LENGTH / kind.segment) + 1, points: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1) - 0.5) * LENGTH;
    points.push(cx + Math.cos(a) * t, h + 0.05 * Math.sin(k * 0.7), cz + Math.sin(a) * t);
  }
  defs.push({ ...kind.cable, points });
}
const starts = sim.build(defs);
sim.setStatics([{ kind: 'box', min: [-3, -0.2, -3], max: [3, 0, 3] }]);

// --- the tubes
const nodes = new TubeNodes(sim.n);
const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
// a darker band every 10 cm along each rope, turning round it
const band = step(0.5, fract(tubeCoord.x.mul(10).add(tubeCoord.y.mul(0.15))));
material.colorNode = mix(vertexColor().mul(0.55), vertexColor(), band);
material.emissiveNode = tubeTint;
const tubes = new TubeMesh(sim.n - ROPES, material, nodes);
const color = new THREE.Color();
let at = 0;
starts.forEach((s, c) => {
  color.setHSL(rnd(), 0.55, 0.5);
  tubes.lay(at, s, sim.cables[c].count, color, 0, kind.segment, 0);
  at += sim.cables[c].count - 1;
});
// the first rope glows
const glow = new THREE.Color(0.9, 0.35, 0.05);
for (let i = starts[0]; i < starts[0] + sim.cables[0].count; i++) nodes.tint(i, glow);
tubes.castShadow = tubes.receiveShadow = true;
const sync = new TubeSync(nodes, kind.cable.radius);
sync.update(sim, true);

// --- the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color('#101214');
scene.add(tubes);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardNodeMaterial({ color: '#3a3f45', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
scene.add(new THREE.HemisphereLight('#cfd8e3', '#202326', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 2.5);
sun.position.set(1.5, 3, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 6 });
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 30);
camera.position.set(1.4, 1.1, 1.6);
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: new URLSearchParams(location.search).has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.1, 0);
controls.update();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

await renderer.init();
const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2 (fallback)';
document.getElementById('backend')!.textContent = backend;
// for automated checks
Object.assign(window, { example: { sim, renderer, scene, camera, tubes, backend } });

renderer.setAnimationLoop(() => {
  sim.step();
  sync.update(sim);
  renderer.render(scene, camera);
});
