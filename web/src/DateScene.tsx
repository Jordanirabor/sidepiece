import React, { useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Camera, Color3, MeshBuilder, PointLight, Scene, Vector3 } from '@babylonjs/core';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { applyCinematicLook, createEngine, disposeEngine } from './render';
import { buildVenue, material } from './venue';
import { makeAvatar } from './avatar3d';
import { DEFAULT_LOOK, Look } from './look';

/** Mirrors `DateView` in `crates/common` (spec Screen 12). */
export type DateLine = { beat: number; prompt: string; mine: string; theirs: string; delta: number };
export type DateOutcome = { label: string; summary: string; xp: number; affinity: number; objective_met: boolean };
export type DateView = {
  id: string; scene: string; title: string; venue: string; objective: string;
  partner_id: string; partner_name: string; partner_kind: 'player' | 'npc'; partner_look?: Look;
  beat: number; beats_total: number; prompt: string; choices: string[]; my_choice?: number | null; partner_ready: boolean;
  chemistry: number; chemistry_goal: number; history: DateLine[];
  status: 'active' | 'completed' | 'left'; left_by_me: boolean; partner_present: boolean; outcome?: DateOutcome | null;
};

/** Where the table goes in each venue: open floor with the venue's signature backdrop behind it. */
const SPOTS: Record<string, { at: Vector3; exposure?: number; bloom?: number }> = {
  rooftop_party: { at: new Vector3(0, 0, 6.3) },
  neon_lounge: { at: new Vector3(-2.2, 0, 2.6), exposure: 1.4, bloom: 0.4 },
};

/**
 * The shared scene: the real venue, a candle-lit table for two, both avatars facing each other.
 * They lean in as chemistry grows, so choices visibly change the scene. Goes through render.ts like every canvas.
 */
function DateStage({ venue, myLook, partnerLook, warmth }: { venue: string; myLook: Look; partnerLook: Look; warmth: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const warmthRef = useRef(warmth);
  warmthRef.current = warmth;

  useEffect(() => {
    if (!ref.current) return;
    const engine = createEngine(ref.current);
    const scene = new Scene(engine);
    const v = buildVenue(scene, venue);
    const spot = SPOTS[venue] ?? SPOTS.rooftop_party;
    const at = spot.at;

    const top = MeshBuilder.CreateCylinder('date-table', { diameter: 0.8, height: 0.05, tessellation: 40 }, scene);
    top.position = at.add(new Vector3(0, 1.02, 0));
    top.material = material(scene, 'date-table-mat', new Color3(0.9, 0.88, 0.84));
    const stem = MeshBuilder.CreateCylinder('date-stem', { diameter: 0.08, height: 1.0 }, scene);
    stem.position = at.add(new Vector3(0, 0.5, 0));
    stem.material = material(scene, 'date-stem-mat', new Color3(0.12, 0.1, 0.12));
    const flame = material(scene, 'date-candle-mat', Color3.Black(), new Color3(1, 0.62, 0.25));
    for (const [x, z] of [[-0.08, 0.1], [0.1, -0.08]] as const) {
      const candle = MeshBuilder.CreateCylinder(`date-candle-${x}`, { diameter: 0.06, height: 0.12 }, scene);
      candle.position = at.add(new Vector3(x, 1.1, z));
      candle.material = flame;
    }
    for (const x of [-0.24, 0.24]) {
      const glass = MeshBuilder.CreateCylinder(`date-glass-${x}`, { diameterTop: 0.08, diameterBottom: 0.05, height: 0.16 }, scene);
      glass.position = at.add(new Vector3(x, 1.13, 0.12));
      const m = material(scene, `date-glass-mat-${x}`, new Color3(0.9, 0.85, 1), new Color3(0.25, 0.12, 0.2));
      m.alpha = 0.45;
      glass.material = m;
    }
    const candleLight = new PointLight('date-candle-light', at.add(new Vector3(0, 1.35, 0)), scene);
    candleLight.diffuse = new Color3(1, 0.62, 0.32);
    candleLight.intensity = 1;
    candleLight.range = 3.2;
    v.castShadow(top);

    // Avatars face +Z; rotate to face each other across the table (me on the left, partner on the right).
    const me = makeAvatar(scene, 'date-me', myLook, new Color3(1, 0.1, 0.55), undefined, undefined, { castShadow: v.castShadow });
    const them = makeAvatar(scene, 'date-them', partnerLook, new Color3(0, 0.8, 1), undefined, undefined, { castShadow: v.castShadow });
    // The floor rings are world-navigation markers; at a table they just look like UI.
    me.ring.setEnabled(false);
    them.ring.setEnabled(false);
    me.root.rotation.y = Math.PI / 2;
    them.root.rotation.y = -Math.PI / 2;
    me.root.position = at.add(new Vector3(-0.68, 0, 0));
    them.root.position = at.add(new Vector3(0.68, 0, 0));

    const camera = new ArcRotateCamera('date-cam', -Math.PI / 2, 1.36, 3.3, at.add(new Vector3(0, 1.2, 0)), scene);
    camera.minZ = 0.05;
    camera.maxZ = 400;
    applyCinematicLook(scene, [camera], { exposure: spot.exposure, bloomWeight: spot.bloom });
    const fit = () => {
      const portrait = engine.getRenderWidth() < engine.getRenderHeight();
      camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
      camera.fov = portrait ? 1.15 : 0.62;
      // Portrait: lift the framing so the faces sit above the dialogue panel.
      // Landscape: pull back and aim low so the couple sits in the top half, clear of the panel.
      camera.target = at.add(new Vector3(0, portrait ? 0.95 : 0.7, 0));
      camera.radius = portrait ? 2.6 : 4.6;
    };
    fit();
    (window as unknown as { __date?: unknown }).__date = { scene };

    let gap = 0.68;
    engine.runRenderLoop(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      const t = performance.now() / 1000;
      v.animate(t);
      candleLight.intensity = 0.95 + Math.sin(t * 9) * 0.05;
      camera.alpha = -Math.PI / 2 + Math.sin(t * 0.12) * 0.12;
      // Lean in with chemistry (0..1): the gap narrows from 68 cm to 52 cm.
      gap += (0.68 - warmthRef.current * 0.16 - gap) * Math.min(1, dt * 2);
      me.root.position.x = at.x - gap;
      them.root.position.x = at.x + gap;
      me.animateWalk(false, dt);
      them.animateWalk(false, dt);
      scene.render();
    });
    const onResize = () => { engine.resize(); fit(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); disposeEngine(engine, scene); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue]);

  return <canvas ref={ref} className="date-canvas" />;
}

function Meter({ value, goal }: { value: number; goal: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, goal)) * 100));
  return <span className={`chem-meter ${value >= goal ? 'met' : ''}`} aria-label={`Chemistry ${value} of ${goal}`}><i style={{ width: `${pct}%` }} /></span>;
}

/**
 * Spec 12: full-screen environment, both avatars, a dialogue panel near the bottom with 2–3 choices,
 * a visible Leave button, and the objective. Partner drop-off and partner leaving get neutral recovery.
 */
export function DateScene({
  date, myLook, busy, onChoose, onLeave, onDone,
}: {
  date: DateView; myLook: Look; busy: boolean;
  onChoose: (choice: number) => void; onLeave: () => void; onDone: () => void;
}) {
  const last = date.history[date.history.length - 1];
  const waiting = date.status === 'active' && date.my_choice != null;
  // "Keep waiting" hides the drop-off notice for 20 s; it comes back if they're still gone.
  const [waitedAt, setWaitedAt] = useState(0);
  const dropped = date.status === 'active' && !date.partner_present && Date.now() - waitedAt > 20000;
  const back = date.partner_kind === 'player' ? 'Back to chat' : 'Back to Lagos';
  return <div className="date-screen" role="dialog" aria-label={`${date.title} with ${date.partner_name}`}>
    <DateStage venue={date.venue} myLook={myLook} partnerLook={date.partner_look ?? DEFAULT_LOOK} warmth={Math.max(0, Math.min(1, date.chemistry / Math.max(1, date.chemistry_goal)))} />
    <div className="date-top">
      {date.status === 'active' && <button className="exit-scene date-leave" onClick={onLeave}><ArrowLeft size={16} strokeWidth={2.6} /> Leave</button>}
      <div className="date-objective">
        <span className="date-title">{date.title} · {date.partner_name}</span>
        <span className="date-goal"><Sparkles size={13} strokeWidth={2.6} /> {date.objective}</span>
        <span className="date-progress"><Meter value={date.chemistry} goal={date.chemistry_goal} /><small>{Math.min(date.beat + 1, date.beats_total)}/{date.beats_total}</small></span>
      </div>
    </div>

    <div className="date-panel">
      {date.status === 'completed' && date.outcome && <div className="date-outcome">
        <span className="date-kicker">{date.outcome.objective_met ? 'Objective met' : 'Date complete'}</span>
        <h3>{date.outcome.label}</h3>
        <p>{date.outcome.summary}</p>
        <div className="pill-row tight">
          <span className="pill good">+{date.outcome.xp} XP</span>
          <span className="pill good">+{date.outcome.affinity} with {date.partner_name}</span>
          <span className="pill">Chemistry {date.chemistry}/{date.chemistry_goal}</span>
        </div>
        <button className="cta" onClick={onDone}>Continue</button>
      </div>}

      {date.status === 'left' && <div className="date-outcome">
        <span className="date-kicker">Date ended</span>
        <h3>{date.left_by_me ? 'You headed out' : `${date.partner_name} headed out`}</h3>
        <p>No hard feelings. {date.partner_kind === 'player' ? 'The chat is still open.' : 'Lagos is still out there.'}</p>
        <button className="cta" onClick={onDone}>{back}</button>
      </div>}

      {date.status === 'active' && <>
        {last && <div className="date-recap" key={last.beat}>
          <p><b>You</b> {last.mine}</p>
          <p><b>{date.partner_name}</b> {last.theirs}</p>
          <span className={`date-delta ${last.delta > 0 ? 'up' : last.delta < 0 ? 'down' : ''}`}>{last.delta > 0 ? '+' : ''}{last.delta} chemistry</span>
        </div>}
        <p className="date-prompt">{date.prompt}</p>
        {dropped
          ? <div className="date-recover">
            <p>{date.partner_name} seems to have dropped off. Wait a moment, or head back. No penalty either way.</p>
            <div className="date-choices two"><button className="ghost" onClick={() => setWaitedAt(Date.now())}>Keep waiting</button><button onClick={onLeave}>{back}</button></div>
          </div>
          : <div className="date-choices">
            {date.choices.map((c, i) => <button key={i} className={`date-choice ${date.my_choice === i ? 'mine' : ''}`} disabled={busy || waiting} onClick={() => onChoose(i)}>{c}</button>)}
          </div>}
        {waiting && !dropped && <p className="date-wait">Waiting for {date.partner_name} to choose<span className="dots"><i /><i /><i /></span></p>}
      </>}
    </div>
  </div>;
}
