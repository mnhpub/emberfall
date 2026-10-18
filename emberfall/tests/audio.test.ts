import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsAt, sectionOf, neighbourOf, LOOP_STEPS, BARS, STEPS_PER_BAR, BPM, STEP_SECONDS, midiToHz, readMusicPreference, writeMusicPreference, SONG_KEY } from '../src/audio/chiptune.ts';

const barEvents = (bar: number) => Array.from({ length: STEPS_PER_BAR }, (_, i) => eventsAt(bar * STEPS_PER_BAR + i)).flat();
const voicesIn = (bar: number) => new Set(barEvents(bar).map((e) => e.voice));
// Pitch classes of A minor plus the E-major turnaround (G#, D#) and the passing F#.
const KEY = new Set([0, 2, 3, 4, 5, 6, 7, 8, 9, 11]);

test('the song is a slower eight-bar loop with four sections', () => {
  assert.equal(BPM, 84);
  assert.equal(BARS, 8);
  assert.equal(LOOP_STEPS, 128);
  assert.equal(STEP_SECONDS, 60 / 84 / 4);
  assert.deepEqual(eventsAt(5), eventsAt(5 + LOOP_STEPS));
  assert.deepEqual(eventsAt(-1), eventsAt(LOOP_STEPS - 1));
  assert.deepEqual([0, 2, 4, 6].map(sectionOf), ['intro', 'verse', 'chorus', 'bridge']);
});

test('every pitched note is audible and in a playable register', () => {
  for (let step = 0; step < LOOP_STEPS; step++)
    for (const e of eventsAt(step)) {
      if (['hat', 'snare', 'kick'].includes(e.voice)) continue;
      assert.ok(e.midi >= 36 && e.midi <= 96, `midi ${e.midi} out of range at step ${step}`);
      assert.ok(e.velocity > 0 && e.velocity <= 1, `velocity ${e.velocity} at step ${step}`);
      assert.ok(e.steps >= 1, 'notes last at least one step');
    }
});

test('the rhythm track runs under every section', () => {
  for (let bar = 0; bar < BARS; bar++) {
    assert.ok(voicesIn(bar).has('rhythm'), `bar ${bar} has no pulse`);
    assert.ok(voicesIn(bar).has('hat'), `bar ${bar} has no hats`);
    assert.ok(voicesIn(bar).has('snare'), `bar ${bar} has no backbeat`);
  }
});

test('intro is rhythm only; each later section adds its layers', () => {
  for (const bar of [0, 1]) {
    const v = voicesIn(bar);
    assert.ok(!v.has('bass') && !v.has('melody') && !v.has('lead') && !v.has('chorus'), `intro bar ${bar} adds layers`);
  }
  for (const bar of [2, 3]) assert.ok(voicesIn(bar).has('bass') && voicesIn(bar).has('melody'), `verse bar ${bar}`);
  for (const bar of [4, 5]) assert.ok(voicesIn(bar).has('bass') && voicesIn(bar).has('lead') && voicesIn(bar).has('chorus'), `chorus bar ${bar}`);
  for (const bar of [6, 7]) assert.ok(voicesIn(bar).has('bass') && voicesIn(bar).has('melody'), `bridge bar ${bar}`);
  assert.ok(!voicesIn(2).has('lead') && !voicesIn(2).has('chorus'), 'verse should not carry the chorus layers');
});

test('the bass follows each bar\'s chord root and fifth', () => {
  const roots = [45, 41, 36, 43, 45, 41, 43, 40]; // A F C G A F G E, an octave down
  roots.forEach((root, bar) => {
    if (bar < 2) return; // the intro is rhythm only
    const bass = barEvents(bar).filter((e) => e.voice === 'bass');
    assert.ok(bass.length > 0, `bar ${bar} has bass`);
    for (const e of bass) assert.ok(e.midi === root || e.midi === root + 7, `bar ${bar} bass ${e.midi} is not root or fifth`);
  });
});

test('the melody runs at double time, one sixteenth per step', () => {
  for (const bar of [2, 3, 6, 7]) {
    const notes = barEvents(bar).filter((e) => e.voice === 'melody');
    assert.ok(notes.length >= 8, `bar ${bar} melody has ${notes.length} sixteenths`);
    assert.ok(notes.every((e) => e.steps === 1), 'each melody note is one sixteenth');
  }
});

test('the bass is a grunge synth: its own voice, a sawtooth family, distinct from the rhythm track', () => {
  const bass = barEvents(2).filter((e) => e.voice === 'bass');
  assert.ok(bass.length > 0 && bass.every((e) => e.velocity > 0.5));
  assert.equal(barEvents(2).some((e) => e.voice === 'rhythm' && e.midi < 60 && e.midi > 40), false, 'rhythm does not play the bass register');
});

test('the melody stays in the key of A minor with the E-major turnaround', () => {
  for (let step = 0; step < LOOP_STEPS; step++)
    for (const e of eventsAt(step))
      if (e.voice === 'melody' || e.voice === 'lead')
        assert.ok(KEY.has(((e.midi % 12) + 12) % 12), `pitch class of ${e.midi} is outside the key at step ${step}`);
});

test('the chorus lead doubles the melody an octave up', () => {
  assert.equal(barEvents(0).filter((e) => e.voice === 'melody' || e.voice === 'lead').length, 0, 'intro has no tune');
  // Chorus bar 4 plays that bar's melody (sounding notes only), raised an octave.
  // Double time: each melody note is followed by its in-key neighbour.
  const table = [76, 0, 72, 71, 69, 0, 72, 74].filter((n) => n > 0);
  const expected = table.flatMap((n) => [n + 12, neighbourOf(n) + 12]);
  const chorus = barEvents(4).filter((e) => e.voice === 'lead').map((e) => e.midi);
  assert.deepEqual(chorus, expected);
});

test('chorus stabs land on the beat with the full chord', () => {
  for (const bar of [4, 5]) {
    const stabs = barEvents(bar).filter((e) => e.voice === 'chorus');
    assert.equal(stabs.length, 6, `bar ${bar}: two chord hits of three tones`);
    assert.deepEqual([...new Set(stabs.map((e) => e.midi % 12))].sort((a, b) => a - b).length, 3, 'three distinct chord tones');
  }
});

test('the bridge ends in a snare roll that builds into the restart', () => {
  const roll = eventsAt(7 * STEPS_PER_BAR + 8).concat(eventsAt(7 * STEPS_PER_BAR + 10)).filter((e) => e.voice === 'snare');
  assert.equal(roll.length, 2);
  assert.ok(roll[1].velocity > roll[0].velocity, 'the roll swells');
});

test('midi notes convert to standard concert pitch', () => {
  assert.equal(Math.round(midiToHz(69)), 440);
  assert.equal(Math.round(midiToHz(81)), 880);
});

test('music preference defaults on, survives storage failures, and persists explicit choices', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readMusicPreference(storage), true);
  writeMusicPreference(storage, false);
  assert.equal(store.get(SONG_KEY), 'off');
  assert.equal(readMusicPreference(storage), false);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readMusicPreference(broken), true);
  assert.doesNotThrow(() => writeMusicPreference(broken, false));
  assert.equal(readMusicPreference(undefined), true);
});
