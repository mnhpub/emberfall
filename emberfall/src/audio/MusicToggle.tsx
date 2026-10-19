import { useEffect, useState } from "react";
import { Chiptune, readMusicPreference, writeMusicPreference } from "./chiptune";

// One engine per page. It creates no AudioContext until music is actually started.
const engine = new Chiptune();
const storage = typeof localStorage === "undefined" ? undefined : localStorage;

export default function MusicToggle() {
  const [on, setOn] = useState(() => readMusicPreference(storage));

  useEffect(() => {
    if (!on) {
      engine.stop();
      return;
    }
    // Browsers only allow audio after a user gesture, so the first interaction starts the music.
    const begin = () => engine.start();
    if (navigator.userActivation?.hasBeenActive) begin();
    window.addEventListener("pointerdown", begin, { once: true });
    window.addEventListener("keydown", begin, { once: true });
    return () => {
      window.removeEventListener("pointerdown", begin);
      window.removeEventListener("keydown", begin);
    };
  }, [on]);

  const toggle = () => {
    const next = !on;
    writeMusicPreference(storage, next);
    if (next) engine.start();
    setOn(next);
  };

  return (
    <button
      className="music-toggle"
      onClick={toggle}
      aria-pressed={on}
      title={on ? "Mute the soundtrack" : "Play the 8-bit soundtrack"}
    >
      {on ? "♪ Music on" : "♪ Music off"}
    </button>
  );
}
