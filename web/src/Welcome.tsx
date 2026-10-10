import React, { useEffect, useRef } from 'react';
import { ArcRotateCamera, Camera, Color3, Engine, GlowLayer, HemisphericLight, MeshBuilder, Scene, Vector3 } from '@babylonjs/core';
import { addLagosSkyline, material } from './venue';
import { Sheet } from './ui';

/**
 * Animated nightlife backdrop (spec Screen 01): the Lagos lagoon skyline at night, seen from a
 * rooftop with string lights, drifting slowly. Built from our own procedural geometry, never from
 * docs/references. Falls back to the CSS gradient if WebGL isn't available.
 */
function Backdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    let engine: Engine;
    try {
      engine = new Engine(ref.current, true, { preserveDrawingBuffer: false, stencil: false });
    } catch {
      return; // no WebGL: CSS background shows instead
    }
    const scene = new Scene(engine);
    scene.clearColor.set(0.043, 0.027, 0.086, 1);
    const glow = new GlowLayer('welcome-glow', scene);
    glow.intensity = 0.7;
    new HemisphericLight('welcome-ambient', new Vector3(0, 1, 0), scene).intensity = 0.4;
    const skyline = addLagosSkyline(scene, { z: 40, y: -12, width: 180 });

    // Rooftop edge + string lights in the foreground.
    const rail = MeshBuilder.CreateBox('welcome-rail', { width: 40, height: 0.12, depth: 0.12 }, scene);
    rail.position = new Vector3(0, 0.6, -9);
    rail.material = material(scene, 'welcome-rail-mat', Color3.Black(), new Color3(0.55, 0.36, 0.96));
    const bulbMat = material(scene, 'welcome-bulb-mat', Color3.Black(), new Color3(1, 0.72, 0.38));
    for (let i = 0; i < 22; i++) {
      const bulb = MeshBuilder.CreateSphere(`welcome-bulb-${i}`, { diameter: 0.16 }, scene);
      bulb.position = new Vector3(-11 + i * 1.05, 5.6 - Math.sin((i / 21) * Math.PI) * 0.9, -8);
      bulb.material = bulbMat;
    }

    // Stand on a rooftop ~60 units back from the bridge, looking out over the lagoon.
    const camera = new ArcRotateCamera('welcome-cam', -Math.PI / 2, Math.PI / 2.02, 14, new Vector3(0, 3, -6), scene);
    camera.minZ = 0.1;
    camera.maxZ = 400;
    const portrait = () => engine.getRenderWidth() < engine.getRenderHeight();
    const fit = () => {
      camera.fovMode = portrait() ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
      camera.fov = portrait() ? 0.9 : 0.75;
    };
    fit();
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    engine.runRenderLoop(() => {
      const t = performance.now() / 1000;
      if (!still) camera.alpha = -Math.PI / 2 + Math.sin(t * 0.06) * 0.22;
      skyline(t);
      scene.render();
    });
    const onResize = () => { engine.resize(); fit(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); scene.dispose(); engine.dispose(); };
  }, []);
  return <canvas ref={ref} className="welcome-backdrop" aria-hidden="true" />;
}

export type LegalDoc = 'terms' | 'privacy' | 'rules';

/** Draft legal copy. The final Terms of Service and Privacy Policy need client / legal input. */
export function LegalSheet({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const draft = <p className="legal-draft">Draft for testing. The final {doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} will be provided before public launch.</p>;
  if (doc === 'rules') {
    return <Sheet title="Community rules" onClose={onClose}>
      <ul className="legal-list">
        <li><b>Adults only.</b> You must be 18 or older to play.</li>
        <li><b>Consent first.</b> Every date or private invitation needs the other person's clear yes. Anyone can decline, cancel or leave at any time.</li>
        <li><b>No harassment.</b> No pressure, threats, hate or unwanted explicit messages. Pushy or crude chat scores against you.</li>
        <li><b>Respect blocks and boundaries.</b> A block hides you from each other both ways. Boundaries can't be bypassed.</li>
        <li><b>Keep it non-graphic.</b> Intimate moments fade to black.</li>
        <li><b>Report problems.</b> Report is always one tap away on any profile or chat.</li>
      </ul>
    </Sheet>;
  }
  if (doc === 'privacy') {
    return <Sheet title="Privacy" onClose={onClose}>
      {draft}
      <ul className="legal-list">
        <li><b>What we store:</b> your email, a hashed password, your date of birth (only to check you're 18+), your character, profile and preferences, your conversations with in-game characters, and game activity (for progress, safety and moderation).</li>
        <li><b>What others see:</b> your alias, your avatar, your bio, and only the preferences you mark public. Your intent, boundaries and discovery settings stay private.</li>
        <li><b>Discoverability:</b> you can hide from Nearby lists at any time from your profile.</li>
        <li><b>Blocks and reports</b> are stored so we can keep the community safe.</li>
      </ul>
    </Sheet>;
  }
  return <Sheet title="Terms of Service" onClose={onClose}>
    {draft}
    <ul className="legal-list">
      <li>Side Piece is for adults (18+) only. Accounts found to belong to minors are removed.</li>
      <li>You're responsible for what you say and do in the game, and you agree to the Community rules.</li>
      <li>In-game cash (₦) has no real-world value and can't be exchanged for money.</li>
      <li>We may suspend accounts that harass others or break the rules.</li>
    </ul>
  </Sheet>;
}

type Props = { onCreate: () => void; onSignIn: () => void; onLegal: (doc: LegalDoc) => void };

/** Spec Screen 01: logo, short pitch, nightlife backdrop, Create Account / Sign In, Terms & Privacy. */
export function Welcome({ onCreate, onSignIn, onLegal }: Props) {
  return <div className="welcome">
    <Backdrop />
    <div className="welcome-shade" />
    <div className="welcome-content">
      <div className="welcome-brand">
        <h1 className="brand-logo">Side<span>piece</span></h1>
        <div className="brand-kicker">Same people. New options.</div>
      </div>
      <p className="welcome-pitch">Lagos after dark. Build your look, meet people, flirt, make plans, always on your terms.</p>
      <div className="welcome-actions">
        <button className="hero" onClick={onCreate}>Create account</button>
        <button className="ghost hero" onClick={onSignIn}>Sign in</button>
      </div>
      <p className="welcome-legal">
        18+ only · <a href="#terms" onClick={(e) => { e.preventDefault(); onLegal('terms'); }}>Terms</a> · <a href="#privacy" onClick={(e) => { e.preventDefault(); onLegal('privacy'); }}>Privacy</a> · <a href="#rules" onClick={(e) => { e.preventDefault(); onLegal('rules'); }}>Community rules</a>
      </p>
    </div>
  </div>;
}
