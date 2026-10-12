import React, { useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Camera, Color3, Engine, Matrix, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { applyCinematicLook, createEngine, disposeEngine } from './render';
import { buildVenue, Humanoid, makeLabel, Portal, VenueHandles } from './venue';
import { clubOf } from './venues';
import { makeAvatar } from './avatar3d';
import { Look } from './look';

export type Login = { player_id: string; display_name: string; token: string };
export type Room = { id: string; kind: string; websocket_url: string; display_name: string; player_count: number; capacity: number };
export type SceneNpc = { id: string; name: string; x: number; z: number; look: Look };

type RosterEntry = { player_id: string; display_name: string; look: Look; x: number; y: number; z: number; rot_y: number };

type ServerEvent =
  | { type: 'welcome'; player_id: string; room_id: string; roster: RosterEntry[] }
  | { type: 'player_joined'; player_id: string; display_name: string; look: Look }
  | { type: 'player_left'; player_id: string }
  | { type: 'player_moved'; player_id: string; x: number; y: number; z: number; rot_y: number }
  | { type: 'chat'; player_id: string; display_name: string; text: string }
  | { type: 'error'; message: string };

type ChatLine = { id: number; who: string; text: string; system?: boolean };
type Remote = { h: Humanoid; target: Vector3; rot: number; name: string };

const INTERACT_DISTANCE = 2.2;
const WALK_SPEED = 3.2;
export type Speed = 'walk' | 'run' | 'sprint';
export const SPEEDS: Speed[] = ['walk', 'run', 'sprint'];
const SPEED_MPS: Record<Speed, number> = { walk: WALK_SPEED, run: 7.5, sprint: 14 };
type Target = { type: 'npc'; npc: SceneNpc } | { type: 'portal'; portal: Portal };
const targetKey = (t: Target | null) => (t ? (t.type === 'npc' ? `npc:${t.npc.id}` : `portal:${t.portal.kind}`) : '');

type Props = {
  room?: Room;
  player?: Login;
  joinTicket?: string;
  look: Look;
  npcs: SceneNpc[];
  typingNpcId?: string;
  onInteractNpc: (npcId: string) => void;
  onPortal: (kind: string) => void;
  /** Stop rendering and input while a full-screen scene (a date) covers the world. The room stays joined. */
  paused?: boolean;
  /** Pace for keyboard, joystick and tap-to-move. */
  speed?: Speed;
  /** "Take me there" from the Go out sheet: walk to that venue's door (bump `seq` to repeat). */
  walkRequest?: { kind: string; seq: number };
  /** Game-clock hour (0..24) for outdoor daylight. */
  hour?: number;
  children?: React.ReactNode;
};

export function SceneView({ room, player, joinTicket, look, npcs, typingNpcId, onInteractNpc, onPortal, paused = false, speed = 'walk', walkRequest, hour, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const remotesRef = useRef<Map<string, Remote>>(new Map());
  const castRef = useRef<(m: import('@babylonjs/core').AbstractMesh) => void>(() => {});
  const pendingLooksRef = useRef<Map<string, { look: Look; name: string }>>(new Map());
  const keysRef = useRef<Set<string>>(new Set());
  const moveVecRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const joyOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [joy, setJoy] = useState<{ x: number; y: number } | null>(null);
  const JOY_R = 46;
  const targetRef = useRef<Target | null>(null);
  const interactRef = useRef(onInteractNpc);
  const portalRef = useRef(onPortal);
  const typingRef = useRef<string | undefined>(typingNpcId);
  const pausedRef = useRef(paused);
  const hourRef = useRef(hour);
  const speedRef = useRef<Speed>(speed);
  speedRef.current = speed;
  const walkToPortalRef = useRef<(kind: string) => void>(() => {});
  useEffect(() => { if (walkRequest) walkToPortalRef.current(walkRequest.kind); }, [walkRequest?.seq]);
  const venueRef = useRef<VenueHandles | null>(null);
  const lastVenueRef = useRef<string | undefined>(undefined);
  /** Tap/click-to-move destination on the ground. */
  const goalRef = useRef<Vector3 | null>(null);
  const [loading, setLoading] = useState(true);
  pausedRef.current = paused;
  // `?hour=21` pins the time of day (QA, screenshots).
  const pinnedHour = new URLSearchParams(window.location.search).get('hour');
  if (pinnedHour !== null) hour = +pinnedHour;
  hourRef.current = hour;
  useEffect(() => { if (hour !== undefined) venueRef.current?.setHour?.(hour); }, [hour]);
  const [target, setTarget] = useState<Target | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const chatIdRef = useRef(0);

  interactRef.current = onInteractNpc;
  portalRef.current = onPortal;
  typingRef.current = typingNpcId;
  const venueKind = room?.kind ?? 'city';
  const npcKey = npcs.map((n) => n.id).join(',');
  const lookKey = JSON.stringify(look);

  const activate = (t: Target | null) => {
    if (!t) return;
    if (t.type === 'npc') interactRef.current(t.npc.id);
    else portalRef.current(t.portal.kind);
  };

  const pushChat = (line: Omit<ChatLine, 'id'>) =>
    setChat((c) => [...c, { ...line, id: chatIdRef.current++ }].slice(-40));

  const spawnRemote = (id: string, name: string, remoteLook: Look, pos: Vector3, rot: number) => {
    const scene = sceneRef.current;
    if (!scene || remotesRef.current.has(id)) return;
    const h = makeAvatar(scene, `remote-${id}`, remoteLook, new Color3(0, 0.8, 1), name, '#8defff', { castShadow: (m) => castRef.current(m) });
    h.meshes.forEach((m) => castRef.current(m));
    h.root.position = pos.clone();
    h.root.rotation.y = rot;
    remotesRef.current.set(id, { h, target: pos.clone(), rot, name });
  };

  // One engine for the canvas's lifetime; venue changes swap the scene only. Recreating engines on the same
  // canvas left stale GL programs behind ("reading 'program'" on the first frame of the new venue).
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createEngine(canvasRef.current);
    engineRef.current = engine;
    return () => { engineRef.current = null; disposeEngine(engine); };
  }, []);

  // Build the 3D venue. Rebuilt when venue type, avatar look, or NPC set changes.
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = engineRef.current;
    if (!engine) return;
    const scene = new Scene(engine);
    sceneRef.current = scene;
    // Back in the city you step out of the club you just left.
    const venue = buildVenue(scene, venueKind, lastVenueRef.current);
    lastVenueRef.current = venueKind;
    venueRef.current = venue;
    goalRef.current = null;
    // Cover the canvas until streamed assets are in, so nobody sees an empty or half-built world.
    setLoading(true);
    const reveal = () => { if (!scene.isDisposed) scene.executeWhenReady(() => setLoading(false)); };
    (venue.ready ?? Promise.resolve()).then(reveal, reveal);
    if (hourRef.current !== undefined) venue.setHour?.(hourRef.current);
    castRef.current = venue.castShadow;

    // Third-person, slightly over the shoulder, behind the player (player spawns facing +Z).
    const heading = venue.camera?.alpha ?? -Math.PI / 2;
    const camera = new ArcRotateCamera('camera', heading, Math.PI / 2.25, 7.5, venue.playerSpawn.add(new Vector3(0, 1.2, 0)), scene);
    camera.minZ = 0.1;
    camera.attachControl(canvasRef.current, true);
    // Orbit and zoom only: panning moved the target away, then the follow snapped it back (the camera "fought" you).
    camera.panningSensibility = 0;
    // Arrow keys move the player; the camera's own arrow-key orbit made the view swing on left/right.
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    camera.wheelPrecision = 12; // ~0.6 m per wheel notch at the default inertia
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = venue.camera?.upperRadius ?? 18;
    camera.upperBetaLimit = Math.PI / 2.1;
    camera.lowerBetaLimit = Math.PI / 5;
    camera.maxZ = venue.camera?.maxZ ?? 400;
    applyCinematicLook(scene, [camera], ['club', 'lounge'].includes(clubOf(venueKind)?.style ?? '') ? { exposure: 1.4, bloomWeight: 0.4 }
      : venueKind === 'city' ? { exposure: 1.12, contrast: 1.08, vignette: 0.2, bloomThreshold: 0.95, bloomWeight: 0.2, ao: true } : {});

    const local = makeAvatar(scene, 'you', look, new Color3(1, 0.1, 0.55), player?.display_name ?? 'You', '#ffc0df', { castShadow: venue.castShadow });
    local.root.position = venue.playerSpawn.clone();
    // Face the way the camera looks (avatars face +Z at rest; the camera looks along -(cos α, sin α)).
    local.root.rotation.y = Math.atan2(-Math.cos(heading), -Math.sin(heading));
    local.meshes.forEach((m) => venue.castShadow(m));
    // Test/debug hook used by automated UI checks (position, portals, venue; `scene` for readiness probes).
    (window as unknown as { __sp?: unknown }).__sp = { scene, pos: () => local.root.position.asArray(), portals: venue.portals.map((p) => ({ kind: p.kind, pos: p.position.asArray() })), venue: venueKind, setHour: (h: number) => venue.setHour?.(h), camAlpha: () => camera.alpha, teleport: (x: number, z: number, rot = 0) => { local.root.position.set(x, 0, z); local.root.rotation.y = rot; camera.alpha = -Math.PI / 2 - rot; } };

    const npcActors = npcs.map((npc) => {
      const actor = { bubbleY: 2.75 };
      const h = makeAvatar(scene, `npc-${npc.id}`, npc.look, new Color3(1, 0.05, 0.6), npc.name, '#ffe08a', {
        castShadow: venue.castShadow,
        onReady: ({ headY }) => { actor.bubbleY = headY + 0.75; },
      });
      h.root.position = new Vector3(npc.x, 0, npc.z);
      h.meshes.forEach((m) => venue.castShadow(m));
      h.root.rotation.y = Math.PI;
      const bubble = makeLabel(scene, `npc-${npc.id}-typing`, '•••', { width: 0.6, height: 0.3, font: 64 });
      bubble.position.y = 2.75;
      bubble.parent = h.root;
      bubble.setEnabled(false);
      return Object.assign(actor, { npc, h, bubble });
    });

    // Re-create remote avatars after a scene rebuild (e.g. look change) from the last known state.
    const previous = Array.from(remotesRef.current.entries());
    remotesRef.current.clear();
    previous.forEach(([id, r]) => {
      const pending = pendingLooksRef.current.get(id);
      if (pending) spawnRemote(id, r.name, pending.look, r.target, r.rot);
    });

    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const key = e.key.toLowerCase();
      if (key === 'e') activate(targetRef.current);
      keysRef.current.add(key);
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const onBlur = () => keysRef.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // Tap/click to move (a drag still orbits the camera). Tapping a person, a door or a building walks you there
    // along the streets; people and doors open when you arrive.
    const marker = MeshBuilder.CreateTorus('goal-marker', { diameter: 0.9, thickness: 0.06, tessellation: 32 }, scene);
    const markerMat = new StandardMaterial('goal-marker-mat', scene);
    markerMat.diffuseColor = Color3.Black();
    markerMat.emissiveColor = new Color3(1, 0.25, 0.6);
    markerMat.disableLighting = true;
    marker.material = markerMat;
    marker.isPickable = false;
    marker.setEnabled(false);
    let path: Vector3[] = [];
    let arrive: Target | null = null;
    const stopWalk = () => { path = []; arrive = null; goalRef.current = null; marker.setEnabled(false); };
    const walkTo = (goal: Vector3, then: Target | null = null) => {
      const g = new Vector3(goal.x, 0, goal.z);
      path = venue.route ? venue.route(local.root.position.clone(), g) : [g];
      arrive = then;
      goalRef.current = g;
      marker.position = g.add(new Vector3(0, 0.05, 0));
      marker.setEnabled(true);
    };
    let down: { x: number; y: number; t: number } | null = null;
    const canvas = canvasRef.current!;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 450) return;
      const rect = canvas.getBoundingClientRect();
      const scale = engine.getRenderWidth() / rect.width;
      const ray = scene.createPickingRay((e.clientX - rect.left) * scale, (e.clientY - rect.top) * scale, Matrix.Identity(), camera);
      const dir = ray.direction.normalize();
      // People first: the nearest one whose body the ray passes close to.
      const along = (p: Vector3) => { const q = p.add(new Vector3(0, 1, 0)); const k = Vector3.Dot(q.subtract(ray.origin), dir); return { k, miss: Vector3.Distance(ray.origin.add(dir.scale(k)), q) }; };
      let person: { pos: Vector3; npc?: SceneNpc; k: number } | null = null;
      for (const a of npcActors) { const h = along(a.h.root.position); if (h.k > 0 && h.miss < 0.9 && (!person || h.k < person.k)) person = { pos: a.h.root.position, npc: a.npc, k: h.k }; }
      remotesRef.current.forEach((r) => { const h = along(r.h.root.position); if (h.k > 0 && h.miss < 0.9 && (!person || h.k < person.k)) person = { pos: r.h.root.position, k: h.k }; });
      const picked = venue.pick?.(ray.origin, dir, local.root.position) ?? null;
      const groundK = dir.y < -0.01 ? -ray.origin.y / dir.y : Infinity;
      if (person && person.k < Math.min(groundK, picked?.distance ?? Infinity) + 1) {
        const p = person as { pos: Vector3; npc?: SceneNpc };
        const toward = local.root.position.subtract(p.pos);
        toward.y = 0;
        walkTo(toward.length() > 1.3 ? p.pos.add(toward.normalize().scale(1.3)) : local.root.position, p.npc ? { type: 'npc', npc: p.npc } : null);
        return;
      }
      if (picked) {
        const portal = picked.portal ? venue.portals.find((x) => x.kind === picked.portal) : venue.portals.find((x) => Vector3.Distance(x.position, picked.point) < 2.5);
        walkTo(portal ? portal.position : picked.point, portal ? { type: 'portal', portal } : null);
        return;
      }
      if (venue.pick) return; // the city picked nothing: the sky
      if (groundK === Infinity) return; // the sky
      const hit = ray.origin.add(dir.scale(groundK));
      const b = venue.bounds;
      hit.x = Math.max(-b.x, Math.min(b.x, hit.x));
      hit.z = Math.max(-b.z, Math.min(b.z, hit.z));
      const portal = venue.portals.find((p) => Vector3.Distance(p.position, new Vector3(hit.x, 0, hit.z)) < 2.5);
      walkTo(portal ? portal.position : hit, portal ? { type: 'portal', portal } : null);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    walkToPortalRef.current = (kind) => {
      const portal = venue.portals.find((p) => p.kind === kind);
      if (portal) walkTo(portal.position, { type: 'portal', portal });
    };

    let lastSent = 0;
    let running = false;
    let stuck = 0;
    /** Turn smoothly towards a heading (shortest way round) instead of snapping. */
    const face = (heading: number, dt: number) => {
      const cur = local.root.rotation.y;
      const diff = Math.atan2(Math.sin(heading - cur), Math.cos(heading - cur));
      local.root.rotation.y = cur + diff * Math.min(1, dt * 12);
    };
    engine.runRenderLoop(() => {
      if (pausedRef.current) { keysRef.current.clear(); return; }
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      const t = performance.now() / 1000;
      venue.animate(t, dt);

      // Movement is relative to camera direction.
      const keys = keysRef.current;
      let fx = 0;
      let fz = 0;
      if (keys.has('w') || keys.has('arrowup')) fz += 1;
      if (keys.has('s') || keys.has('arrowdown')) fz -= 1;
      if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
      if (keys.has('d') || keys.has('arrowright')) fx += 1;
      fx += moveVecRef.current.x;
      fz += moveVecRef.current.z;
      const mag = Math.min(1, Math.hypot(fx, fz));
      const steering = mag > 0.06;
      // The chosen pace (Walk / Run / Sprint in the dock); Shift or the joystick rim bumps it one step.
      const base = SPEEDS.indexOf(speedRef.current);
      const boost = keys.has('shift') || moveVecRef.current.x ** 2 + moveVecRef.current.z ** 2 > 0.9 ? 1 : 0;
      const pace = SPEEDS[Math.min(SPEEDS.length - 1, base + boost)];
      const speed = SPEED_MPS[pace];
      let moving = false;
      if (steering && path.length) stopWalk();
      if (steering) {
        const forward = camera.getForwardRay().direction;
        const fwd = new Vector3(forward.x, 0, forward.z).normalize();
        const right = Vector3.Cross(Vector3.Up(), fwd).normalize();
        const dir = fwd.scale(fz).add(right.scale(fx)).normalize();
        const from = local.root.position.clone();
        const to = from.add(dir.scale(speed * mag * dt));
        const b = venue.bounds;
        to.x = Math.max(-b.x, Math.min(b.x, to.x));
        to.z = Math.max(-b.z, Math.min(b.z, to.z));
        local.root.position = venue.collide ? venue.collide(from, to) : to;
        face(Math.atan2(dir.x, dir.z), dt);
        moving = true;
      } else if (path.length) {
        const to = path[0].subtract(local.root.position);
        to.y = 0;
        const dist = to.length();
        if (dist < 0.3) {
          path.shift();
          if (!path.length) {
            const then = arrive;
            stopWalk();
            if (then) activate(then);
          }
        } else if (stuck > 30) stopWalk();
        else {
          // Long walks pick up the pace by themselves; the last few metres slow to a walk.
          const v = Math.min(dist / dt, path.length > 1 || dist > 12 ? Math.max(speed, SPEED_MPS.run) : speed);
          const dir = to.normalize();
          const from = local.root.position.clone();
          const next = from.add(dir.scale(v * dt));
          local.root.position = venue.collide ? venue.collide(from, next) : next;
          stuck = Vector3.Distance(from, local.root.position) < v * dt * 0.2 ? stuck + 1 : 0;
          face(Math.atan2(dir.x, dir.z), dt);
          moving = true;
          running = v > WALK_SPEED + 0.5;
        }
        marker.rotation.y += dt * 2;
        marker.scaling.setAll(1 + Math.sin(t * 6) * 0.08);
      }
      if (steering) running = pace !== 'walk';
      else if (!moving) running = false;
      local.animateWalk(moving, dt, running);

      // Camera: follow rigidly at the zoom the player picked. Moving the target in place matters: assigning
      // `camera.target` re-aims the camera from where it stands (recomputing alpha), which swung the view and
      // walked you in circles when strafing. (An automatic pull-in near buildings made the zoom pulse; removed.)
      camera.target.copyFrom(local.root.position).addInPlaceFromFloats(0, 1.2, 0);

      remotesRef.current.forEach((r) => {
        const before = r.h.root.position.clone();
        r.h.root.position = Vector3.Lerp(r.h.root.position, r.target, Math.min(1, dt * 10));
        r.h.root.rotation.y = r.rot;
        r.h.animateWalk(Vector3.Distance(before, r.h.root.position) > 0.002, dt);
      });

      // Nearest NPC or door in range becomes the interaction target.
      let closest: { t: Target; d: number } | null = null;
      for (const actor of npcActors) {
        actor.h.ring.rotation.y += dt * 1.5;
        actor.bubble.setEnabled(typingRef.current === actor.npc.id);
        if (typingRef.current === actor.npc.id) actor.bubble.position.y = actor.bubbleY + Math.sin(t * 6) * 0.04;
        const d = Vector3.Distance(local.root.position, actor.h.root.position);
        if (d < INTERACT_DISTANCE && (!closest || d < closest.d)) closest = { t: { type: 'npc', npc: actor.npc }, d };
        if (d < INTERACT_DISTANCE * 1.5) {
          actor.h.root.rotation.y = Math.atan2(local.root.position.x - actor.h.root.position.x, local.root.position.z - actor.h.root.position.z);
        }
      }
      for (const portal of venue.portals) {
        const d = Vector3.Distance(new Vector3(local.root.position.x, 0, local.root.position.z), portal.position);
        if (d < INTERACT_DISTANCE * 1.2 && (!closest || d < closest.d)) closest = { t: { type: 'portal', portal }, d };
      }
      const next = closest?.t ?? null;
      if (targetKey(next) !== targetKey(targetRef.current)) {
        targetRef.current = next;
        setTarget(next);
      }

      const now = performance.now();
      if (wsRef.current?.readyState === WebSocket.OPEN && now - lastSent > 80) {
        const p = local.root.position;
        wsRef.current.send(JSON.stringify({ type: 'move', x: p.x, y: p.y, z: p.z, rot_y: local.root.rotation.y }));
        lastSent = now;
      }
      scene.render();
    });

    // Portrait phones: fix the horizontal FOV so the world isn't a narrow slit behind the avatar.
    const fitFov = () => {
      const portrait = engine.getRenderWidth() < engine.getRenderHeight();
      camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
      camera.fov = portrait ? 0.95 : 0.8;
    };
    fitFov();
    const onResize = () => { engine.resize(); fitFov(); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      targetRef.current = null;
      setTarget(null);
      castRef.current = () => {};
      venueRef.current = null;
      engine.stopRenderLoop();
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueKind, lookKey, npcKey, player?.display_name]);

  // Realtime room connection.
  useEffect(() => {
    if (!room || !player || !joinTicket) return;
    remotesRef.current.forEach((r) => r.h.root.dispose());
    remotesRef.current.clear();
    pendingLooksRef.current.clear();

    const ws = new WebSocket(room.websocket_url);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        player_id: player.player_id,
        display_name: player.display_name,
        room_id: room.id,
        token: joinTicket,
        look,
      }));
    };
    ws.onmessage = (message) => {
      const event = JSON.parse(message.data) as ServerEvent;
      switch (event.type) {
        case 'welcome':
          pushChat({ who: 'system', text: `You entered ${room.display_name}`, system: true });
          event.roster.forEach((r) => {
            pendingLooksRef.current.set(r.player_id, { look: r.look, name: r.display_name });
            spawnRemote(r.player_id, r.display_name, r.look, new Vector3(r.x, r.y, r.z), r.rot_y);
          });
          break;
        case 'player_joined':
          if (event.player_id === player.player_id) break;
          pendingLooksRef.current.set(event.player_id, { look: event.look, name: event.display_name });
          spawnRemote(event.player_id, event.display_name, event.look, new Vector3(0, 0, -3), 0);
          pushChat({ who: 'system', text: `${event.display_name} arrived`, system: true });
          break;
        case 'player_left': {
          const r = remotesRef.current.get(event.player_id);
          if (r) pushChat({ who: 'system', text: `${r.name} left`, system: true });
          r?.h.root.dispose();
          remotesRef.current.delete(event.player_id);
          pendingLooksRef.current.delete(event.player_id);
          break;
        }
        case 'player_moved': {
          if (event.player_id === player.player_id) break;
          const r = remotesRef.current.get(event.player_id);
          if (r) {
            r.target = new Vector3(event.x, event.y, event.z);
            r.rot = event.rot_y;
          }
          break;
        }
        case 'chat':
          pushChat({ who: event.display_name, text: event.text });
          break;
        case 'error':
          pushChat({ who: 'system', text: event.message, system: true });
          break;
      }
    };
    ws.onclose = () => pushChat({ who: 'system', text: 'Connection lost. Head back to Lekki to rejoin', system: true });
    return () => {
      ws.onclose = null; // intentional room switch, not a disconnect
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, player?.player_id, joinTicket]);

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'chat', text }));
    setDraft('');
  }

  return <section className="stage">
    <canvas className="scene" ref={canvasRef} />
    <div className={`scene-veil ${loading ? 'on' : ''}`} aria-hidden={!loading}><span>Loading Lagos…</span></div>
    <div className="venue-badge">
      <span>{room?.kind === 'private_room' ? 'Private Scene' : room?.kind === 'city' ? 'Lagos' : 'Venue'}</span>
      <strong>{room ? room.display_name : 'Preview'}</strong>
    </div>
    <div className="controls-hint">Tap the ground or use WASD to move · Shift to run · tap a glowing prompt to interact</div>
    <div
      className="joystick"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        joyOriginRef.current = { x: e.clientX, y: e.clientY };
        setJoy({ x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        const o = joyOriginRef.current;
        if (!o) return;
        let dx = e.clientX - o.x;
        let dy = e.clientY - o.y;
        const d = Math.hypot(dx, dy);
        if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
        setJoy({ x: dx, y: dy });
        // Screen up = forward (+z), right = +x.
        moveVecRef.current = { x: dx / JOY_R, z: -dy / JOY_R };
      }}
      onPointerUp={(e) => { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); joyOriginRef.current = null; moveVecRef.current = { x: 0, z: 0 }; setJoy(null); }}
      onPointerCancel={() => { joyOriginRef.current = null; moveVecRef.current = { x: 0, z: 0 }; setJoy(null); }}
    >
      <span className="joystick-knob" style={{ transform: `translate(${joy?.x ?? 0}px, ${joy?.y ?? 0}px)` }} />
    </div>
    {target && <button className="interact-prompt" onClick={() => activate(target)}>
      <kbd>E</kbd> {target.type === 'npc' ? `Talk to ${target.npc.name}` : target.portal.kind === 'city' ? `Back to ${target.portal.label}` : `Enter ${target.portal.label}`}
    </button>}
    <div className="chat-panel">
      <div className="chat-log">
        {chat.length === 0 && <p className="chat-empty">Room chat appears here.</p>}
        {chat.map((line) => <p key={line.id} className={line.system ? 'chat-line system' : 'chat-line'}>
          {!line.system && <b>{line.who}</b>} {line.text}
        </p>)}
      </div>
      <form onSubmit={sendChat}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={room ? 'Say something…' : 'Join a room to chat'} disabled={!room} maxLength={280} />
      </form>
    </div>
    {children}
  </section>;
}
