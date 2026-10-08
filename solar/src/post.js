import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Bloom gives every particle its fluorescent halo; its strength follows the
// glow setting and it switches off entirely at 0 (plain particles). The final
// pass maps the additive light back into range while keeping hue, then adds a
// soft vignette, faint chromatic fringing and film grain.

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uFringe: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uFringe;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float ab = 0.0048 * dot(c, c) * uFringe;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + c * ab).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - c * ab).b
      );
      float m = max(max(col.r, col.g), col.b);
      if (m > 1e-4) {
        float tm = (1.0 - exp(-m * 1.3)) / (1.0 - exp(-1.3));
        col = col / m * min(tm, 1.0);
        col += smoothstep(1.4, 5.0, m) * 0.28;
      }
      col *= 1.0 - dot(c, c) * 0.8;
      col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * (0.01 + 0.012 * uFringe);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export function createComposer(renderer, scene, camera, { mobile }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const base = mobile ? 1.0 : 1.15;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), base, 0.5, 0.18);
  // Stock kernels use sigma = radius, which truncates into a box blur and
  // draws soft squares around isolated bright points. A narrower sigma keeps
  // every halo round.
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
    const scale = mobile ? 0.4 : 0.6;
    bloom.resolution.set(Math.round(w * dpr * scale), Math.round(h * dpr * scale));
    bloom.setSize(Math.round(w * dpr * scale), Math.round(h * dpr * scale));
    final.uniforms.uRes.value.set(w * dpr, h * dpr);
  };

  // glow: 0 (plain dots) … 1 (default) … ~1.4 (strongest).
  const setGlow = (glow) => {
    bloom.enabled = glow > 0.01;
    bloom.strength = base * Math.pow(Math.min(glow, 1.5), 1.15);
    bloom.radius = 0.35 + 0.2 * Math.min(glow, 1.4);
    final.uniforms.uFringe.value = Math.min(glow, 1);
  };
  return { composer, bloom, final, resize, setGlow };
}
