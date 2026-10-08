// Periods (seconds) shared by the vertex-shader animations and the sound
// events, so every visible pulse lands with its sound. The shader reads these
// through `glslTiming()`; main.js fires the matching audio events.

export const T = {
  heroAP: 3.2, // giant neuron: one action potential per cycle
  molCycle: 8.0, // CaMKII: phosphorylation sweeps the ring, then resets
  molStart: 0.1, // ring step k lights at molStart + k * molStep (fraction of cycle)
  molStep: 0.045,
  molReset: 0.9,
  spineCycle: 6.0, // potentiated spines swell in four staggered groups
  gliaAP: 2.4, // saltatory conduction, node to node
  gliaNodes: 8,
  gliaWave: 7.0, // astrocyte Ca2+ wave
  synCycle: 9.0, // synapse: baseline → tetanus → potentiation → decay
  synBurst0: 0.14,
  synBurst1: 0.32,
  engram: 5.0, // ensemble reactivation
  hippoLoop: 4.0, // EC → DG → CA3 → CA1 → subiculum
  hippoSWR: 7.0, // sharp-wave ripple
  loop: 4.8, // cortex → striatum → pallidum → thalamus → cortex
  daBurst: 6.0, // dopamine burst
  netCycle: 12.0, // DMN → SN → CEN → SN
  brainWave: 6.0, // slow wave sweeping the cortex
  heart: 1.0, // 60 bpm
  hpa: 8.0, // hypothalamus → adrenal → cortisol back to brain
};

export function glslTiming() {
  return Object.entries(T)
    .map(([k, v]) => `const float T_${k} = ${Number.isInteger(v) ? v.toFixed(1) : String(v)};`)
    .join('\n');
}
