import React, { useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Camera, Color3, PointLight, Scene, Vector3 } from '@babylonjs/core';
import { Check, DoorOpen, FastForward, HeartHandshake, LockKeyhole } from 'lucide-react';
import { applyCinematicLook, createEngine, disposeEngine } from './render';
import { buildVenue } from './venue';
import { makeAvatar } from './avatar3d';
import { DEFAULT_LOOK, Look } from './look';
import { ActivityOutcome, OutcomeCard } from './Outcome';

/** Mirrors `EncounterView` in `crates/common` (spec Screen 13). */
export type EncounterView = {
  id: string; room_id: string; partner_id: string; partner_name: string; partner_kind: 'player' | 'npc'; partner_look?: Look;
  status: 'waiting' | 'playing' | 'completed' | 'left';
  i_confirmed: boolean; partner_confirmed: boolean; partner_present: boolean; left_by_me: boolean;
  elapsed_secs?: number | null; scene_secs: number; outcome?: ActivityOutcome | null;
};

/** The scene's beats: reactions and a transition only. Nothing graphic, ever (ADR 0003). */
const LINES = [
  { at: 0, text: 'The music drops low. The city glows through the window.' },
  { at: 0.3, text: '{partner} steps closer. You meet them halfway.' },
  { at: 0.62, text: 'Later that night…' },
];
/** Fraction of the scene where the fade to black starts. */
const FADE_AT = 0.6;

/**
 * The private room, two avatars, warm practical light. While waiting they stand apart; once both agree they
 * drift together and turn in, the camera eases closer and the light warms, then the overlay fades to black.
 */
function EncounterStage({ myLook, partnerLook, progress }: { myLook: Look; partnerLook: Look; progress: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    if (!ref.current) return;
    const engine = createEngine(ref.current);
    const scene = new Scene(engine);
    const v = buildVenue(scene, 'private_room');
    const at = new Vector3(0, 0, 2.1);
    const glow = new PointLight('enc-glow', at.add(new Vector3(0, 1.9, -0.6)), scene);
    glow.diffuse = new Color3(1, 0.5, 0.42);
    glow.intensity = 0.6;
    glow.range = 3.4;

    const me = makeAvatar(scene, 'enc-me', myLook, new Color3(1, 0.1, 0.55), undefined, undefined, { castShadow: v.castShadow });
    const them = makeAvatar(scene, 'enc-them', partnerLook, new Color3(0, 0.8, 1), undefined, undefined, { castShadow: v.castShadow });
    me.ring.setEnabled(false);
    them.ring.setEnabled(false);

    const camera = new ArcRotateCamera('enc-cam', -Math.PI / 2, 1.38, 3.6, at.add(new Vector3(0, 1.1, 0)), scene);
    camera.minZ = 0.05;
    camera.maxZ = 100;
    applyCinematicLook(scene, [camera], { exposure: 1.3, bloomWeight: 0.35 });
    let portrait = false;
    const fit = () => {
      portrait = engine.getRenderWidth() < engine.getRenderHeight();
      camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
      camera.fov = portrait ? 1.1 : 0.62;
    };
    fit();

    let gap = 0.8;
    let turn = 0;
    engine.runRenderLoop(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      const t = performance.now() / 1000;
      const p = progressRef.current;
      v.animate(t, dt);
      // Close the distance over the first half of the scene; turn in slightly; warm the light.
      const target = 0.8 - Math.min(1, p / 0.5) * 0.48;
      gap += (target - gap) * Math.min(1, dt * 1.5);
      turn += (Math.min(1, p / 0.4) * 0.35 - turn) * Math.min(1, dt * 1.5);
      me.root.position = at.add(new Vector3(-gap, 0, 0));
      them.root.position = at.add(new Vector3(gap, 0, 0));
      me.root.rotation.y = Math.PI / 2 - turn;
      them.root.rotation.y = -Math.PI / 2 + turn;
      glow.intensity = 0.6 + p * 0.6;
      camera.alpha = -Math.PI / 2 + Math.sin(t * 0.1) * 0.08;
      camera.radius = (portrait ? 2.9 : 4.4) - p * 0.9;
      camera.target = at.add(new Vector3(0, (portrait ? 1.0 : 0.75) + p * 0.3, 0));
      me.animateWalk(false, dt);
      them.animateWalk(false, dt);
      scene.render();
    });
    const onResize = () => { engine.resize(); fit(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); disposeEngine(engine, scene); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className="date-canvas" />;
}

/**
 * Spec 13: clear confirmation that both want to proceed, a start action, Skip and Leave always visible, and a
 * clear transition to the outcome. Accepting the room isn't agreeing to the moment: both confirm again here.
 */
export function EncounterScene({
  encounter, myLook, busy, feedbackBusy, onConfirm, onLeave, onComplete, onFeedback, onDone, onStats,
}: {
  encounter: EncounterView; myLook: Look; busy: boolean; feedbackBusy: boolean;
  onConfirm: () => void; onLeave: () => void; onComplete: () => void;
  onFeedback: (tags: string[]) => void; onDone: () => void; onStats: () => void;
}) {
  const e = encounter;
  const [skipped, setSkipped] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  // Anchor the local clock to the server's "seconds since both agreed" so both sides play in step.
  const anchor = useRef<{ at: number; elapsed: number } | null>(null);
  if (e.elapsed_secs != null && anchor.current == null) anchor.current = { at: performance.now(), elapsed: e.elapsed_secs };
  const playing = e.status === 'playing' || (e.status === 'completed' && !!anchor.current);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { setNow(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const elapsed = anchor.current ? anchor.current.elapsed + (now - anchor.current.at) / 1000 : 0;
  const progress = e.status === 'waiting' || e.status === 'left' ? 0 : skipped ? 1 : Math.min(1, elapsed / Math.max(1, e.scene_secs));
  const sceneOver = skipped || progress >= 1 || (e.status === 'completed' && !anchor.current);

  // The first client to reach the end (or skip) completes it; the server pays both sides once.
  const asked = useRef(false);
  useEffect(() => {
    if (e.status === 'playing' && sceneOver && !asked.current) { asked.current = true; onComplete(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.status, sceneOver]);

  const line = [...LINES].reverse().find((l) => progress >= l.at)?.text.replace('{partner}', e.partner_name);
  const fade = e.status === 'completed' && sceneOver ? 1 : Math.max(0, Math.min(1, (progress - FADE_AT) / (1 - FADE_AT)));
  const dropped = (e.status === 'waiting' || e.status === 'playing') && !e.partner_present;
  const back = 'Back to Lagos';
  // A partner can finish first: keep playing the local scene until it ends or is skipped.
  const inScene = (e.status === 'playing' || e.status === 'completed') && !sceneOver;

  return <div className="date-screen encounter-screen" role="dialog" aria-label={`Private moment with ${e.partner_name}`}>
    <EncounterStage myLook={myLook} partnerLook={e.partner_look ?? DEFAULT_LOOK} progress={progress} />
    <div className="encounter-fade" style={{ opacity: fade }} aria-hidden="true" />
    <div className="date-top">
      {(e.status === 'waiting' || e.status === 'playing') && <button className="exit-scene date-leave" onClick={onLeave}><DoorOpen size={16} strokeWidth={2.6} /> Leave</button>}
      <div className="date-objective">
        <span className="date-title"><LockKeyhole size={13} strokeWidth={2.6} /> Somewhere private · {e.partner_name}</span>
        <span className="date-goal">Just the two of you. Either of you can stop at any time.</span>
      </div>
    </div>

    {inScene && <>
      <p className="encounter-line" key={line}>{line}</p>
      <button className="encounter-skip ghost" onClick={() => setSkipped(true)}><FastForward size={15} strokeWidth={2.6} /> Skip</button>
    </>}

    {e.status === 'waiting' && <div className="date-panel encounter-panel">
      <span className="date-kicker">Both of you need to agree</span>
      <p className="date-prompt">The room is yours. Nothing happens unless you both say so, and saying no is always fine.</p>
      <div className="consent-status">
        <span className={e.i_confirmed ? 'ok' : ''}>{e.i_confirmed ? <Check size={15} strokeWidth={3} /> : <i />} You {e.i_confirmed ? 'are ready' : 'haven\'t answered'}</span>
        <span className={e.partner_confirmed ? 'ok' : ''}>{e.partner_confirmed ? <Check size={15} strokeWidth={3} /> : <i />} {e.partner_name} {e.partner_confirmed ? 'is ready' : 'hasn\'t answered'}</span>
      </div>
      {dropped && <p className="date-recover">{e.partner_name} seems to have stepped away. Wait a moment, or head back. No penalty either way.</p>}
      {e.i_confirmed
        ? <p className="date-wait">Waiting for {e.partner_name}<span className="dots"><i /><i /><i /></span></p>
        : <div className="date-choices two">
          <button className="ghost" onClick={onLeave}>Not tonight</button>
          <button disabled={busy} onClick={onConfirm}><HeartHandshake size={17} strokeWidth={2.4} /> I'm ready</button>
        </div>}
    </div>}

    {e.status === 'playing' && sceneOver && <div className="date-panel encounter-panel">
      <p className="date-wait">Wrapping up<span className="dots"><i /><i /><i /></span></p>
    </div>}

    {e.status === 'completed' && sceneOver && <div className="date-panel encounter-panel">
      {e.outcome
        ? <OutcomeCard outcome={e.outcome} kicker="Activity completed" sending={feedbackBusy} onFeedback={onFeedback} onContinue={onDone} continueLabel="Back to Lagos" onStats={onStats} />
        : <p className="date-wait">Wrapping up<span className="dots"><i /><i /><i /></span></p>}
    </div>}

    {e.status === 'left' && <div className="date-panel encounter-panel">
      <div className="date-outcome">
        <span className="date-kicker">Ended</span>
        <h3>{e.left_by_me ? 'You called it a night' : `${e.partner_name} called it a night`}</h3>
        <p>That's always okay. No penalty for either of you{e.partner_kind === 'player' ? ', and your chat stays open' : ''}.</p>
        <button className="cta" onClick={onDone}>{back}</button>
      </div>
    </div>}
  </div>;
}
