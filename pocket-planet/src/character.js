// The little explorer: a low-poly kid in Loyel-blue overalls, coral beanie and
// a yellow backpack. Local +Y is up (the surface normal), +Z is forward.

import * as THREE from 'three';

const lam = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

export function buildCharacter() {
  const M = {
    overalls: lam('#376392'), shirt: lam('#F4F7FB'), skin: lam('#F6D4BA'), hat: lam('#EE8A6E'),
    hatBand: lam('#F4F7FB'), shoe: lam('#2B4868'), eye: lam('#263B54'), cheek: lam('#F3A0A5'),
    pack: lam('#F2C14E'), scarf: lam('#D9573F'),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // legs pivot at the hips
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.1, 0.3, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.24, 6), M.overalls, 0, -0.12, 0));
    g.add(mesh(new THREE.BoxGeometry(0.13, 0.08, 0.19), M.shoe, 0, -0.26, 0.03));
    body.add(g);
    return g;
  });

  body.add(mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.36, 8), M.overalls, 0, 0.47, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 8), M.shirt, 0, 0.66, 0));
  body.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.04), M.overalls, 0, 0.56, 0.2));
  body.add(mesh(new THREE.BoxGeometry(0.27, 0.3, 0.14), M.pack, 0, 0.5, -0.26));
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), M.pack, 0, 0.42, -0.34));

  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.22, 0.62, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.048, 0.045, 0.25, 5), M.shirt, 0, -0.12, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.055, 0), M.skin, 0, -0.27, 0));
    body.add(g);
    return g;
  });

  const head = new THREE.Group();
  head.position.y = 0.72;
  body.add(head);
  const face = mesh(new THREE.IcosahedronGeometry(0.25, 1), M.skin, 0, 0.2, 0);
  face.scale.set(1, 0.94, 0.98);
  head.add(face);
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.IcosahedronGeometry(0.032, 0), M.eye, s * 0.085, 0.21, 0.22));
    const c = mesh(new THREE.IcosahedronGeometry(0.04, 0), M.cheek, s * 0.15, 0.14, 0.18);
    c.scale.set(1, 0.6, 0.4);
    head.add(c);
  }
  const hat = mesh(new THREE.SphereGeometry(0.265, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.hat, 0, 0.24, -0.01);
  head.add(hat);
  const band = mesh(new THREE.CylinderGeometry(0.27, 0.275, 0.07, 9), M.hatBand, 0, 0.25, -0.01);
  head.add(band);
  const pom = mesh(new THREE.IcosahedronGeometry(0.07, 0), M.hatBand, 0, 0.53, -0.02);
  head.add(pom);

  const scarf = new THREE.Group();
  scarf.add(mesh(new THREE.TorusGeometry(0.17, 0.055, 5, 10), M.scarf, 0, 0, 0));
  scarf.children[0].rotation.x = Math.PI / 2;
  const tail = mesh(new THREE.BoxGeometry(0.09, 0.24, 0.04), M.scarf, 0.08, -0.12, 0.17);
  tail.rotation.z = 0.25;
  scarf.add(tail);
  scarf.position.y = 0.7;
  scarf.visible = false;
  body.add(scarf);

  // ripple ring shown while wading
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.42, 20),
    new THREE.MeshBasicMaterial({ color: '#F4F7FB', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.visible = false;
  root.add(ripple);

  root.scale.setScalar(0.85);

  let phase = 0;
  function animate(dt, t, { speed, air, wading }) {
    const amt = Math.min(1, Math.abs(speed) / 2.7);
    phase += dt * (5 + Math.abs(speed) * 2.6) * (amt > 0.02 ? 1 : 0);
    const sw = Math.sin(phase) * 0.75 * amt;
    if (air) {
      legs[0].rotation.x = -0.5; legs[1].rotation.x = 0.3;
      arms[0].rotation.z = -2.4; arms[1].rotation.z = 2.4;
      arms[0].rotation.x = arms[1].rotation.x = 0;
    } else {
      legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.9; arms[1].rotation.x = sw * 0.9;
      arms[0].rotation.z = -0.12 - (1 - amt) * 0.05; arms[1].rotation.z = 0.12 + (1 - amt) * 0.05;
    }
    body.position.y = Math.abs(Math.sin(phase)) * 0.06 * amt + Math.sin(t * 2.2) * 0.006;
    body.rotation.x = amt * 0.1 * Math.sign(speed);
    head.rotation.z = Math.sin(phase * 0.5) * 0.05 * amt;
    head.rotation.x = -0.04 + Math.sin(t * 1.6) * 0.02;
    pom.position.y = 0.53 + Math.sin(phase * 2) * 0.015 * amt;
    ripple.visible = wading;
    if (wading) {
      const k = (t * 1.2) % 1;
      ripple.scale.setScalar(0.8 + k * 0.9);
      ripple.material.opacity = 0.65 * (1 - k);
    }
  }

  return { root, scarf, ripple, animate };
}
