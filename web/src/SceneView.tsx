import React, { useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Color3, Engine, Scene, Vector3 } from '@babylonjs/core';
import { buildVenue, Humanoid, makeHumanoid, makeLabel, Portal } from './venue';
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
  children?: React.ReactNode;
};

export function SceneView({ room, player, joinTicket, look, npcs, typingNpcId, onInteractNpc, onPortal, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const remotesRef = useRef<Map<string, Remote>>(new Map());
  const pendingLooksRef = useRef<Map<string, { look: Look; name: string }>>(new Map());
  const keysRef = useRef<Set<string>>(new Set());
  const targetRef = useRef<Target | null>(null);
  const interactRef = useRef(onInteractNpc);
  const portalRef = useRef(onPortal);
  const typingRef = useRef<string | undefined>(typingNpcId);
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
    const h = makeHumanoid(scene, `remote-${id}`, remoteLook, new Color3(0, 0.8, 1), name, '#8defff');
    h.root.position = pos.clone();
    h.root.rotation.y = rot;
    remotesRef.current.set(id, { h, target: pos.clone(), rot, name });
  };

  // Build the 3D venue. Rebuilt when venue type, avatar look, or NPC set changes.
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);
    sceneRef.current = scene;
    const venue = buildVenue(scene, venueKind);

    // Third-person, slightly over the shoulder, behind the player (player spawns facing +Z).
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2.55, 7.5, venue.playerSpawn.add(new Vector3(0, 1.2, 0)), scene);
    camera.minZ = 0.1;
    camera.attachControl(canvasRef.current, true);
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 18;
    camera.upperBetaLimit = Math.PI / 2.1;
    camera.lowerBetaLimit = Math.PI / 5;

    const local = makeHumanoid(scene, 'you', look, new Color3(1, 0.1, 0.55), player?.display_name ?? 'You', '#ffc0df');
    local.root.position = venue.playerSpawn.clone();
    // Test/debug hook (read-only snapshot); used by automated UI checks.
    (window as unknown as { __sp?: unknown }).__sp = { pos: () => local.root.position.asArray(), portals: venue.portals.map((p) => ({ kind: p.kind, pos: p.position.asArray() })), venue: venueKind };

    const npcActors = npcs.map((npc) => {
      const h = makeHumanoid(scene, `npc-${npc.id}`, npc.look, new Color3(1, 0.05, 0.6), npc.name, '#ffe08a');
      h.root.position = new Vector3(npc.x, 0, npc.z);
      h.root.rotation.y = Math.PI;
      const bubble = makeLabel(scene, `npc-${npc.id}-typing`, '•••', { width: 0.6, height: 0.3, font: 64 });
      bubble.position.y = 2.75;
      bubble.parent = h.root;
      bubble.setEnabled(false);
      return { npc, h, bubble };
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

    let lastSent = 0;
    engine.runRenderLoop(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      const t = performance.now() / 1000;
      venue.animate(t);

      // Movement is relative to camera direction.
      const keys = keysRef.current;
      let fx = 0;
      let fz = 0;
      if (keys.has('w') || keys.has('arrowup')) fz += 1;
      if (keys.has('s') || keys.has('arrowdown')) fz -= 1;
      if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
      if (keys.has('d') || keys.has('arrowright')) fx += 1;
      const moving = fx !== 0 || fz !== 0;
      if (moving) {
        const forward = camera.getForwardRay().direction;
        const fwd = new Vector3(forward.x, 0, forward.z).normalize();
        const right = Vector3.Cross(Vector3.Up(), fwd).normalize();
        const dir = fwd.scale(fz).add(right.scale(fx)).normalize();
        local.root.position.addInPlace(dir.scale(3.2 * dt));
        local.root.rotation.y = Math.atan2(dir.x, dir.z);
        const b = venue.bounds;
        local.root.position.x = Math.max(-b.x, Math.min(b.x, local.root.position.x));
        local.root.position.z = Math.max(-b.z, Math.min(b.z, local.root.position.z));
      }
      local.animateWalk(moving, dt);
      camera.target = local.root.position.add(new Vector3(0, 1.2, 0));

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
        if (typingRef.current === actor.npc.id) actor.bubble.position.y = 2.75 + Math.sin(t * 6) * 0.04;
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

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      targetRef.current = null;
      setTarget(null);
      scene.dispose();
      engine.dispose();
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
    ws.onclose = () => pushChat({ who: 'system', text: 'Connection lost — rejoin from the city', system: true });
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
    <div className="venue-badge">
      <span>{room?.kind === 'private_room' ? 'Private Scene' : room?.kind === 'city' ? 'Downtown' : 'Venue'}</span>
      <strong>{room ? room.display_name : 'Preview'}</strong>
    </div>
    <div className="controls-hint">WASD to move · drag to look · E to interact</div>
    {target && <button className="interact-prompt" onClick={() => activate(target)}>
      <kbd>E</kbd> {target.type === 'npc' ? `Talk to ${target.npc.name}` : target.portal.kind === 'city' ? 'Back to the city' : `Enter ${target.portal.label}`}
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
