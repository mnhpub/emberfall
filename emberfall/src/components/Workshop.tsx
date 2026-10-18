import {
  CATALOG,
  PROFESSIONS,
  RECIPES,
  definition,
  itemCount,
  type Profession,
  type Slot,
  type ItemId,
} from "../../packages/game-core/catalog";
import { recipeProjection } from "../../packages/game-core/projections";
import type { Command, State } from "../../packages/game-core";
export function ProfessionPicker({
  choose,
}: {
  choose: (p: Profession) => void;
}) {
  return (
    <div className="profession-backdrop">
      <section
        className="profession-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profession-title"
      >
        <small>YOUR FIRST TRADE</small>
        <h2 id="profession-title">Find your place in the watershed</h2>
        <p>
          Choose a starting trade and tool. Everyone can pick up bolts and
          gather materials. Cross-training comes later.
        </p>
        <div className="profession-grid">
          {Object.entries(PROFESSIONS).map(([id, p]) => (
            <button key={id} onClick={() => choose(id as Profession)}>
              <strong>{p.name}</strong>
              <span>{p.description}</span>
              <small>Starts with {definition(p.starter).name}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
export default function Workshop({
  state,
  dispatch,
  close,
  place,
}: {
  state: State;
  dispatch: (c: Command) => void;
  close: () => void;
  place: (id: string) => void;
}) {
  const placed = new Set(state.placed.map((p) => p.instanceId));
  return (
    <section
      className="workshop-panel"
      role="dialog"
      aria-labelledby="workshop-title"
    >
      <header>
        <div>
          <small>
            {state.profession
              ? PROFESSIONS[state.profession].name
              : "Choose your trade"}
          </small>
          <h2 id="workshop-title">Kit & workshop</h2>
        </div>
        <button aria-label="Close workshop" onClick={close}>
          ×
        </button>
      </header>
      <p>
        Wood {state.inventory.wood} · Granite {state.inventory.stone} · Gold{" "}
        {state.inventory.gold}
        <br />
        Position {state.position.x.toFixed(1)}, {state.position.z.toFixed(1)} ·
        Salvage is finite.
      </p>
      <h3>Equipment</h3>
      <div className="equipment-slots">
        {(["hand", "body", "back"] as Slot[]).map((slot) => (
          <div key={slot}>
            <b>{slot}</b>
            <span>
              {state.items.find((i) => i.id === state.equipment[slot])
                ? definition(
                    state.items.find((i) => i.id === state.equipment[slot])!
                      .definitionId,
                  ).name
                : "Empty"}
            </span>
            {state.equipment[slot] && (
              <button onClick={() => dispatch({ type: "unequip", slot })}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <h3>Belongings</h3>
      <div className="item-list">
        {state.items
          .filter((i) => definition(i.definitionId).family !== "component")
          .map((i) => (
            <article key={i.id}>
              <div>
                <b>{definition(i.definitionId).name}</b>
                <small>
                  {definition(i.definitionId).material} · Condition{" "}
                  {i.condition}%
                </small>
              </div>
              <div>
                {definition(i.definitionId).slot && (
                  <button
                    disabled={
                      state.equipment[definition(i.definitionId).slot!] ===
                        i.id || i.condition === 0
                    }
                    onClick={() =>
                      dispatch({ type: "equip", instanceId: i.id })
                    }
                  >
                    Equip
                  </button>
                )}
                {definition(i.definitionId).footprint &&
                  (placed.has(i.id) ? (
                    <button
                      onClick={() =>
                        dispatch({ type: "pack", instanceId: i.id })
                      }
                    >
                      Pack nearby
                    </button>
                  ) : (
                    <button onClick={() => place(i.id)}>Place on land</button>
                  ))}
              </div>
            </article>
          ))}
      </div>
      <h3>Components</h3>
      <div className="component-grid">
        {Object.entries(CATALOG)
          .filter(([, d]) => d.family === "component")
          .map(([id]) => (
            <div key={id}>
              <b>{definition(id as ItemId).name}</b>
              <span>{itemCount(state.items, id as ItemId)}</span>
              <small>
                {definition(id as ItemId).specification ??
                  definition(id as ItemId).material}
              </small>
            </div>
          ))}
      </div>
      <h3>Recipes</h3>
      <p>Try a recipe to see missing materials or station requirements.</p>
      <div className="recipe-grid">
        {recipeProjection(state).map(({ id, blockers, ...r }) => (
          <article key={id}>
            <b>{r.name}</b>
            <small>
              {[
                ...Object.entries(r.resources ?? {}).map(
                  ([k, n]) => `${n} ${k}`,
                ),
                ...Object.entries(r.components ?? {}).map(
                  ([k, n]) => `${n} ${definition(k as ItemId).name}`,
                ),
              ].join(" · ")}
            </small>
            <small>
              {r.station ? `Near ${definition(r.station).name}` : "Handcraft"}
              {r.profession ? ` · ${PROFESSIONS[r.profession].name}` : ""}
            </small>
            {blockers.length > 0 && <small>{blockers[0]}</small>}
            <button
              disabled={blockers.length > 0}
              onClick={() => dispatch({ type: "craft", recipe: id })}
            >
              Craft {r.quantity > 1 ? `×${r.quantity}` : ""}
            </button>
          </article>
        ))}
      </div>
      <p className="workshop-note">
        Equip a hammer to place structures. Find clear land west of the village;
        click within six metres. Placed crates accept cargo through the dock ledger (L). Empty them before packing.
        Backpacks do not yet expand capacity. Fishing and food preparation are planned.
      </p>
    </section>
  );
}
