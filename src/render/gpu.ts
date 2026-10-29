// Which GPU the browser actually draws with. On a Windows laptop with two GPUs,
// Chrome may run on the one built into the processor (the whole browser, not
// the page: the page can only hint, see powerPreference in stage.ts), and with
// hardware acceleration off or the driver blocklisted, on the processor itself
// (SwiftShader): the game then crawls. The page cannot pick the GPU; it can tell
// the player how to.

import * as THREE from 'three';

export interface GpuInfo {
  /** as the browser reports it, e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)" */
  name: string;
  /** drawn by the processor: hardware acceleration off or unavailable */
  software: boolean;
  /** a GPU built into the processor (Intel HD / UHD / Iris, AMD Radeon Graphics / Vega): maybe the wrong one of two */
  integrated: boolean;
}

export function gpuInfo(renderer: THREE.WebGLRenderer): GpuInfo {
  const gl = renderer.getContext();
  // Chrome and Safari give the real name in RENDERER; Firefox only through the extension
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  const software = /swiftshader|llvmpipe|softpipe|basic render|software/i.test(name);
  // Intel Arc cards are dedicated; AMD's numbered Radeons (RX 6600, 780M…) are cards or strong APUs
  const integrated = !software && (
    (/intel/i.test(name) && !/\barc\b/i.test(name)) ||
    /radeon\(tm\) (graphics|vega)|radeon (graphics|vega)/i.test(name)
  );
  return { name, software, integrated };
}

const isWindows = /windows/i.test(navigator.userAgent);

/** what the player can do about the GPU (ui/notice.ts says it) */
export type GpuAdvice = 'enableHardwareAcceleration' | 'useDedicatedGpu';

/**
 * What to tell the player, if anything: always when drawn in software; for a
 * built-in GPU only once the game turned out too slow on it (`slow`), and only
 * on Windows, where a second, dedicated GPU is likely to sit unused.
 */
export function gpuAdvice(gpu: GpuInfo, slow: boolean): GpuAdvice | null {
  if (gpu.software) return 'enableHardwareAcceleration';
  if (gpu.integrated && slow && isWindows) return 'useDedicatedGpu';
  return null;
}
