// Development-only tool: swaps the saved game for a test player aboard Endurance, near the helm, and back again.
// It renders only in `vite` dev. Production builds contain no reference to it, because import.meta.env.DEV is false there.
import { useState } from "react";
import { initialState, restore, transition, type State } from "../../packages/game-core";
import { localToWorld, FERRY } from "../../packages/vessels";

const FLAG_KEY = "emberfall.debug.testPlayer";
const BACKUP_KEY = "emberfall.debug.realSave";

// A fisher aboard Endurance on deck, 5 m from the helm, with the sails furled and 500 of every good in stock.
export function testPlayerState(): State {
  let s = transition(initialState(), { type: "choose-profession", profession: "fisher" });
  const dock = localToWorld(FERRY.boarding, s.ferry.pose);
  s = transition({ ...s, position: { x: dock.x, z: dock.z } }, { type: "ferry-board" });
  const local = { x: 0, z: FERRY.helm.z - 5 };
  // Full stock so every action can be tested without gathering first.
  const inventory = { wood: 500, stone: 500, gold: 500, food: 500, relic: 500 };
  return {
    ...s,
    inventory,
    position: localToWorld(local, s.ferry.pose),
    ferry: { ...s.ferry, passenger: { local, station: "deck" } },
  };
}

export function DebugTestPlayer({
  saveKey,
  onSwitch,
}: {
  saveKey: string;
  onSwitch: (s: State) => void;
}) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(FLAG_KEY) === "on";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    try {
      if (!on) {
        // Keep the real save so toggling back restores it exactly.
        const real = localStorage.getItem(saveKey);
        if (real !== null) localStorage.setItem(BACKUP_KEY, real);
        const test = testPlayerState();
        localStorage.setItem(saveKey, JSON.stringify(test));
        localStorage.setItem(FLAG_KEY, "on");
        onSwitch(test);
      } else {
        const real = localStorage.getItem(BACKUP_KEY);
        const back = real !== null ? restore(JSON.parse(real)) : initialState();
        if (real !== null) localStorage.setItem(saveKey, real);
        else localStorage.removeItem(saveKey);
        localStorage.setItem(FLAG_KEY, "off");
        onSwitch(back);
      }
      setOn(!on);
    } catch (error) {
      console.error("Debug test player could not switch saves", error);
    }
  };

  return (
    <button className="debug-toggle" onClick={toggle} aria-pressed={on} title="Development only">
      {on ? "Test player: on" : "Test player: off"}
    </button>
  );
}
