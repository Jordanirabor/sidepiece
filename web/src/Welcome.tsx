import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Camera, Color3, Engine, GlowLayer, HemisphericLight, MeshBuilder, Scene, Vector3 } from '@babylonjs/core';
import { applyCinematicLook, createEngine, disposeEngine } from './render';
import { addLagosSkyline, material } from './venue';
import { ArrowRight, HeartHandshake, ScrollText, ShieldCheck, X, type LucideIcon } from 'lucide-react';
import { BrandLogo } from './ui';

/**
 * Animated nightlife backdrop (spec Screen 01): the Lagos lagoon skyline at night, seen from a
 * rooftop with string lights, drifting slowly. Built from our own procedural geometry, never from
 * docs/references. Falls back to the CSS gradient if WebGL isn't available.
 */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    let engine: Engine;
    try {
      engine = createEngine(ref.current);
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
    applyCinematicLook(scene, [camera], { exposure: 1.3, bloomWeight: 0.55 });
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
    return () => { window.removeEventListener('resize', onResize); disposeEngine(engine, scene); };
  }, []);
  return <canvas ref={ref} className="welcome-backdrop" aria-hidden="true" />;
}

export type LegalDoc = 'terms' | 'privacy' | 'rules';

const LEGAL_TABS: { id: LegalDoc; label: string; title: string; Icon: LucideIcon }[] = [
  { id: 'terms', label: 'Terms', title: 'Terms of Service', Icon: ScrollText },
  { id: 'privacy', label: 'Privacy', title: 'Privacy', Icon: ShieldCheck },
  { id: 'rules', label: 'Rules', title: 'Community rules', Icon: HeartHandshake },
];

const LEGAL_POINTS: Record<LegalDoc, React.ReactNode[]> = {
  rules: [
    <><b>Adults only.</b> You must be 18 or older to play.</>,
    <><b>Consent first.</b> Every date or private invitation needs the other person's clear yes. Anyone can decline, cancel or leave at any time.</>,
    <><b>No harassment.</b> No pressure, threats, hate or unwanted explicit messages. Pushy or crude chat scores against you.</>,
    <><b>Respect blocks and boundaries.</b> A block hides you from each other both ways. Boundaries can't be bypassed.</>,
    <><b>Keep it non-graphic.</b> Intimate moments fade to black.</>,
    <><b>Report problems.</b> Report is always one tap away on any profile or chat.</>,
  ],
  privacy: [
    <><b>What we store:</b> your email, a hashed password, your date of birth (only to check you're 18+), your character, profile and preferences, your conversations with in-game characters, and game activity (for progress, safety and moderation).</>,
    <><b>What others see:</b> your alias, your avatar, your bio, and only the preferences you mark public. Your intent, boundaries and discovery settings stay private.</>,
    <><b>Discoverability:</b> you can hide from Nearby lists at any time from your profile.</>,
    <><b>Blocks and reports</b> are stored so we can keep the community safe.</>,
  ],
  terms: [
    <>Side Piece is for adults (18+) only. Accounts found to belong to minors are removed.</>,
    <>You're responsible for what you say and do in the game, and you agree to the Community rules.</>,
    <>In-game cash (₦) has no real-world value and can't be exchanged for money.</>,
    <>We may suspend accounts that harass others or break the rules.</>,
  ],
};

/**
 * Terms / Privacy / Community rules as an animated pop-up: springs in, tabs between the three docs, points
 * stagger in, and it animates out before unmounting. Draft copy: the final Terms of Service and Privacy
 * Policy need client / legal input.
 */
export function LegalPopup({ doc: initial, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const [doc, setDoc] = useState(initial);
  const [closing, setClosing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setClosing(true), []);
  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(onClose, 200); // matches the legal-out animation
    return () => window.clearTimeout(t);
  }, [closing, onClose]);
  const tab = LEGAL_TABS.find((t) => t.id === doc)!;
  return <div className={`legal-scrim ${closing ? 'closing' : ''}`} onClick={close}>
    <div ref={cardRef} tabIndex={-1} className={`legal-pop ${doc}`} role="dialog" aria-modal="true" aria-label={tab.title} onClick={(e) => e.stopPropagation()}>
      <button className="legal-close" onClick={close} aria-label="Close"><X size={18} strokeWidth={2.6} /></button>
      <div className="legal-badge" key={`badge-${doc}`}><tab.Icon size={30} strokeWidth={2.2} /></div>
      <h2 key={`title-${doc}`}>{tab.title}</h2>
      <div className={`legal-tabs at-${LEGAL_TABS.indexOf(tab)}`} role="tablist">
        <i className="legal-tabs-pill" aria-hidden="true" />
        {LEGAL_TABS.map((t) => <button key={t.id} role="tab" aria-selected={t.id === doc} className={t.id === doc ? 'on' : ''} onClick={() => setDoc(t.id)}>{t.label}</button>)}
      </div>
      <div className="legal-body" key={doc}>
        {doc !== 'rules' && <p className="legal-draft">Draft for testing. The final {doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} will be provided before public launch.</p>}
        <ul className="legal-list">
          {LEGAL_POINTS[doc].map((point, i) => <li key={i} style={{ '--i': i } as React.CSSProperties}>{point}</li>)}
        </ul>
      </div>
      <button className="legal-ok" onClick={close}>Got it</button>
    </div>
  </div>;
}

/** Scrolling marquee of Lagos spots in outlined display type. */
export function Ticker() {
  const spots = ['Lekki Phase 1', 'Ikoyi', 'Victoria Island', 'Rooftops', 'Lounges', 'Late-night suya', 'Afrobeats'];
  const row = spots.map((s) => <span key={s}>{s}<i>✦</i></span>);
  return <div className="ticker" aria-hidden="true"><div className="ticker-track">{row}{row}</div></div>;
}

type Props = { onCreate: () => void; onSignIn: () => void; onLegal: (doc: LegalDoc) => void };

/** Spec Screen 01: logo, short pitch, nightlife backdrop, Create Account / Sign In, Terms & Privacy. */
export function Welcome({ onCreate, onSignIn, onLegal }: Props) {
  return <div className="welcome">
    <Backdrop />
    <div className="welcome-shade" />
    <div className="welcome-content">
      <div className="welcome-brand">
        <BrandLogo />
        <div className="brand-kicker">Same people. New options.</div>
      </div>
      {/* The poster's "phone" fantasy: notifications drifting around the night sky. Decorative only. */}
      <div className="float-stickers" aria-hidden="true">
        <span className="bubble b1"><i>💌</i> Maya liked you back</span>
        <span className="bubble b2"><i>🍸</i> Rooftop at 11?</span>
        <span className="bubble b3"><i>🔥</i> 3 people nearby</span>
        <span className="bubble b4"><i>✨</i> It's a match!</span>
        <span className="sticky-note">Better choices<br />Bigger stories ♥</span>
      </div>
      <div className="welcome-bottom">
        <p className="welcome-pitch">Lagos after dark. Build your look, meet people, flirt, make plans. <b>Always on your terms.</b></p>
        <div className="welcome-actions">
          <button className="hero get-in" onClick={onCreate}>Get in <ArrowRight size={20} strokeWidth={2.8} /></button>
          <button className="ghost hero" onClick={onSignIn}>I have an account</button>
        </div>
      <p className="welcome-legal">
        <b className="age-chip">18+</b> <a href="#terms" onClick={(e) => { e.preventDefault(); onLegal('terms'); }}>Terms</a> · <a href="#privacy" onClick={(e) => { e.preventDefault(); onLegal('privacy'); }}>Privacy</a> · <a href="#rules" onClick={(e) => { e.preventDefault(); onLegal('rules'); }}>Community rules</a>
      </p>
      </div>
    </div>
    <Ticker />
  </div>;
}
