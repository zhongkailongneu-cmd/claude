// Runs before everything else: without WebGL2 the page cannot draw its fibres, so say so
// instead of leaving a black screen, then stop the rest of the bundle from running.
const probe = document.createElement('canvas');
let ok = false;
try { ok = !!probe.getContext('webgl2'); } catch { ok = false; }
if (!ok) {
  const ld = document.getElementById('loader');
  if (ld) {
    ld.innerHTML = '<div class="ld-brand"><span>Pegasus</span></div><p class="ld-warn">This experience needs WebGL 2, which your browser or device has switched off.<br>Please try a current version of Chrome, Edge, Firefox or Safari.</p>';
    ld.classList.add('ready');
  }
  throw new Error('WebGL 2 is not available');
}
