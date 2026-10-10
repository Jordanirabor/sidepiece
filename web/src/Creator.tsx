import React, { useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Color3, Engine, HemisphericLight, PointLight, Scene, Vector3 } from '@babylonjs/core';
import { makeHumanoid } from './venue';
import { ACCESSORIES, BOTTOMS, HAIR_COLORS, Item, Look, matchCode, PARTNER_TRAITS, randomLook, STYLES, TOPS, findItem } from './look';
import { INTENTS, INTERESTS, INVITATION_TYPES, labelOf, MAX_BIO_CHARS, MAX_INTERESTS, Preferences, RELATIONSHIP_STYLES, SHOW_ME } from './prefs';

export type Identity = { alias: string; gender: string; likes: string[]; look: Look; match_code: string; bio: string; intent: string; preferences: Preferences };

const STEPS = 5;

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="switch-row">
    <span><b>{label}</b>{hint && <em>{hint}</em>}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  </label>;
}

const GENDERS = [
  { id: 'male', label: 'Male', icon: '♂' },
  { id: 'female', label: 'Female', icon: '♀' },
  { id: 'non_binary', label: 'Non-Binary', icon: '⚧' },
];

/**
 * 3D portrait of an avatar look (creator, profile cards, match moment). Rebuilt on change, which is cheap
 * for primitive avatars. `interactive=false` leaves pointer input to the page (e.g. swipeable cards).
 */
export function Preview({ look, framing, interactive = true }: { look: Look; framing: 'face' | 'full'; interactive?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const lookKey = JSON.stringify(look);
  useEffect(() => {
    if (!ref.current) return;
    const engine = new Engine(ref.current, true, { preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    scene.clearColor.set(0, 0, 0, 0);
    const target = framing === 'face' ? new Vector3(0, 1.78, 0) : new Vector3(0, 1.0, 0);
    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 2.1, framing === 'face' ? 1.1 : 3.6, target, scene);
    camera.minZ = 0.05; // default near plane (1 unit) clips the close-up face shot
    if (interactive) camera.attachControl(ref.current, true);
    camera.lowerRadiusLimit = camera.upperRadiusLimit = camera.radius;
    camera.upperBetaLimit = camera.lowerBetaLimit = camera.beta;
    new HemisphericLight('a', new Vector3(0, 1, 0.3), scene).intensity = 0.9;
    const rim = new PointLight('rim', new Vector3(-2, 3, -2), scene);
    rim.diffuse = new Color3(0.55, 0.3, 1);
    rim.intensity = 12;
    // Camera sits on +Z looking back at the origin, and avatars face +Z, so no rotation needed.
    const h = makeHumanoid(scene, 'preview', look, new Color3(0.55, 0.35, 1));
    let spin = 0;
    engine.runRenderLoop(() => {
      spin += engine.getDeltaTime() / 1000;
      if (framing === 'full') h.root.rotation.y = Math.sin(spin * 0.6) * 0.6;
      scene.render();
    });
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); scene.dispose(); engine.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, framing]);
  return <canvas ref={ref} className={`preview-canvas ${framing} ${interactive ? '' : 'passive'}`} />;
}

function FacePad({ label, axes, x, y, onChange }: { label: [string, string, string, string]; axes?: string; x: number; y: number; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
    onChange(Math.round(nx * 100) / 100, Math.round(ny * 100) / 100);
  };
  return <div className="face-pad-wrap" title={axes}>
    <span className="pad-label top">{label[0]}</span>
    <div
      ref={ref}
      className="face-pad"
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (e.buttons) update(e); }}
    >
      <i className="pad-dot" style={{ left: `${(x + 1) * 50}%`, top: `${(1 - (y + 1) / 2) * 100}%` }} />
    </div>
    <span className="pad-label bottom">{label[1]}</span>
    <span className="pad-label left">{label[2]}</span>
    <span className="pad-label right">{label[3]}</span>
  </div>;
}

function Carousel({ title, items, value, onChange }: { title: string; items: Item[]; value: string; onChange: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const visible = 4;
  const shown = items.slice(offset, offset + visible);
  return <div className="carousel">
    <h4>{title}</h4>
    <div className="carousel-row">
      <button className="arrow" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))}>‹</button>
      {shown.map((item) => <button key={item.id} title={item.label} className={`swatch ${value === item.id ? 'selected' : ''}`} onClick={() => onChange(item.id)}>
        <span className="swatch-icon" style={{ color: item.color }}>{item.icon}</span>
        <i style={{ background: item.color }} />
      </button>)}
      <button className="arrow" disabled={offset + visible >= items.length} onClick={() => setOffset((o) => Math.min(items.length - visible, o + 1))}>›</button>
    </div>
  </div>;
}

type Props = {
  initial: Identity;
  saving: boolean;
  onComplete: (identity: Identity) => void;
  /** Open at a given panel (e.g. 4 = preferences) when editing from Profile. */
  initialStep?: number;
  /** 'edit' = opened from Profile: final button saves and returns, and Cancel is shown. */
  mode?: 'onboarding' | 'edit';
  onCancel?: () => void;
};

export function Creator({ initial, saving, onComplete, initialStep = 1, mode = 'onboarding', onCancel }: Props) {
  const [step, setStep] = useState(initialStep);
  const [bio, setBio] = useState(initial.bio);
  const [intent, setIntent] = useState(initial.intent || 'socialize');
  const [prefs, setPrefs] = useState<Preferences>(initial.preferences);
  const setPref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPrefs((p) => ({ ...p, [key]: value }));
  const toggleIn = (key: 'interests' | 'boundaries' | 'show_me', id: string, max = 99) => setPrefs((p) => {
    const list = p[key];
    return { ...p, [key]: list.includes(id) ? list.filter((x) => x !== id) : list.length >= max ? list : [...list, id] };
  });
  const [alias, setAlias] = useState(initial.alias);
  const [gender, setGender] = useState(initial.gender);
  const [likes, setLikes] = useState<string[]>(initial.likes);
  const [look, setLook] = useState<Look>(initial.look);
  const set = <K extends keyof Look>(key: K, value: Look[K]) => setLook((l) => ({ ...l, [key]: value }));
  const code = matchCode(`${alias}:${gender}:${JSON.stringify(look)}`);

  const chooseGender = (g: string) => {
    setGender(g);
    setLook((l) => ({ ...l, gender: g, hair_length: g === 'female' && l.hair_length < 0.4 ? 0.75 : l.hair_length }));
  };
  const toggleLike = (id: string) => setLikes((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : ls.length >= 3 ? ls : [...ls, id]));
  const chooseStyle = (id: string) => {
    const s = STYLES.find((x) => x.id === id)!;
    setLook((l) => ({ ...l, style: id, top: s.outfit.top, bottom: gender === 'male' && s.id === 'glam' ? 'trousers_black' : s.outfit.bottom, accessory: s.outfit.accessory }));
  };

  const step1Ok = alias.trim().length >= 2 && likes.length > 0;
  const canNext = step !== 1 || step1Ok;
  const canFinish = step1Ok;

  return <div className="creator">
    <div className="creator-card">
      {mode === 'edit' && onCancel && <button className="creator-cancel icon-btn" aria-label="Cancel editing" onClick={onCancel}>×</button>}
      {step === 1 && <>
        <h2>Create your profile</h2>
        <p className="creator-sub">Create your identity.</p>
        <div className="avatar-badge">👤</div>
        <label>Alias name</label>
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g., Jay123" maxLength={24} />
        <label>Gender</label>
        <div className="gender-row">
          {GENDERS.map((g) => <button key={g.id} className={`gender ${gender === g.id ? 'selected' : ''}`} onClick={() => chooseGender(g.id)}>
            <span>{g.icon}</span>{g.label}
          </button>)}
        </div>
        <label>Likes in a partner <em>(pick up to 3)</em></label>
        <div className="trait-row">
          {PARTNER_TRAITS.map((t) => <button key={t.id} className={`trait ${likes.includes(t.id) ? 'selected' : ''}`} onClick={() => toggleLike(t.id)}>[{t.id} {t.icon}]</button>)}
        </div>
      </>}

      {step === 2 && <>
        <h2>Build your character</h2>
        <p className="creator-sub">Craft your look.</p>
        <div className="preview-box face"><Preview look={look} framing="face" /></div>
        <div className="build-grid">
          <div>
            <label>Hair</label>
            <input type="range" min={0} max={1} step={0.01} value={look.hair_length} onChange={(e) => set('hair_length', +e.target.value)} />
            <div className="range-legend"><span>short</span><span>long</span></div>
          </div>
          <div className="hair-colors">
            {HAIR_COLORS.map((c) => <button key={c} aria-label={c} className={look.hair_color === c ? 'selected' : ''} style={{ background: c }} onClick={() => set('hair_color', c)} />)}
          </div>
        </div>
        <label>Skin tone</label>
        <input className="skin-slider" type="range" min={0} max={1} step={0.01} value={look.skin_tone} onChange={(e) => set('skin_tone', +e.target.value)} />
        <label>Facial structure</label>
        <div className="face-pads">
          <FacePad label={['Long', 'Short', 'Narrow', 'Wide']} x={look.face[0]} y={look.face[1]} onChange={(x, y) => set('face', [x, y, look.face[2], look.face[3]])} />
          <FacePad label={['Strong jaw', 'Soft jaw', 'Flat', 'Defined']} x={look.face[2]} y={look.face[3]} onChange={(x, y) => set('face', [look.face[0], look.face[1], x, y])} />
        </div>
        <label>Body type</label>
        <input type="range" min={0} max={1} step={0.01} value={look.body_type} onChange={(e) => set('body_type', +e.target.value)} />
        <button className="randomize" onClick={() => setLook(randomLook(gender))}>Randomize unique look 🎲</button>
      </>}

      {step === 3 && <>
        <h2>Select your outfit</h2>
        <p className="creator-sub">Dress the part.</p>
        <div className="preview-box full"><Preview look={look} framing="full" /></div>
        <Carousel title="Top" items={TOPS} value={look.top} onChange={(id) => set('top', id)} />
        <Carousel title="Bottom" items={BOTTOMS} value={look.bottom} onChange={(id) => set('bottom', id)} />
        <Carousel title="Accessories" items={ACCESSORIES} value={look.accessory} onChange={(id) => set('accessory', id)} />
        <div className="carousel">
          <h4>Style</h4>
          <div className="style-row">
            {STYLES.map((s) => <button key={s.id} className={`style ${look.style === s.id ? 'selected' : ''}`} onClick={() => chooseStyle(s.id)}><span>{s.icon}</span>{s.label}</button>)}
          </div>
        </div>
      </>}

      {step === 4 && <>
        <h2>Your preferences</h2>
        <p className="creator-sub">Who and what you're here for.</p>
        <label>I'm here to</label>
        <div className="trait-row">
          {INTENTS.map((i) => <button key={i.id} className={`trait ${intent === i.id ? 'selected' : ''}`} onClick={() => setIntent(i.id)}>{i.icon} {i.label}</button>)}
        </div>
        <label>Relationship style</label>
        <div className="trait-row">
          {RELATIONSHIP_STYLES.map((r) => <button key={r.id} className={`trait ${prefs.relationship_style === r.id ? 'selected' : ''}`} onClick={() => setPref('relationship_style', prefs.relationship_style === r.id ? '' : r.id)}>{r.label}</button>)}
        </div>
        <Toggle label="Show on my profile" checked={prefs.public_relationship_style} onChange={(v) => setPref('public_relationship_style', v)} />
        <label>Interests <em>(up to {MAX_INTERESTS})</em></label>
        <div className="trait-row">
          {INTERESTS.map((i) => <button key={i} className={`trait ${prefs.interests.includes(i) ? 'selected' : ''}`} onClick={() => toggleIn('interests', i, MAX_INTERESTS)}>{i}</button>)}
        </div>
        <Toggle label="Show on my profile" checked={prefs.public_interests} onChange={(v) => setPref('public_interests', v)} />
        <label>Boundaries <em>(never invite me to)</em></label>
        <div className="trait-row">
          {INVITATION_TYPES.map((b) => <button key={b.id} className={`trait boundary ${prefs.boundaries.includes(b.id) ? 'selected' : ''}`} onClick={() => toggleIn('boundaries', b.id)}>{prefs.boundaries.includes(b.id) ? '⛔ ' : ''}{b.label}</button>)}
        </div>
        <p className="creator-hint">Nobody can send you these. You can still decline anything else, any time.</p>
        <label>Show me <em>(none selected = everyone)</em></label>
        <div className="trait-row">
          {SHOW_ME.map((g) => <button key={g.id} className={`trait ${prefs.show_me.includes(g.id) ? 'selected' : ''}`} onClick={() => toggleIn('show_me', g.id)}>{g.label}</button>)}
        </div>
        <Toggle label="Discoverable" hint="Appear in other players' Nearby lists" checked={prefs.discoverable} onChange={(v) => setPref('discoverable', v)} />
      </>}

      {step === 5 && <>
        <h2>Identity complete</h2>
        <p className="creator-sub">Final review.</p>
        <div className="review-card">
          <div className="review-visuals">
            <div className="preview-box face small"><Preview look={look} framing="face" /></div>
            <div className="preview-box full small"><Preview look={look} framing="full" /></div>
          </div>
          <dl>
            <dt>Alias:</dt><dd>[{alias.trim()}]</dd>
            <dt>Gender:</dt><dd>[{GENDERS.find((g) => g.id === gender)?.label}]</dd>
            <dt>Likes:</dt><dd>[{likes.map((l) => `${l} ${PARTNER_TRAITS.find((t) => t.id === l)?.icon ?? ''}`).join(', ')}]</dd>
            <dt>Style:</dt><dd>[{STYLES.find((s) => s.id === look.style)?.label}] · {findItem(TOPS, look.top).label}, {findItem(BOTTOMS, look.bottom).label}</dd>
          </dl>
          <div className="match-code">{code} (unique match)</div>
          <p className="checks">Step 1 process complete: <b>✔ Looks</b> <b>✔ Outfit</b> <b>✔ Name</b> <b>✔ Preferences</b></p>
        </div>
        <div className="public-preview">
          <h4>How others see you</h4>
          <textarea value={bio} maxLength={MAX_BIO_CHARS} rows={2} placeholder="Add a short bio (optional)" onChange={(e) => setBio(e.target.value)} />
          <div className="bio-count">{bio.length}/{MAX_BIO_CHARS}</div>
          <div className="pill-row">
            {prefs.public_relationship_style && prefs.relationship_style && <span className="pill">{labelOf(RELATIONSHIP_STYLES, prefs.relationship_style)}</span>}
            {prefs.public_interests && prefs.interests.map((i) => <span key={i} className="pill">{i}</span>)}
            {!(prefs.public_interests && prefs.interests.length) && !(prefs.public_relationship_style && prefs.relationship_style) && <span className="pill muted">No public details</span>}
          </div>
          <p className="visibility">{prefs.discoverable ? '👁 Visible in Nearby lists' : '🙈 Hidden from Nearby lists'} · intent and boundaries stay private</p>
          <div className="preview-edit">
            <button className="ghost" onClick={() => setStep(1)}>[ Edit character ]</button>
            <button className="ghost" onClick={() => setStep(4)}>[ Edit preferences ]</button>
          </div>
        </div>
        <button className="enter-city" disabled={saving || !canFinish} onClick={() => onComplete({ alias: alias.trim(), gender, likes, look, match_code: code, bio: bio.trim(), intent, preferences: prefs })}>
          {saving ? 'Saving…' : mode === 'edit' ? '[ Save changes → ]' : '[ Enter the city → ]'}
        </button>
      </>}

      <div className="creator-nav">
        {step > 1 ? <button className="ghost" onClick={() => setStep((s) => s - 1)}>[ Back ]</button> : <span />}
        {step < STEPS && <button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>{step === STEPS - 1 ? '[ Review ]' : '[ Next ]'}</button>}
      </div>
      <div className="creator-step">({step}/{STEPS})</div>
    </div>
  </div>;
}
