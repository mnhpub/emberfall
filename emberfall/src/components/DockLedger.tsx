import { useState } from "react";
import {
  DOCKS,
  GOODS,
  usage,
  type Good,
  type CargoCommand,
  type Endpoint,
} from "../../packages/logistics";
import { cargoContext } from "../../packages/game-core/logistics";
import type { State, Command } from "../../packages/game-core";
import type { SharedView } from '../../packages/authority/protocol';
export default function DockLedger({
  state,
  dispatch,
  close,
  shared,
}: {
  state: State;
  dispatch: (c: Command) => void;
  close: () => void;
  shared?:SharedView;
}) {
  const [quantity, setQuantity] = useState(1);
  const [good, setGood] = useState<Good>("wood");
  const [dock, setDock] = useState<"haven" | "aurum">("haven");
  const [destination, setDestination] = useState<Endpoint>("ship");
  const s = state.logistics;
  const context = cargoContext(state);
  const send = (command: CargoCommand) =>
    dispatch({
      type: "cargo",
      envelope: {
        commandId: crypto.randomUUID(),
        expectedRevision: s.revision,
        command,
      },
    });
  return (
    <section
      className="workshop-panel dock-ledger"
      role="dialog"
      aria-labelledby="dock-title"
    >
      <header>
        <div>
          <small>WAREHOUSES · VESSEL · CRATES</small>
          <h2 id="dock-title">Dock ledger</h2>
        </div>
        <button aria-label="Close dock ledger" onClick={close}>
          ×
        </button>
      </header>
      <p>
        Position {state.position.x.toFixed(1)}, {state.position.z.toFixed(1)} ·
        Ledger revision {s.revision}
        <br />
        Your contribution {s.reputation} · Official rankings are not connected.
      </p>
      <div className="dock-capacities">
        <span>Haven {shared?.freight.haven??usage(s, "haven-store")}/128</span>
        <span>Aurum {shared?.freight.aurum??usage(s, "aurum-store")}/128</span>
        <span>Ship {usage(s, "ship")}/24</span>
      </div>
      <h3>Handling desk</h3>
      <p>
        Haven dock: −7, 13 · Aurum dock: 7, −19. Bring the vessel alongside and
        stay within six metres of both custodians. Quantities use abstract
        handling units.
      </p>
      <div className="cargo-controls">
        <label>
          Quantity
          <input
            aria-label="Cargo quantity"
            type="number"
            min="1"
            max="128"
            value={quantity}
            onChange={(e) =>
              setQuantity(
                Number.isNaN(e.target.valueAsNumber)
                  ? 0
                  : e.target.valueAsNumber,
              )
            }
          />
        </label>
        <label>
          Supply
          <select
            aria-label="Supply type"
            value={good}
            onChange={(e) => setGood(e.target.value as Good)}
          >
            {GOODS.map((g) => (
              <option key={g} value={g}>
                {g} · carried {context.available[g]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deposit dock
          <select
            aria-label="Deposit dock"
            value={dock}
            onChange={(e) => setDock(e.target.value as "haven" | "aurum")}
          >
            <option value="haven">Ember Haven</option>
            <option value="aurum">Aurum</option>
          </select>
        </label>
        <button onClick={() => send({ type: "deposit", good, quantity, dock })}>
          Deposit carried supplies
        </button>
      </div>
      <h3>Work orders</h3>
      {s.orders.map((o) => (
        <article className="cargo-order" key={o.id}>
          <b>
            {o.id === "aurum-timber"
              ? "Aurum timber shipment"
              : "Haven provisioning run"}
          </b>
          <p>
            {o.required} {o.good} · {DOCKS[o.source].name} →{" "}
            {DOCKS[o.destination].name}
            <br />
            {shared?.orders.find(a=>a.id===o.id)?.fulfilled??o.fulfilled}/{o.required} accepted ·{" "}
            {shared?.orders.find(a=>a.id===o.id)?.reserved??s.lots
              .filter((l) => l.orderId === o.id)
              .reduce((n, l) => n + l.quantity, 0)}{" "}
            reserved · {o.rewardPerUnit} points/unit
          </p>
        </article>
      ))}
      <h3>Cargo manifest</h3>
      <label>
        Transfer destination
        <select
          aria-label="Transfer destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value as Endpoint)}
        >
          <option value="ship">Wayfarer ship</option>
          <option value="ferry">Endurance ferry (96 units)</option>
          <option value="haven-store">Haven warehouse</option>
          <option value="aurum-store">Aurum warehouse</option>
          {context.crates.map((c) => (
            <option key={c.id} value={`crate:${c.id}`}>
              Crate {c.id} ({usage(s, `crate:${c.id}`)}/{c.capacity})
            </option>
          ))}
        </select>
      </label>
      {!s.lots.length && (
        <p>
          No consignments yet. Deposit timber at Haven to begin the first route.
        </p>
      )}
      {s.lots.map((l) => (
        <article className="cargo-lot" key={l.id} data-lot-id={l.id}>
          <b>
            {l.id} · {l.quantity} {l.good}
          </b>
          <small>
            Owner {l.ownerId} · Condition {l.condition}%<br />
            Custody {l.custodian} · Origin {l.origin} →{" "}
            {l.destination ?? "unassigned"}
            <br />
            Root {l.rootId} ·{" "}
            {l.shipped ? "Ship handling recorded" : "Not loaded aboard"}
          </small>
          <div className="sea-actions">
            <button
              onClick={() =>
                send({
                  type: "transfer",
                  lotId: l.id,
                  quantity,
                  to: destination,
                })
              }
            >
              Transfer {quantity}
            </button>
            {!l.orderId && (
              <button
                onClick={() =>
                  send({ type: "withdraw", lotId: l.id, quantity })
                }
              >
                Reclaim {quantity} to inventory
              </button>
            )}
            {!l.orderId &&
              s.orders
                .filter((o) => o.good === l.good && o.source === l.origin)
                .map((o) => (
                  <button
                    key={o.id}
                    onClick={() =>
                      send({
                        type: "consign",
                        lotId: l.id,
                        quantity,
                        orderId: o.id,
                      })
                    }
                  >
                    Assign {quantity} to {o.id}
                  </button>
                ))}
            {l.orderId && (
              <button
                onClick={() => send({ type: "fulfill", lotId: l.id, quantity })}
              >
                Fulfill {quantity} at destination
              </button>
            )}
          </div>
        </article>
      ))}
      <details>
        <summary>Recent ledger events ({s.events.length}/512)</summary>
        {s.events
          .slice(-8)
          .reverse()
          .map((e) => (
            <p key={e.sequence}>
              #{e.sequence} {e.type}
              <br />
              <small>
                {e.upserted.map((l) => `${l.quantity} ${l.good}`).join(", ") ||
                  "Delivery accepted / supplies reclaimed"}
              </small>
            </p>
          ))}
      </details>
    </section>
  );
}
