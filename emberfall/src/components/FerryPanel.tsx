import type { State, Command } from "../../packages/game-core";
import { FERRY } from "../../packages/vessels";
import { usage } from "../../packages/logistics";
export default function FerryPanel({
  state,
  dispatch,
  overview,
  toggleOverview,
  isometric,
  toggleIsometric,
  sharedFreight,
}: {
  state: State;
  dispatch: (c: Command) => void;
  overview: boolean;
  toggleOverview: () => void;
  isometric: boolean;
  toggleIsometric: () => void;
  sharedFreight?:number;
}) {
  const f = state.ferry,
    p = f.passenger;
  return (
    <section className="ferry-controls">
      <h3>Endurance ferry</h3>
      <p>
        160 m · 4 masts · Steel hull & timber deck
        <br />
        Canvas {f.sails} · {f.speed.toFixed(1)} m/s
        <br />
        Position {f.pose.x.toFixed(1)}, {f.pose.z.toFixed(1)} · Heading{" "}
        {((f.pose.heading * 180) / Math.PI).toFixed(0)}°<br />
        Freight {sharedFreight??usage(state.logistics, "ferry")}/96
      </p>
      {p && (
        <p data-testid="ferry-attachment">
          {p.station === "helm" ? "At helm" : "Walking deck"} · Local{" "}
          {p.local.x.toFixed(1)}, {p.local.z.toFixed(1)}
        </p>
      )}
      <div className="sea-actions">
        <button onClick={() => dispatch({ type: "ferry-shuttle" })}>
          Shuttle: Haven ↔ ferry pier
        </button>
        <button onClick={() => dispatch({ type: "ferry-board" })}>
          Board Endurance ferry
        </button>
        <button onClick={() => dispatch({ type: "ferry-exit" })}>
          Exit ferry at gangway
        </button>
        <button onClick={() => dispatch({ type: "ferry-helm" })}>
          H · {p?.station === "helm" ? "Release" : "Take"} ferry helm
        </button>
        <button onClick={() => dispatch({ type: "ferry-sails" })}>
          Set / furl ferry sails
        </button>
        <button onClick={toggleOverview}>
          {overview ? "Follow player" : "Vessel overview"}
        </button>
        {overview && (
          <button onClick={toggleIsometric} aria-pressed={isometric}>
            {isometric ? "Perspective view" : "Isometric map"}
          </button>
        )}
      </div>
      <p>
        On deck: WASD walks relative to vessel.
        <br />
        Helm: aft at 0,35. H takes/releases it.
        <br />
        At helm: set sails, W accelerates, S brakes, A/D steer. Vessel coasts
        when released.
      </p>
      <small>
        Gangway: −9,0. Exit only when stopped, beside the pier or your skiff.
        Cabin doorway: 0,53. Sailing is a kinematic prototype.
      </small>
    </section>
  );
}
