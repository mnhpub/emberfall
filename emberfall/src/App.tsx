import FerryPanel from "./components/FerryPanel";
import AuthorityPanel from './components/AuthorityPanel';
import SharedRoomPanel from './components/SharedRoomPanel';
import SharedScene from './game/SharedScene';
import MusicToggle from './audio/MusicToggle';
import { DebugTestPlayer } from './debug/DebugTestPlayer';
import { AuthorityClient } from '../packages/authority/client';
import type { AuthorityMode, CustodyIntent, Frame, Intent, SharedView } from '../packages/authority/protocol';
import { isColonyIntent, type ColonyIntent } from '../packages/colonies';
import FerryModel from "./game/FerryModel";
import { FERRY, localToWorld } from "../packages/vessels";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Line, OrthographicCamera } from "@react-three/drei";
import { ANVIL, starPosition, visibleStars } from "../packages/world/sky";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  initialState,
  transition,
  restore,
  waterField,
  NODE_POSITIONS,
  type State,
  type Command as GameCommand,
} from "../packages/game-core";

import DockLedger from "./components/DockLedger";
import { DOCKS, usage } from "../packages/logistics";
import Workshop, { ProfessionPicker } from "./components/Workshop";
import PlacedObjects from "./game/PlacedObjects";
import { SALVAGE } from "../packages/game-core/catalog";
import { equipped } from "../packages/game-core/objects";

const SAVE_KEY = "emberfall.maritime.v1";
type Command=GameCommand|CustodyIntent|ColonyIntent;
type RoomView={actor:string;view:SharedView};
function load(): State {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? restore(JSON.parse(raw)) : initialState();
  } catch {
    return {
      ...initialState(),
      message: "Save unavailable or incompatible. Started a new session.",
    };
  }
}
export default function App() {
  const [state, setState] = useState<State>(load);
  const simulation = useRef<State>(state);
  const [storage, setStorage] = useState("Local save ready");
  // Recent game messages, so a newer message never hides the reason for an earlier one.
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    if (!state.message) return;
    setLog((prev) => (prev.at(-1) === state.message ? prev : [...prev, state.message].slice(-8)));
  }, [state.message]);
  const authority = useRef<AuthorityClient | null>(null);
  const queuedAction = useRef<Intent | null>(null);
  const localBackup = useRef<State | null>(null);
  const frame = useRef<Frame>({type:'frame',dx:0,dz:0,turn:0,throttle:0});
  const [online,setOnline] = useState(false);
  const [roomView,setRoomView]=useState<RoomView|null>(null);
  const leaveAuthority = useCallback(() => {
    authority.current?.stop(); authority.current=null;
    queuedAction.current=null;
    setRoomView(null);
    if(localBackup.current) {simulation.current=localBackup.current;setState(localBackup.current);localBackup.current=null;}
    setOnline(false);setStorage('Local save restored');
  },[]);
  const connectAuthority = async (room:string,token:string,mode:AuthorityMode) => {
    localBackup.current=structuredClone(simulation.current);
    // Preserve offline progress before freezing the local simulation.
    try {localStorage.setItem(SAVE_KEY,JSON.stringify(localBackup.current));}
    catch {localBackup.current=null;throw new Error('Cannot preserve local save; connection cancelled');}
    const client=new AuthorityClient(room,token,localStorage,snapshot=>{simulation.current=snapshot.state;setState(snapshot.state);setRoomView(snapshot.shared?{actor:snapshot.actor,view:snapshot.shared}:null);},setStorage,undefined,mode);
    authority.current=client;setOnline(true);setStorage('Connecting to authority…');
    try {await client.connect();} catch(e) {if(authority.current===client) leaveAuthority();throw e;}
  };
  const authorityFrame = useCallback((intent:Frame) => {frame.current=intent;return authority.current!==null;},[]);
  useEffect(()=>{
    const timer=setInterval(()=>{const client=authority.current;if(!client)return;if(client.pending) void client.flush();else if(queuedAction.current){const intent=queuedAction.current;queuedAction.current=null;void client.send(intent);}else void client.send(frame.current);},100);
    return ()=>{clearInterval(timer);authority.current?.stop();};
  },[]);
  const [panel, setPanel] = useState(true);
  const [workshop, setWorkshop] = useState(false);
  const [dockLedger, setDockLedger] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [overview, setOverview] = useState(false);
  // Isometric applies only inside the vessel overview; the follow camera stays perspective.
  const [isometric, setIsometric] = useState(false);
  const [asset, setAsset] = useState<string>();
  const [report, setReport] = useState<{
    triangles: number;
    previewUrl: string;
    repairs: string[];
  }>();
  const [upload, setUpload] = useState("DXF preview: start make asset-server");
  const uploadFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setUpload("Rejected: maximum 2 MiB");
      return;
    }
    setUpload("Inspecting geometry…");
    setReport(undefined);
    try {
      const response = await fetch("/asset-api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/dxf" },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReport(result);
      setUpload(
        `${result.triangles} triangles · ${result.repairs.length} repairs · review ready`,
      );
    } catch (e) {
      setUpload(e instanceof Error ? e.message : "Upload failed");
    }
  };
  const dispatch = useCallback((c: Command) => {
    if(authority.current) {
      if(['tick','move','ferry-step'].includes(c.type)) return;
      const client=authority.current;
      if(client.pending || client.busy) {
        if(client.pending?.command.type==='frame' && !queuedAction.current) {queuedAction.current=c as Intent;setStorage('Action queued after movement');}
        else setStorage('Wait for the pending action to finish');
        return;
      }
      void client.send(c as Intent);return;
    }
    if (
      c.type !== "tick" &&
      document.activeElement instanceof HTMLButtonElement
    )
      document.activeElement.blur();
    if(c.type==='cargo-offer' || c.type==='cargo-accept' || c.type==='cargo-cancel' || isColonyIntent(c)) {setStorage('Colony trade requires a shared colony room');return;}
    const previous = simulation.current;
    let next = transition(previous, c);
    if (
      c.type === "cargo" &&
      next.logistics.revision !== previous.logistics.revision
    ) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(next));
        setStorage("Cargo ledger saved on this device");
      } catch {
        next = {
          ...previous,
          message:
            "Cargo not committed: device storage is unavailable or full.",
        };
        setStorage("Cargo commit failed");
      }
    }
    simulation.current = next;
    setState(next);
  }, []);
  // Aboard the ferry the panel mirrors the live position about five times a second, so the helm distance stays current while walking.
  useEffect(() => {
    if (state.mode !== "ferry") return;
    const live = setInterval(() => setState(simulation.current), 200);
    return () => clearInterval(live);
  }, [state.mode]);
  useEffect(() => {
    const tick = setInterval(() => dispatch({ type: "tick" }), 1000);
    const save = () => {
      if(authority.current) return;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(simulation.current));
        setStorage("Saved on this device");
      } catch {
        setStorage("Save failed: browser storage unavailable");
      }
    };
    const autosave = setInterval(save, 3000);
    const visibility = () => {
      if (document.hidden) save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", visibility);
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setWorkshop(false);
        setDockLedger(false);
        setPlacing(null);
        return;
      }
      if (
        e.repeat ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
      )
        return;
      if (e.code === "Space" && e.target instanceof HTMLButtonElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        dispatch({ type: "attack" });
      }
      if (e.code === "KeyH") dispatch({ type: "ferry-helm" });
      if (e.code === "KeyE") dispatch({ type: "board" });
      if (e.code === "KeyI") {
        setDockLedger(false);
        setWorkshop((p) => !p);
      }
      if (e.code === "KeyL") {
        setWorkshop(false);
        setDockLedger((p) => !p);
      }
      if (e.code === "Escape") {
        setWorkshop(false);
        setDockLedger(false);
        setPlacing(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(tick);
      clearInterval(autosave);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", key);
    };
  }, [dispatch]);
  const action = (label: string, c: Command) => (
    <button onClick={() => dispatch(c)}>{label}</button>
  );
  return (
    <main className="maritime">
      <Canvas
        shadows
        camera={{ position: [0, 24, 28], fov: 50 }}
        onCreated={({ camera }) => {
          const s = simulation.current;
          camera.position.set(
            s.position.x + (s.mode === "ferry" ? 15 : 0),
            s.mode === "ferry" ? 24 : 19,
            s.position.z + (s.mode === "ferry" ? 28 : 20),
          );
          camera.lookAt(
            s.position.x,
            s.mode === "ferry" ? 6 : 0,
            s.position.z - 3,
          );
        }}
      >
        <Scene
          simulation={simulation}
          dispatch={dispatch}
          blocked={!state.profession || workshop || dockLedger}
          overview={overview}
          isometric={isometric}
          authorityFrame={authorityFrame}
          shared={roomView}
          place={
            placing
              ? (x, z) => {
                  const id = placing;
                  dispatch({ type: "place", instanceId: id, x, z });
                  if (
                    simulation.current.placed.some((p) => p.instanceId === id)
                  )
                    setPlacing(null);
                }
              : undefined
          }
        />
        {asset && (
          <Suspense fallback={null}>
            <ImportedAsset url={asset} />
          </Suspense>
        )}
      </Canvas>
      <header className="sea-header">
        <div>
          <h1>EMBERFALL</h1>
          <small>THE GOLDEN WATERSHED · CONTRIBUTION PREVIEW 0.9</small>
        </div>
        <div className="sea-header-status">
          <span>{online?(roomView?'SHARED COLONY ROOM':'PRIVATE ONLINE EXPEDITION'):'LOCAL SIMULATION'} · {storage}</span>
          <MusicToggle />
          {import.meta.env.DEV && (
            <DebugTestPlayer
              saveKey={SAVE_KEY}
              onSwitch={(next) => {
                simulation.current = next;
                setState(next);
              }}
            />
          )}
        </div>
      </header>
      <aside className="sea-panel">
        <h2>
          {state.mode === "ferry"
            ? "Aboard Endurance"
            : state.mode === "ship"
              ? "Aboard the Wayfarer"
              : "The Wanderer"}
        </h2>
        <p>
          Skiff hull {state.ship.hull}% · Relic {state.ship.cargo.relic} · River
          field {waterField(state, state.position.z)}
        </p>
        <p>
          Timber {state.inventory.wood} · Granite {state.inventory.stone} · Gold{" "}
          {state.inventory.gold}
        </p>
        <div className="sea-actions">
          {action("E · Board / disembark", { type: "board" })}
          {action("Repair · 2 timber", { type: "repair" })}
          {action("Salvage wreck", { type: "recover" })}
          {action("Deliver relic", { type: "deliver" })}
          {action("Space · Defend", { type: "attack" })}
          <button
            onClick={() => {
              setDockLedger(false);
              setWorkshop(true);
            }}
          >
            I · Kit, equipment & crafting
          </button>
          <button
            onClick={() => {
              setWorkshop(false);
              setDockLedger(true);
            }}
          >
            L · Dock ledger & cargo
          </button>
        </div>
        <p>
          Skiff freight {usage(state.logistics, "ship")}/24 · Contribution{" "}
          {state.logistics.reputation}
        </p>
        <h3>Expedition</h3>
        <p>
          {state.delivered
            ? "✓ Relic delivered; settlers arrived"
            : state.recovered
              ? "Return south to your home dock"
              : "Sail north past the beast to the wreck"}
        </p>
        <button onClick={() => setPanel(!panel)}>
          {panel ? "Hide" : "Show"} colony ledger
        </button>
        {panel &&
          state.colonies.map((c) => (
            <section key={c.id}>
              <h3>{c.name}</h3>
              <p>
                {c.population} settlers · Food {c.stock.food}
                <br />
                Pyramid {c.pyramid}/3 · Apex {c.active ? "active" : "absent"}
              </p>
              {c.id === "haven" &&
                action(
                  c.pyramid < 3
                    ? "Build tier · 3 granite"
                    : "Fit apex · 1 gold",
                  { type: "build" },
                )}
            </section>
          ))}
      </aside>
      <aside className="sea-guide">
        <AuthorityPanel active={online} connect={connectAuthority} leave={leaveAuthority} reconcile={async()=>{queuedAction.current=null;await authority.current?.useServerProgress();}} />
        {roomView && <SharedRoomPanel actor={roomView.actor} view={roomView.view} state={state} dispatch={dispatch} />}
        <FerryPanel
          sharedFreight={roomView?.view.freight.ferry}
          state={state}
          dispatch={dispatch}
          overview={overview}
          toggleOverview={() => setOverview((v) => !v)}
          isometric={isometric}
          toggleIsometric={() => setIsometric((v) => !v)}
        />
        <h3>DXF inspection</h3>
        <input
          aria-label="Upload a DXF panel"
          type="file"
          accept=".dxf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
          }}
        />
        <p role="status">{upload}</p>
        {report && (
          <button onClick={() => setAsset(report.previewUrl)}>
            Approve local preview at dock
          </button>
        )}
        <h3>Land trades</h3>
        <p>
          Gray box near dock: bolts
          <br />
          Tan bundle west: canvas
          <br />
          Blue-gray pile north-west: metal
          <br />
          Open western yard: x −18, z 10
        </p>
        <h3>Explore the river</h3>
        {state.mode==='foot' && Object.entries(NODE_POSITIONS).filter(([,n])=>Math.hypot(n.x-state.position.x,n.z-state.position.z)<=4).map(([id,n])=><button key={id} onClick={()=>dispatch({type:'gather',id})}>Gather {n.kind}</button>)}
        <p>
          WASD / arrows: move
          <br />
          Click resources nearby to gather
          <br />
          E: board at dock / land at bank
          <br />
          Space: defend near beast
          <br />
          I: inventory & workshop
          <br />
          Escape: close / cancel placement
        </p>
        <p>
          North ↑ Aurum colony & wreck
          <br />
          South ↓ Haven & open sea
        </p>
        <small>
          Pyramid water field is fictional. Sailing and colony economics are
          simplified. Cloud multiplayer is not connected.
        </small>
        <p>
          <button
            onClick={() => {
              if (window.confirm("Reset this device’s expedition?")) {
                simulation.current = initialState();
                setState(simulation.current);
                try {
                  localStorage.removeItem(SAVE_KEY);
                } catch {
                  setStorage("Storage unavailable");
                }
              }
            }}
          >
            New expedition
          </button>
        </p>
      </aside>
      {dockLedger && (
        <DockLedger
          shared={roomView?.view}
          state={state}
          dispatch={dispatch}
          close={() => setDockLedger(false)}
        />
      )}
      {workshop && (
        <Workshop
          state={state}
          dispatch={dispatch}
          close={() => setWorkshop(false)}
          place={(id) => {
            setPlacing(id);
            setWorkshop(false);
          }}
        />
      )}
      {placing && (
        <div className="placement-hint">
          Click clear land within six metres to place. Equip a hammer first.
          Escape cancels.
        </div>
      )}
      {!state.profession && (
        <ProfessionPicker
          choose={(profession) =>
            dispatch({ type: "choose-profession", profession })
          }
        />
      )}
      <ol className="message-history" aria-label="Earlier messages">
        {log
          .filter((m) => m !== state.message)
          .slice(-3)
          .reverse()
          .map((m, i) => (
            <li key={i}>{m}</li>
          ))}
      </ol>
      <footer className="sea-message" role="status">
        {state.message}
      </footer>
    </main>
  );
}
function Pyramid({
  x,
  z,
  tiers,
  active,
}: {
  x: number;
  z: number;
  tiers: number;
  active: boolean;
}) {
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: tiers }, (_, i) => (
        <mesh key={i} position={[0, 0.45 + i * 0.8, 0]} castShadow>
          <boxGeometry args={[4 - i, 0.8, 4 - i]} />
          <meshStandardMaterial color="#928d83" roughness={0.9} />
        </mesh>
      ))}
      {active && (
        <mesh position={[0, 3, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[1.15, 1.4, 4]} />
          <meshStandardMaterial
            color="#edc45c"
            metalness={0.8}
            roughness={0.24}
            emissive="#b27b18"
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
    </group>
  );
}
// Classic isometric: pitch atan(1/sqrt2) ≈ 35.26°, yaw 45°. Equal x, y, z offsets give that angle.
const ISO_OFFSET = 6000 / Math.sqrt(3); // camera distance, far enough back to see the whole world
// Greece lies on the far side of the lodestone from Ember Haven. Players sail past the rock and steer by the compass,
// and Greece is the meeting place for alliances. The exact coordinates are a placeholder until the river design is settled.
export const GREECE_PLANNED = { x: 1800, z: -2400 };

// The isometric map frames the whole known world: Haven, the Aurum dock, the lodestone at the origin and the ferry pier.
const WORLD_POINTS = [
  { x: -10, z: 13 }, // Ember Haven
  { x: 7, z: -19 }, // Aurum river dock
  { x: 0, z: 0 }, // lodestone
  { x: 106, z: 180 }, // ferry pier
  { x: GREECE_PLANNED.x, z: GREECE_PLANNED.z }, // planned Greek colony
];
const WORLD_CENTRE = {
  x: (Math.min(...WORLD_POINTS.map((p) => p.x)) + Math.max(...WORLD_POINTS.map((p) => p.x))) / 2,
  z: (Math.min(...WORLD_POINTS.map((p) => p.z)) + Math.max(...WORLD_POINTS.map((p) => p.z))) / 2,
};
// Frame the whole span of the known world, with a margin.
const ISO_VIEW_HEIGHT = Math.ceil(
  Math.max(
    Math.max(...WORLD_POINTS.map((p) => p.x)) - Math.min(...WORLD_POINTS.map((p) => p.x)),
    Math.max(...WORLD_POINTS.map((p) => p.z)) - Math.min(...WORLD_POINTS.map((p) => p.z)),
  ) * 1.3,
); // world units visible from top to bottom of the canvas

// The Anvil, projected onto a sky dome above the water. Stars ignore fog so they stay bright at the horizon.
function Constellation() {
  const radius = 900;
  const stars = visibleStars();
  const at = (name: string) => {
    const p = starPosition(stars.find((s) => s.name === name)!, radius);
    return [p.x, p.y, p.z] as [number, number, number];
  };
  return (
    <group>
      {stars.map((star) => {
        const [x, y, z] = at(star.name);
        return (
          <mesh key={star.name} position={[x, y, z]}>
            <sphereGeometry args={[star.magnitude * 1.5, 8, 8]} />
            <meshBasicMaterial color="#fff6d0" fog={false} />
          </mesh>
        );
      })}
      {ANVIL.links.map(([a, b]) => (
        <Line
          key={`${a}-${b}`}
          points={[at(ANVIL.stars[a].name), at(ANVIL.stars[b].name)]}
          color="#9fc4d6"
          lineWidth={1}
          transparent
          opacity={0.6}
          fog={false}
        />
      ))}
    </group>
  );
}

// The lodestone pillar at the origin and the planned Greek colony marker.
// On the world map the markers are scaled up to read at world scale. On the ground they keep their local size: the
// origin is only about 16 m from Ember Haven, so a full-size pillar would fill the view.
function WorldMarkers({ scale }: { scale: number }) {
  return (
    <>
      <mesh position={[0, 30 * scale, 0]} scale={[scale, 1, scale]} castShadow>
        <cylinderGeometry args={[2.5, 3, 60, 10]} />
        <meshStandardMaterial color="#0d0d10" roughness={0.9} />
      </mesh>
      <mesh position={[GREECE_PLANNED.x, 1.5 * scale, GREECE_PLANNED.z]} scale={[scale, 1, scale]} castShadow>
        <boxGeometry args={[8, 3, 8]} />
        <meshStandardMaterial color="#e8e0c8" />
      </mesh>
    </>
  );
}

// Per-frame logic in Scene moves this camera over the vessel; mounting only sets the frustum.
function IsoCamera() {
  const height = useThree((s) => s.size.height);
  return (
    <OrthographicCamera
      makeDefault
      position={[ISO_OFFSET, ISO_OFFSET, ISO_OFFSET]}
      zoom={height / ISO_VIEW_HEIGHT}
      near={0.1}
      far={20000}
    />
  );
}

function Scene({
  simulation,
  dispatch,
  blocked,
  place,
  overview,
  isometric,
  authorityFrame,
  shared,
}: {
  simulation: React.RefObject<State>;
  dispatch: (c: Command) => void;
  blocked: boolean;
  overview: boolean;
  isometric: boolean;
  authorityFrame: (intent:Frame)=>boolean;
  shared:RoomView|null;
  place?: (x: number, z: number) => void;
}) {
  const gl = useThree((s) => s.gl);
  const ferry = useRef<THREE.Group>(null);
  const boat = useRef<THREE.Group>(null);
  const player = useRef<THREE.Group>(null);
  const beast = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  useEffect(() => {
    if (blocked) keys.current = {};
  }, [blocked]);
  const [view, setView] = useState(simulation.current);
  const elapsed = useRef(0);
  const target = useRef(new THREE.Vector3());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        blockedRef.current ||
        (e.code === "Space" && e.target instanceof HTMLButtonElement)
      )
        return;
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))
        return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      )
        e.preventDefault();
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const clear = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    gl.domElement.dataset.controlsReady = "true";
    return () => {
      delete gl.domElement.dataset.controlsReady;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [gl]);
  useFrame(({ camera, clock }, dt) => {
    const k = keys.current;
    const dx =
      Number(!!(k.KeyD || k.ArrowRight)) - Number(!!(k.KeyA || k.ArrowLeft));
    const dz =
      Number(!!(k.KeyS || k.ArrowDown)) - Number(!!(k.KeyW || k.ArrowUp));
    // Simulation movement bypasses React. HUD snapshots are sampled at 5 Hz.
    const online=authorityFrame({type:'frame',dx:blocked?0:dx,dz:blocked?0:dz,throttle:blocked?0:-dz,turn:blocked?0:-dx});
    if (!online && !blocked && (dx || dz))
      simulation.current = transition(simulation.current, {
        type: "move",
        dx,
        dz,
        dt,
      });
    const pre = simulation.current;
    if (!online && (pre.ferry.speed > 0 || pre.ferry.passenger?.station === "helm"))
      simulation.current = transition(pre, {
        type: "ferry-step",
        dt,
        throttle: blocked ? 0 : -dz,
        turn: blocked ? 0 : -dx,
      });
    const s = simulation.current;
    if (ferry.current) {
      ferry.current.position.set(s.ferry.pose.x, 0, s.ferry.pose.z);
      ferry.current.rotation.y = s.ferry.pose.heading;
    }
    if (boat.current) {
      boat.current.position.set(
        s.ship.x,
        0.2 + Math.sin(clock.elapsedTime * 1.5) * 0.08,
        s.ship.z,
      );
      if (s.mode === "ship" && (dx || dz))
        boat.current.rotation.y = Math.atan2(dx, dz);
    }
    if (player.current) {
      player.current.visible = s.mode !== "ship";
      player.current.rotation.y = s.mode === "ferry" ? s.ferry.pose.heading : 0;
      player.current.position.set(
        s.position.x,
        s.mode === "ferry" ? FERRY.deckHeight + 0.65 : 0.6,
        s.position.z,
      );
    }
    if (beast.current) {
      beast.current.visible = s.beast.hp > 0;
      beast.current.position.y = 0.1 + Math.sin(clock.elapsedTime * 2) * 0.15;
    }
    const iso = overview && isometric;
    const focus = iso ? WORLD_CENTRE : overview ? s.ferry.pose : s.position;
    const attached = s.mode === "ferry" ? s.ferry.passenger : null;
    const offset =
      attached && !overview
        ? localToWorld(
            { x: attached.local.x + 15, z: Math.max(attached.local.z + 28, FERRY.helm.z + 14) },
            s.ferry.pose,
          )
        : {
            x: focus.x + (iso ? ISO_OFFSET : overview ? 130 : 0),
            z: focus.z + (iso ? ISO_OFFSET : overview ? 150 : 20),
          };
    const look =
      attached && !overview
        ? localToWorld(
            {
              x: attached.local.x,
              // Look toward the helm while it is still ahead of the walker, so it stays in frame.
              z: attached.station === "deck" && attached.local.z < FERRY.helm.z
                ? (attached.local.z + FERRY.helm.z) / 2
                : attached.local.z - 3,
            },
            s.ferry.pose,
          )
        : { x: focus.x, z: focus.z - (overview ? 0 : 3) };
    target.current.set(
      offset.x,
      iso ? ISO_OFFSET : overview ? 125 : attached ? 24 : 19,
      offset.z,
    );
    camera.position.lerp(target.current, 1 - Math.exp(-dt * 3));
    camera.lookAt(look.x, iso ? 0 : overview ? 12 : attached ? 6 : 0, look.z);
    elapsed.current += dt;
    if (elapsed.current > 0.2) {
      elapsed.current = 0;
      setView(s);
    }
  });
  return (
    <>
      {overview && isometric && <IsoCamera />}
      <color attach="background" args={["#142d3c"]} />
      {!(overview && isometric) && <fog attach="fog" args={["#142d3c", 140, 700]} />}
      <ambientLight intensity={1.3} />
      <directionalLight position={[12, 25, 8]} intensity={2} castShadow />
      <WorldMarkers scale={overview && isometric ? 8 : 1} />
      <Constellation />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[20000, 20000]} />
        <meshStandardMaterial
          color={waterField(view, view.position.z) > 0 ? "#236e78" : "#28536c"}
          roughness={0.35}
          metalness={0.3}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 15, -0.2, -8]}
          receiveShadow
          onClick={(e) => {
            if (place) {
              e.stopPropagation();
              place(
                Math.round(e.point.x * 2) / 2,
                Math.round(e.point.z * 2) / 2,
              );
            }
          }}
        >
          <boxGeometry args={[22, 0.5, 50]} />
          <meshStandardMaterial color="#49664b" />
        </mesh>
      ))}
      <mesh position={[-5, 0.2, 13]}>
        <boxGeometry args={[6, 0.25, 2]} />
        <meshStandardMaterial color="#8d6a47" />
      </mesh>
      {Object.entries(NODE_POSITIONS).map(([id, n]) => (
        <group
          key={id}
          position={[n.x, 0.8, n.z]}
          onClick={(e) => {
            e.stopPropagation();
            if (!blocked && !place) dispatch({ type: "gather", id });
          }}
        >
          <mesh castShadow scale={view.nodes[id] > 0 ? 1 : 0.3}>
            {n.kind === "wood" ? (
              <coneGeometry args={[1, 3, 7]} />
            ) : (
              <dodecahedronGeometry args={[0.9, 0]} />
            )}
            <meshStandardMaterial
              color={
                n.kind === "wood"
                  ? "#284b32"
                  : n.kind === "gold"
                    ? "#f0c455"
                    : "#a0a09b"
              }
            />
          </mesh>
        </group>
      ))}
      {Object.entries(SALVAGE).map(([id, n]) => (
        <mesh
          key={id}
          position={[n.x, 0.35, n.z]}
          scale={view.salvage[id] > 0 ? 1 : 0.25}
          onClick={(e) => {
            e.stopPropagation();
            if (!blocked && !place) dispatch({ type: "collect", id });
          }}
        >
          <boxGeometry args={[1, 0.7, 1]} />
          <meshStandardMaterial
            color={
              n.item === "bolt"
                ? "#b3c1c5"
                : n.item === "cloth"
                  ? "#d9c99c"
                  : "#647880"
            }
          />
        </mesh>
      ))}
      {Object.entries(DOCKS).map(([id, d]) => (
        <group key={id}>
          <mesh position={[id === "haven" ? -4.8 : 4.8, 0.2, d.z]}>
            <boxGeometry args={[3.5, 0.25, 2]} />
            <meshStandardMaterial color="#946c42" />
          </mesh>
          <mesh position={[d.x, 0.7, d.z - 2]}>
            <boxGeometry args={[2, 1.4, 1.5]} />
            <meshStandardMaterial color="#a88c65" />
          </mesh>
        </group>
      ))}
      <PlacedObjects state={view} />
      {view.colonies.map((c) => (
        <group key={c.id}>
          <Pyramid x={c.x} z={c.z - 4} tiers={c.pyramid} active={c.active} />
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[c.x + (i - 1) * 3, 0.7, c.z + 2]}
              castShadow
            >
              <boxGeometry args={[2, 1.4, 2]} />
              <meshStandardMaterial
                color={c.id === "haven" ? "#b29b75" : "#a88862"}
              />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[93.5, -0.2, 180]}>
        <boxGeometry args={[27, 0.5, 20]} />
        <meshStandardMaterial color="#54634d" />
      </mesh>
      <mesh position={[106, 0.15, 180]}>
        <boxGeometry args={[4, 0.25, 3]} />
        <meshStandardMaterial color="#a18358" />
      </mesh>
      <group ref={ferry}>
        <FerryModel
          cutaway={view.mode === "ferry" && !overview}
          sails={view.ferry.sails}
          cargoUnits={shared?.view.freight.ferry??usage(view.logistics, "ferry")}
        />
      </group>
      <group ref={boat}>
        <mesh castShadow>
          <boxGeometry args={[1.8, 0.65, 3.7]} />
          <meshStandardMaterial color="#6c432b" />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <cylinderGeometry args={[0.06, 0.09, 4.7]} />
          <meshStandardMaterial color="#ab8759" />
        </mesh>
        <mesh position={[0.65, 2.6, 0]}>
          <boxGeometry args={[1.5, 2.5, 0.06]} />
          <meshStandardMaterial color="#eee2bf" side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group ref={player}>
        <mesh castShadow>
          <capsuleGeometry args={[0.3, 0.7, 4, 8]} />
          <meshStandardMaterial
            color={equipped(view, "body") ? "#597b99" : "#e8c98c"}
          />
        </mesh>
        {equipped(view, "back") && (
          <mesh position={[0, 0, 0.3]}>
            <boxGeometry args={[0.5, 0.6, 0.25]} />
            <meshStandardMaterial color="#84633d" />
          </mesh>
        )}
        {equipped(view, "hand") && (
          <mesh position={[0.45, 0, 0]}>
            <boxGeometry args={[0.12, 0.75, 0.12]} />
            <meshStandardMaterial color="#bbc5ca" />
          </mesh>
        )}
      </group>
      {shared && <SharedScene actor={shared.actor} view={shared.view} state={view} />}
      <group ref={beast} position={[0, 0, -10]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.75, 3, 4, 10]} />
          <meshStandardMaterial color="#654b76" />
        </mesh>
        {[-1, 1].map((x) => (
          <mesh key={x} position={[x * 1.1, 0.6, 0]}>
            <coneGeometry args={[0.3, 1.4, 5]} />
            <meshStandardMaterial color="#d8b4a6" />
          </mesh>
        ))}
      </group>
      <group position={[0, 0.1, -25]} rotation={[0.1, 0, 0.3]}>
        <mesh>
          <boxGeometry args={[2.5, 0.5, 4]} />
          <meshStandardMaterial color="#403a34" />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <octahedronGeometry args={[0.45]} />
          <meshStandardMaterial
            color={view.recovered ? "#555555" : "#ffd15b"}
            emissive="#ad7421"
          />
        </mesh>
      </group>
    </>
  );
}

function ImportedAsset({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  return <primitive object={gltf.scene} position={[-6, 1, 16]} />;
}
