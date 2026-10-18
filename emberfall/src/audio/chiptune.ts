// Procedural 8-bit soundtrack. No audio files: every note is synthesised from Web Audio oscillators.
// The song data is pure so it can be tested without a browser; the engine is the only browser code.
//
// Arrangement (8 bars, A minor with an E major turnaround, 84 BPM):
//   intro   bars 0-1  rhythm track only
//   verse   bars 2-3  + bass + melody
//   chorus  bars 4-5  + octave lead, driving bass, chord stabs
//   bridge  bars 6-7  + melody and bass, snare roll into the restart
// The rhythm track (pulse arpeggio, hats, snare, kick) runs under every section.

export const BPM = 84;
export const STEPS_PER_BEAT = 4; // sixteenth notes
export const STEP_SECONDS = 60 / BPM / STEPS_PER_BEAT;
export const BARS = 8;
export const STEPS_PER_BAR = 16;
export const LOOP_STEPS = BARS * STEPS_PER_BAR;

// Chord tones as MIDI notes, one chord per bar.
const CHORDS: readonly number[][] = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
  [52, 56, 59], // E (major dominant, the dramatic turnaround)
];

// Melody: eight eighth-note slots per bar, 0 is a rest. Written against the chords above.
const MELODY: readonly number[][] = [
  [69, 0, 72, 71, 69, 67, 0, 64],
  [65, 0, 69, 72, 74, 72, 69, 0],
  [67, 0, 64, 67, 72, 0, 71, 0],
  [71, 74, 79, 0, 74, 71, 67, 0],
  [76, 0, 72, 71, 69, 0, 72, 74],
  [69, 72, 77, 0, 76, 74, 72, 0],
  [74, 71, 67, 71, 74, 79, 78, 0],
  [68, 71, 76, 0, 75, 76, 0, 71],
];

// The second sixteenth of each melody slot: a whole step away, staying in key (down if up leaves the key).
const KEY_CLASSES = new Set([0, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
export function neighbourOf(note: number): number {
  return KEY_CLASSES.has((note + 2) % 12) ? note + 2 : note - 2;
}

export type Section = "intro" | "verse" | "chorus" | "bridge";
export function sectionOf(bar: number): Section {
  if (bar < 2) return "intro";
  if (bar < 4) return "verse";
  if (bar < 6) return "chorus";
  return "bridge";
}

// The rhythm track is quieter in the intro and loudest in the chorus.
const INTENSITY: Record<Section, number> = { intro: 0.55, verse: 0.8, chorus: 1, bridge: 0.85 };

export type Voice = "rhythm" | "bass" | "melody" | "lead" | "chorus" | "kick" | "hat" | "snare";
export type NoteEvent = { voice: Voice; midi: number; velocity: number; steps: number };

// Events that start on a given step of the loop. Empty for steps with nothing to play.
export function eventsAt(step: number): NoteEvent[] {
  const index = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(index / STEPS_PER_BAR);
  const within = index % STEPS_PER_BAR;
  const section = sectionOf(bar);
  const intensity = INTENSITY[section];
  const [root, third, fifth] = CHORDS[bar];
  const events: NoteEvent[] = [];

  // Rhythm track: the original pulse arpeggio, hats and snare, unchanged in shape.
  if (within % 2 === 0) {
    const arp = [root + 12, third + 12, fifth + 12, third + 12];
    events.push({ voice: "rhythm", midi: arp[(within / 2) % arp.length], velocity: 0.35 * intensity, steps: 2 });
    events.push({ voice: "hat", midi: 0, velocity: (within % 4 === 0 ? 0.26 : 0.14) * intensity, steps: 1 });
  }
  if (within === 4 || within === 12) events.push({ voice: "snare", midi: 0, velocity: 0.5 * intensity, steps: 2 });
  if ((section === "chorus" || section === "bridge") && (within === 0 || within === 8))
    events.push({ voice: "kick", midi: 0, velocity: 0.7 * intensity, steps: 1 });
  // Bridge turnaround: a snare roll over the last half of the E bar.
  if (section === "bridge" && bar === 7 && within >= 8 && within % 2 === 0)
    events.push({ voice: "snare", midi: 0, velocity: 0.3 + (within - 8) * 0.04, steps: 1 });

  // Bass: a half-note root and a fifth in verse and bridge; a driving octave pulse in the chorus.
  if (section !== "intro") {
    if (section === "chorus") {
      if (within % 4 === 2) events.push({ voice: "bass", midi: root - 12, velocity: 0.7, steps: 2 });
    } else {
      if (within === 0) events.push({ voice: "bass", midi: root - 12, velocity: 0.9, steps: 6 });
      if (within === 8) events.push({ voice: "bass", midi: root - 12 + 7, velocity: 0.75, steps: 6 });
    }
  }

  // Melody at double time: every sixteenth step. The tune in verse and bridge; the chorus lead takes it up an octave.
  if (section !== "intro") {
    const base = MELODY[bar][Math.floor(within / 2)];
    const note = base === 0 ? 0 : within % 2 === 0 ? base : neighbourOf(base);
    if (note) {
      if (section === "chorus") events.push({ voice: "lead", midi: note + 12, velocity: 0.5, steps: 1 });
      else events.push({ voice: "melody", midi: note, velocity: 0.55, steps: 1 });
    }
  }

  // Chorus stabs: full chord on the beat, for the weight that makes the chorus land.
  if (section === "chorus" && (within === 0 || within === 8))
    for (const tone of [root, third, fifth]) events.push({ voice: "chorus", midi: tone, velocity: 0.45, steps: 5 });

  return events;
}

export function midiToHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const SONG_KEY = "emberfall.music.enabled";

export function readMusicPreference(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(SONG_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeMusicPreference(storage: Pick<Storage, "setItem"> | undefined, enabled: boolean) {
  try {
    storage?.setItem(SONG_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be blocked; the preference then lasts for this page only.
  }
}

// Browser engine. The AudioContext is created on the first start(), which must follow a user gesture.
export class Chiptune {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private grit?: Float32Array<ArrayBuffer>;
  private timer?: ReturnType<typeof setInterval>;
  private nextTime = 0;
  private step = 0;

  start() {
    if (typeof AudioContext === "undefined") return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
      // Soft-clipping curve for the grunge bass: overdrive that stays bounded.
      this.grit = new Float32Array(1024);
      for (let i = 0; i < this.grit.length; i++) {
        const x = (i / (this.grit.length - 1)) * 2 - 1;
        this.grit[i] = Math.tanh(6 * x) / Math.tanh(6);
      }
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const ctx = this.ctx!;
    void ctx.resume();
    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.setTargetAtTime(0.16, ctx.currentTime, 0.05);
    if (this.timer) return;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (!this.ctx || !this.master) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const ctx = this.ctx;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => {
      if (!this.timer) void ctx.suspend();
    }, 300);
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + 0.12) {
      for (const event of eventsAt(this.step)) this.play(event, this.nextTime);
      this.nextTime += STEP_SECONDS;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
  }

  private play(event: NoteEvent, when: number) {
    const ctx = this.ctx!;
    const duration = event.steps * STEP_SECONDS;
    const gain = ctx.createGain();
    gain.connect(this.master!);
    gain.gain.setValueAtTime(0.0001, when);
    if (event.voice === "hat" || event.voice === "snare" || event.voice === "kick") {
      const source = ctx.createBufferSource();
      source.buffer = this.noise!;
      const filter = ctx.createBiquadFilter();
      if (event.voice === "hat") {
        filter.type = "highpass";
        filter.frequency.value = 7000;
      } else if (event.voice === "snare") {
        filter.type = "bandpass";
        filter.frequency.value = 1800;
      } else {
        filter.type = "lowpass";
        filter.frequency.value = 180;
      }
      source.connect(filter).connect(gain);
      const length = event.voice === "kick" ? 0.14 : 0.08;
      gain.gain.exponentialRampToValueAtTime(event.velocity, when + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
      source.start(when);
      source.stop(when + length + 0.02);
      return;
    }
    const level = event.voice === "bass" ? 0.5 : { rhythm: 0.5, melody: 0.6, lead: 0.45, chorus: 0.3 }[event.voice]!;
    gain.gain.exponentialRampToValueAtTime(event.velocity * level, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    if (event.voice === "bass") {
      // Grunge bass: two slightly detuned saws, overdriven, then a resonant low-pass that closes over the note.
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.grit!;
      shaper.oversample = "4x";
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.Q.value = 7;
      tone.frequency.setValueAtTime(520, when);
      tone.frequency.exponentialRampToValueAtTime(160, when + duration);
      tone.connect(gain);
      shaper.connect(tone);
      for (const detune of [-11, 9]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(midiToHz(event.midi), when);
        osc.detune.value = detune;
        osc.connect(shaper);
        osc.start(when);
        osc.stop(when + duration + 0.02);
      }
      return;
    }
    const osc = ctx.createOscillator();
    // Per-voice timbre: pulse-style rhythm and melody, a sawtooth lead and chorus.
    osc.type = event.voice === "rhythm" || event.voice === "melody" ? "square" : "sawtooth";
    osc.frequency.setValueAtTime(midiToHz(event.midi), when);
    osc.connect(gain);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
}
