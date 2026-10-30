import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// The fibres are drawn as pure additive light on black. Bloom gives them their halo;
// the last pass compresses the HDR light by its brightest channel (so dense bundles go
// white-hot but keep their hue), then screens it over the theme's background gradient,
// adds a vignette, a faint chromatic fringe and film grain.

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBg1: { value: new THREE.Color('#07050f') },
    uBg2: { value: new THREE.Color('#000000') },
    uHot: { value: new THREE.Color('#ffffff') },
    uVig: { value: 0.55 },
    uTone: { value: 1.3 },
    uFade: { value: 1 },
    uPunch: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform vec3 uBg1;
    uniform vec3 uBg2;
    uniform vec3 uHot;
    uniform float uVig;
    uniform float uTone;
    uniform float uFade;
    uniform float uPunch;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float ab = 0.0016 * dot(c, c);
      vec3 L = vec3(
        texture2D(tDiffuse, vUv + c * ab * 5.0).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - c * ab * 5.0).b
      );
      float m = max(max(L.r, L.g), L.b);
      vec3 light = L;
      if (m > 1e-4) {
        float tm = (1.0 - exp(-m * uTone)) / (1.0 - exp(-uTone));
        light = L / m * min(tm, 1.0);
        light += smoothstep(1.4, 5.0, m) * 0.28 * uHot;
      }
      float asp = uRes.x / uRes.y;
      float r = length(c * vec2(asp, 1.0));
      vec3 bg = mix(uBg1, uBg2, smoothstep(0.0, 0.95, r));
      vec3 col = 1.0 - (1.0 - bg) * (1.0 - light * uFade * (1.0 + uPunch * 0.4));
      col *= 1.0 - dot(c, c) * uVig * 1.5;
      col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.018;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export function createComposer(renderer, scene, camera, { mobile }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.4 : 0.42, 0.55, 0.05);
  // The stock kernel truncates a wide gaussian into a box and draws square halos around
  // bright points. A narrower sigma keeps every halo round.
  for (const m of bloom.separableBlurMaterials) {
    const K = m.defines.KERNEL_RADIUS;
    const sigma = K / 2.4;
    m.uniforms.gaussianCoefficients.value = Array.from({ length: K }, (_, i) => Math.exp((-0.5 * i * i) / (sigma * sigma)));
  }
  composer.addPass(bloom);
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);

  const resize = (w, h, dpr) => {
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    const scale = mobile ? 0.4 : 0.55;
    const bw = Math.round(w * dpr * scale);
    const bh = Math.round(h * dpr * scale);
    bloom.resolution.set(bw, bh);
    bloom.setSize(bw, bh);
    final.uniforms.uRes.value.set(w * dpr, h * dpr);
  };

  const setTheme = (theme) => {
    final.uniforms.uBg1.value.set(theme.bg1);
    final.uniforms.uBg2.value.set(theme.bg2);
    final.uniforms.uHot.value.set(theme.hot);
    final.uniforms.uVig.value = theme.vignette;
    final.uniforms.uTone.value = theme.tone;
  };

  return { composer, bloom, final, resize, setTheme };
}
