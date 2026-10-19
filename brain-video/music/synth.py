#!/usr/bin/env python3
"""Synthesise the background score for the brain atlas video.

Everything is generated from code (numpy + scipy), so the track is
royalty-free and every drum hit sits exactly on the beat grid defined in
timeline.json (150 BPM, 4/4). Besides the audio, the script writes
build/beatmap.json: the time of every kick, snare, crash, impact and
silent "gap", which the renderer uses to fire flashes and camera shakes
on the same instants the listener hears them.

Usage:  python3 music/synth.py            -> build/bgm.wav, build/beatmap.json
"""
import json
import pathlib

import numpy as np
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
from scipy.signal import fftconvolve, lfilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
TL = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))

SR = 44100
BPM = TL["meta"]["bpm"]
BEAT = 60.0 / BPM
BAR = BEAT * TL["meta"]["beatsPerBar"]
TOTAL_BARS = TL["meta"]["totalBars"]
DURATION = TOTAL_BARS * BAR
N = int(round(DURATION * SR))
RNG = np.random.default_rng(20261019)
TARGET_LUFS = -11.5


def T(bar, beat=0.0):
    """Seconds at a bar/beat position."""
    return bar * BAR + beat * BEAT


def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def tvec(dur):
    return np.arange(int(dur * SR)) / SR


# --------------------------------------------------------------------------
# Oscillators: band-limited wavetables, one table per octave
# --------------------------------------------------------------------------
TABLE_N = 4096


def _tables(kind):
    x = np.arange(TABLE_N) / TABLE_N
    out = []
    for octave in range(12):
        fmax = 20.0 * 2 ** octave
        nh = int(min(TABLE_N // 2 - 1, (SR / 2) / fmax))
        tbl = np.zeros(TABLE_N)
        for k in range(1, max(nh, 1) + 1):
            if kind == "square" and k % 2 == 0:
                continue
            tbl += np.sin(2 * np.pi * k * x) / k
        out.append((fmax, tbl / np.max(np.abs(tbl))))
    return out


TABLES = {"saw": _tables("saw"), "square": _tables("square")}


def osc(kind, freq, n, phase0=0.0):
    """freq: scalar Hz or per-sample array."""
    if kind == "sine":
        if np.isscalar(freq):
            ph = phase0 + np.arange(n) * freq / SR
        else:
            ph = phase0 + np.cumsum(freq) / SR
        return np.sin(2 * np.pi * ph)
    fpeak = freq if np.isscalar(freq) else float(np.max(freq))
    tbl = next((t for f, t in TABLES[kind] if f >= fpeak), TABLES[kind][-1][1])
    if np.isscalar(freq):
        ph = phase0 + np.arange(n) * freq / SR
    else:
        ph = phase0 + np.cumsum(freq) / SR
    idx = (ph % 1.0) * TABLE_N
    i0 = idx.astype(np.int64)
    frac = idx - i0
    return tbl[i0 % TABLE_N] * (1 - frac) + tbl[(i0 + 1) % TABLE_N] * frac


def noise(n):
    return RNG.standard_normal(n)


# --------------------------------------------------------------------------
# Filters (RBJ biquads), static or swept block by block
# --------------------------------------------------------------------------
def biquad_coef(kind, fc, q=0.707, gain_db=0.0):
    fc = float(np.clip(fc, 10.0, SR * 0.45))
    w0 = 2 * np.pi * fc / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2 * q)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "bp":
        b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        A = 10 ** (gain_db / 40)
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        A = 10 ** (gain_db / 40)
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b, a = np.array(b), np.array(a)
    return b / a[0], a / a[0]


def filt(x, kind, fc, q=0.707, gain_db=0.0):
    b, a = biquad_coef(kind, fc, q, gain_db)
    return lfilter(b, a, x, axis=-1)


def sweep(x, kind, fc_of_t, q=0.707, block=256):
    """Time-varying biquad; fc_of_t maps block start time (s) -> cutoff."""
    y = np.empty_like(x)
    zi = np.zeros(2)
    for s in range(0, len(x), block):
        b, a = biquad_coef(kind, fc_of_t(s / SR), q)
        y[s:s + block], zi = lfilter(b, a, x[s:s + block], zi=zi)
    return y


def env_ad(n, attack, decay_tau, release=0.0, hold=None):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(attack, 1e-4)) * np.exp(-np.maximum(t - attack, 0) / decay_tau)
    if release > 0:
        r = int(release * SR)
        if 0 < r < n:
            e[-r:] *= np.linspace(1, 0, r)
    return e


def env_gate(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a > 0:
        e[:a] = np.linspace(0, 1, a)
    if r > 0:
        e[-r:] *= np.linspace(1, 0, min(r, n))
    return e


# --------------------------------------------------------------------------
# Mixing buses
# --------------------------------------------------------------------------
class Bus:
    def __init__(self):
        self.x = np.zeros((2, N + SR * 4))

    def add(self, t, sig, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if sig.ndim == 1:
            l = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
            r = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
            sig = np.stack([sig * l, sig * r])
        j = min(i + sig.shape[1], self.x.shape[1])
        if j > i:
            self.x[:, i:j] += gain * sig[:, : j - i]


BUS = {k: Bus() for k in ("drums", "bass", "synth", "fx", "room", "hall", "delay")}
EVENTS = {"kick": [], "snare": [], "crash": [], "impact": [], "tom": [], "stab": [], "gap": []}


def send(t, sig, bus, gain=1.0, pan=0.0, room=0.0, hall=0.0, delay=0.0):
    BUS[bus].add(t, sig, gain, pan)
    if room:
        BUS["room"].add(t, sig, gain * room, pan)
    if hall:
        BUS["hall"].add(t, sig, gain * hall, pan)
    if delay:
        BUS["delay"].add(t, sig, gain * delay, pan)


# --------------------------------------------------------------------------
# Drums and percussion
# --------------------------------------------------------------------------
_METAL = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.71


def metallic(n):
    s = sum(osc("square", f, n, RNG.random()) for f in _METAL)
    return s / len(_METAL)


def kick(t, vel=1.0, big=False):
    dur = 0.65 if big else 0.45
    tt = tvec(dur)
    f = (42 if big else 50) + (130 if big else 120) * np.exp(-tt / 0.026)
    body = osc("sine", f, len(tt)) * np.exp(-tt / (0.26 if big else 0.14)) * np.minimum(1, tt / 0.0015)
    click = filt(noise(len(tt)), "hp", 2500) * np.exp(-tt / 0.004) * 0.35
    sig = np.tanh(2.0 * (body + click)) / np.tanh(2.0)
    send(t, sig, "drums", 0.5 * vel, room=0.05)
    EVENTS["kick"].append([round(t, 4), round(vel, 2)])


def snare(t, vel=1.0, clap=True, tone=185.0, verb=0.25, log=True):
    tt = tvec(0.5)
    n = len(tt)
    body = osc("sine", tone + 45 * np.exp(-tt / 0.012), n) * np.exp(-tt / 0.07) * 0.7
    nz = filt(noise(n), "bp", 3800, 0.6) * np.exp(-tt / 0.11) + filt(noise(n), "hp", 7000) * np.exp(-tt / 0.045) * 0.5
    sig = body + nz * 0.9
    if clap:
        c = np.zeros(n)
        for k, d in enumerate((0.0, 0.010, 0.021)):
            i = int(d * SR)
            c[i:] += np.exp(-tt[: n - i] / (0.006 if k < 2 else 0.09))
        sig += filt(noise(n), "bp", 1600, 1.1) * c * 0.8
    sig = np.tanh(1.6 * sig) * 0.8
    send(t, sig, "drums", 0.62 * vel, room=0.12, hall=verb * 0.5)
    if log:
        EVENTS["snare"].append([round(t, 4), round(vel, 2)])


def hat(t, vel=0.5, open_=False, pan=0.15):
    dur = 0.45 if open_ else 0.09
    tt = tvec(dur)
    n = len(tt)
    sig = filt(metallic(n) * 0.6 + noise(n) * 0.4, "hp", 7200)
    sig *= np.exp(-tt / (0.16 if open_ else 0.028))
    send(t, sig, "drums", 0.36 * vel, pan, room=0.08)


def shaker(t, vel=0.4, pan=-0.3):
    tt = tvec(0.07)
    sig = filt(noise(len(tt)), "bp", 9000, 0.8) * np.minimum(1, tt / 0.012) * np.exp(-tt / 0.02)
    send(t, sig, "drums", 0.18 * vel, pan)


def crash(t, vel=1.0, dur=2.6):
    tt = tvec(dur)
    n = len(tt)
    env = np.minimum(1, tt / 0.002) * np.exp(-tt / 0.85)
    L = filt(metallic(n) * 0.5 + noise(n), "hp", 3800) * env
    R = filt(metallic(n) * 0.5 + noise(n), "hp", 3800) * env
    send(t, np.stack([L, R]), "drums", 0.24 * vel, hall=0.35)
    EVENTS["crash"].append([round(t, 4), round(vel, 2)])


def reverse_crash(t_end, dur=1.6, vel=1.0):
    tt = tvec(dur)
    n = len(tt)
    env = np.exp(-tt / 0.6)
    L = (filt(noise(n), "hp", 3000) * env)[::-1]
    R = (filt(noise(n), "hp", 3000) * env)[::-1]
    send(t_end - dur, np.stack([L, R]), "fx", 0.22 * vel, hall=0.2)


def tom(t, f0, vel=1.0, pan=0.0):
    tt = tvec(0.5)
    n = len(tt)
    body = osc("sine", f0 * (1 + 0.55 * np.exp(-tt / 0.035)), n) * np.exp(-tt / 0.22)
    thump = filt(noise(n), "lp", 1200) * np.exp(-tt / 0.02) * 0.4
    sig = np.tanh(2.2 * (body + thump)) * 0.8
    send(t, sig, "drums", 0.5 * vel, pan, room=0.15, hall=0.15)
    EVENTS["tom"].append([round(t, 4), round(vel, 2)])


def impact(t, strength=1.0):
    tt = tvec(3.0)
    n = len(tt)
    sub = osc("sine", 30 + 70 * np.exp(-tt / 0.07), n) * np.exp(-tt / (0.9 + 0.4 * strength))
    thud = filt(noise(n), "lp", 260) * np.exp(-tt / 0.12) * 1.4
    air = filt(noise(n), "hp", 2500) * np.exp(-tt / 0.45) * 0.18
    sig = np.tanh(1.8 * (sub + thud)) + air
    send(t, sig, "fx", 0.34 * strength, hall=0.4 * strength)
    EVENTS["impact"].append([round(t, 4), round(strength, 2)])


def sub_drop(t, dur=2.0, vel=1.0):
    tt = tvec(dur)
    sig = osc("sine", 30 + 55 * np.exp(-tt / 0.5), len(tt)) * np.exp(-tt / 0.9) * np.minimum(1, tt / 0.01)
    send(t, sig, "fx", 0.25 * vel)


def heartbeat(t, vel=1.0):
    for k, (d, g, f) in enumerate(((0.0, 1.0, 58.0), (0.17, 0.6, 66.0))):
        tt = tvec(0.35)
        sig = osc("sine", f + 40 * np.exp(-tt / 0.03), len(tt)) * np.exp(-tt / 0.09) * np.minimum(1, tt / 0.003)
        sig = filt(np.tanh(2.5 * sig), "lp", 400)
        send(t + d, sig, "drums", 0.5 * vel * g, room=0.05)
        if k == 0:
            EVENTS["kick"].append([round(t, 4), round(0.5 * vel, 2)])


def riser(t0, dur, vel=1.0):
    tt = tvec(dur)
    n = len(tt)
    prog = tt / dur
    nz = noise(n)
    sig = sweep(nz, "bp", lambda s: 250 * (36 ** (s / dur)), q=1.2) * (prog ** 2.2)
    tone = osc("saw", midi_hz(50) * 2 ** (3 * prog), n) * (prog ** 2.5) * 0.25
    tone = sweep(tone, "lp", lambda s: 400 + 6000 * (s / dur) ** 2, q=0.8)
    L = sig + tone
    R = np.roll(sig, 97) + tone
    send(t0, np.stack([L, R]), "fx", 0.30 * vel, hall=0.25)


# --------------------------------------------------------------------------
# Tonal instruments
# --------------------------------------------------------------------------
CHORDS = {
    "Dm": [50, 57, 62, 65, 69],
    "Bb": [46, 53, 58, 62, 65],
    "F": [48, 53, 60, 65, 69],
    "C": [48, 55, 60, 64, 67],
    "A": [45, 52, 57, 61, 64],
}
ROOTS = {"Dm": 38, "Bb": 34, "F": 41, "C": 36, "A": 33}
ARP = {
    "Dm": [62, 65, 69, 74],
    "Bb": [58, 62, 65, 70],
    "F": [60, 65, 69, 72],
    "C": [60, 64, 67, 72],
    "A": [57, 61, 64, 69],
}


def supersaw(t, notes, dur, cutoff=3500.0, vel=1.0, voices=7, spread=0.17, attack=0.006,
             release=0.08, cutoff_end=None, hall=0.18, gate=None):
    n = int((dur + release) * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    det = np.linspace(-spread, spread, voices)
    for m in notes:
        for k, d in enumerate(det):
            v = osc("saw", float(midi_hz(m + d)), n, RNG.random())
            if k % 2:
                L += v * 0.75
                R += v * 0.35
            else:
                R += v * 0.75
                L += v * 0.35
    norm = 1.0 / (len(notes) * voices) ** 0.5
    if cutoff_end is None:
        L, R = filt(L, "lp", cutoff, 0.8), filt(R, "lp", cutoff, 0.8)
    else:
        f = lambda s: cutoff * (cutoff_end / cutoff) ** min(1.0, s / dur)
        L, R = sweep(L, "lp", f, 0.9), sweep(R, "lp", f, 0.9)
    env = env_gate(n, attack, release)
    if gate is not None:
        env = env * gate(np.arange(n) / SR)
    send(t, np.stack([L, R]) * env * norm, "synth", 0.8 * vel, hall=hall)


def stab(t, chord, vel=1.0, cutoff=5000.0):
    supersaw(t, CHORDS[chord] + [CHORDS[chord][2] + 12], 0.22, cutoff=cutoff, vel=1.25 * vel, release=0.18, hall=0.35)
    EVENTS["stab"].append([round(t, 4), round(vel, 2)])


def pad(t, notes, dur, cutoff=1300.0, vel=1.0):
    n = int((dur + 1.2) * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for m in notes:
        for k, d in enumerate((-0.12, -0.04, 0.05, 0.13)):
            lfo = 1 + 0.0015 * np.sin(2 * np.pi * (0.3 + 0.1 * k) * np.arange(n) / SR + k)
            v = osc("saw", float(midi_hz(m + d)) * lfo, n, RNG.random())
            (L if k % 2 else R).__iadd__(v)
    env = env_gate(n, 0.6, 1.2)
    L, R = filt(L, "lp", cutoff, 0.7), filt(R, "lp", cutoff, 0.7)
    norm = 1.0 / (len(notes) * 2) ** 0.5
    send(t, np.stack([L, R]) * env * norm, "synth", 0.5 * vel, hall=0.45)


def bass(t, midi, dur, vel=1.0, bright=1.0):
    n = int((dur + 0.02) * SR)
    f = float(midi_hz(midi))
    x = osc("saw", f, n) * 0.7 + osc("square", f * 0.5, n) * 0.4
    x = sweep(x, "lp", lambda s: 180 + 1500 * bright * np.exp(-s / 0.07), q=1.3, block=128)
    sub = osc("sine", f if f < 70 else f / 2, n) * 0.55
    sig = (np.tanh(1.5 * x) * 0.7 + sub) * env_gate(n, 0.003, 0.03)
    send(t, sig, "bass", 0.32 * vel)


def pluck(t, midi, vel=1.0, pan=0.0, bright=1.0):
    tt = tvec(0.45)
    n = len(tt)
    f = float(midi_hz(midi))
    x = osc("square", f, n) * 0.5 + osc("saw", f * 1.003, n) * 0.5
    x = sweep(x, "lp", lambda s: 300 + 5200 * bright * np.exp(-s / 0.06), q=1.0, block=128)
    sig = x * np.exp(-tt / 0.16) * np.minimum(1, tt / 0.002)
    send(t, sig, "synth", 0.36 * vel, pan, hall=0.15, delay=0.35)


def lead(t, midi, dur, vel=1.0, octave_double=False):
    n = int((dur + 0.15) * SR)
    tt = np.arange(n) / SR
    vib = 1 + 0.0075 * np.sin(2 * np.pi * 5.6 * tt) * np.clip((tt - 0.18) / 0.2, 0, 1)
    f = float(midi_hz(midi)) * vib
    x = sum(osc("saw", f * 2 ** (d / 1200), n, RNG.random()) for d in (-9, 0, 9)) / 3
    x += osc("square", f * 0.5, n) * 0.25
    if octave_double:
        x += sum(osc("saw", f * 2 * 2 ** (d / 1200), n, RNG.random()) for d in (-7, 7)) / 2 * 0.45
    x = filt(np.tanh(1.4 * x), "lp", 4200, 0.9)
    sig = x * env_gate(n, 0.012, 0.12)
    send(t, sig, "synth", 0.5 * vel, 0.0, hall=0.3, delay=0.28)


def ostinato(t, midi, vel=1.0):
    tt = tvec(0.22)
    n = len(tt)
    f = float(midi_hz(midi))
    x = (osc("saw", f, n, RNG.random()) + osc("saw", f * 1.004, n, RNG.random())) * 0.5
    x = filt(x, "lp", 1100, 0.9)
    sig = x * np.exp(-tt / 0.07) * np.minimum(1, tt / 0.003)
    send(t, sig, "synth", 0.55 * vel, room=0.2, hall=0.12)


def braam(t, dur=3.2, vel=1.0):
    n = int((dur + 1.0) * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for m in (26, 38, 45, 50):
        for k, d in enumerate((-0.1, 0.0, 0.1)):
            v = osc("saw", float(midi_hz(m + d)), n, RNG.random())
            (L if k % 2 else R).__iadd__(v)
            (R if k % 2 else L).__iadd__(v * 0.5)

    def fc(s):
        return 160 + 2400 * np.exp(-max(s - 0.12, 0) / 0.6) * min(1.0, s / 0.12)

    L, R = sweep(L, "lp", fc, 1.1), sweep(R, "lp", fc, 1.1)
    env = env_gate(n, 0.02, 1.0) * np.exp(-np.arange(n) / SR / 2.5)
    sig = np.tanh(1.7 * np.stack([L, R]) / 6) * env
    send(t, sig, "fx", 0.42 * vel, hall=0.3)


def bell(t, midi, vel=1.0, pan=0.0):
    tt = tvec(2.5)
    f = float(midi_hz(midi))
    idx = 2.2 * np.exp(-tt / 0.4)
    sig = np.sin(2 * np.pi * f * tt + idx * np.sin(2 * np.pi * f * 3.5 * tt)) * np.exp(-tt / 1.0)
    send(t, sig * np.minimum(1, tt / 0.003), "synth", 0.24 * vel, pan, hall=0.5, delay=0.3)


# --------------------------------------------------------------------------
# Patterns
# --------------------------------------------------------------------------
MEL_A = [  # (beat offset within 8 bars, midi, length in beats) over Dm Bb F C
    (0, 69, 1), (1, 74, 1), (2, 76, 1), (3, 77, 1), (4, 77, 2), (6, 79, 1), (7, 77, 1),
    (8, 81, 2), (10, 79, 1), (11, 77, 1), (12, 76, 3), (15, 72, 1),
    (16, 74, 1), (17, 69, 1), (18, 74, 1), (19, 76, 1), (20, 77, 1), (21, 79, 1), (22, 82, 2),
    (24, 84, 2), (26, 81, 1), (27, 79, 1), (28, 79, 2), (30, 76, 2),
]
MEL_B = [  # over Bb C Dm A
    (0, 77, 1), (1, 74, 1), (2, 77, 1), (3, 79, 1), (4, 79, 2), (6, 76, 1), (7, 79, 1),
    (8, 81, 2), (10, 77, 1), (11, 74, 1), (12, 76, 2), (14, 73, 2),
    (16, 77, 1), (17, 79, 1), (18, 81, 1), (19, 82, 1), (20, 84, 2), (22, 82, 1), (23, 79, 1),
    (24, 81, 3), (27, 77, 1), (28, 76, 4),
]
PROG_A = ["Dm", "Bb", "F", "C"]
PROG_B = ["Bb", "C", "Dm", "A"]
PROG_A2 = ["Bb", "C", "Dm", "Dm"]


def play_melody(bar0, mel, half=None, vel=1.0, octave_double=False):
    for beat, m, ln in mel:
        if half == 0 and beat >= 16:
            continue
        if half == 1:
            if beat < 16:
                continue
            beat -= 16
        lead(T(bar0, beat), m, ln * BEAT * 0.97, vel, octave_double)


def drums_halftime(bar, fill=False, big_fill=False, vel=1.0):
    for b in (0, 0.75, 2.5):
        kick(T(bar, b), vel)
    snare(T(bar, 2), vel)
    if bar % 2:
        snare(T(bar, 3.75), 0.35 * vel, clap=False, log=False)
    for k in range(16):
        b = k / 4
        if fill and b >= (2 if big_fill else 3):
            continue
        hat(T(bar, b), (0.75 if k % 2 == 0 else 0.4) * vel, open_=(k == 6), pan=0.2 if k % 2 else -0.1)
    if fill:
        toms = [190, 160, 130, 105] if not big_fill else [220, 200, 175, 160, 140, 125, 110, 95]
        start = 3 if not big_fill else 2
        for i, f in enumerate(toms):
            tom(T(bar, start + i * 0.25), 0.8 + 0.05 * i, pan=0.5 - i * (1.0 / len(toms)))


def drums_fulltime(bar, fill=False, big_fill=False, vel=1.0, extra=False):
    for b in range(4):
        if fill and big_fill and b >= 2:
            continue
        kick(T(bar, b), vel)
    if extra:
        kick(T(bar, 3.5), 0.6 * vel)
    for b in (1, 3):
        if fill and b == 3:
            continue
        snare(T(bar, b), vel)
    for k in range(16):
        b = k / 4
        if fill and b >= (2 if big_fill else 3):
            continue
        is_off = k % 4 == 2
        hat(T(bar, b), (0.8 if is_off else 0.45) * vel, open_=is_off, pan=0.2 if k % 2 else -0.15)
        if extra and k % 2:
            shaker(T(bar, b), 0.6)
    if fill:
        if big_fill:
            for i, f in enumerate([220, 200, 175, 160, 140, 125, 110, 95]):
                tom(T(bar, 2 + i * 0.25), 0.8 + 0.04 * i, pan=0.6 - i * 0.15)
        else:
            for i in range(4):
                snare(T(bar, 3 + i * 0.25), 0.55 + 0.12 * i, clap=False, log=i == 0)


def bass_line(bar, chord, style="eighths", vel=1.0, bright=1.0):
    r = ROOTS[chord]
    if style == "eighths":
        pat = [r, r, r + 12, r, r, r + 12, r, r + 7]
        for i, m in enumerate(pat):
            bass(T(bar, i * 0.5), m, BEAT * 0.45, vel, bright)
    elif style == "sixteenths":
        for i in range(16):
            m = r + (12 if i % 4 == 2 else 0)
            bass(T(bar, i * 0.25), m, BEAT * 0.22, vel * (1.0 if i % 2 == 0 else 0.8), bright)
    elif style == "whole":
        bass(T(bar, 0), r, BAR * 0.98, vel, bright * 0.3)


def arp_line(bar, chord, vel=1.0, bright=1.0, octave=0):
    notes = ARP[chord]
    order = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2]
    for i, k in enumerate(order):
        pluck(T(bar, i * 0.25), notes[k] + 12 * octave, vel * (1.0 if i % 4 == 0 else 0.7),
              pan=-0.35 if i % 2 else 0.35, bright=bright)


def chords_bar(bar, chord, cutoff=3500.0, vel=1.0, pumping=True):
    supersaw(T(bar), CHORDS[chord], BAR * 0.99, cutoff=cutoff, vel=vel)


def gap(t0, t1):
    EVENTS["gap"].append([round(t0, 4), round(t1, 4)])


# --------------------------------------------------------------------------
# Arrangement (bar numbers match timeline.json)
# --------------------------------------------------------------------------
def arrange():
    # INTRO 0-7 -------------------------------------------------------------
    for i, ch in enumerate(["Dm", "Bb", "F", "C"]):
        pad(T(2 * i), CHORDS[ch], 2 * BAR, cutoff=500 + 260 * i, vel=1.0)
    for bar in range(8):
        for b in (0, 2):
            heartbeat(T(bar, b), 0.8 + 0.03 * bar)
        if bar >= 2:
            for k in range(8):
                hat(T(bar, k * 0.5), 0.25 + 0.04 * (bar - 2), pan=0.3)
        if bar >= 4:
            ch = ["F", "F", "C", "C"][bar - 4]
            r = ROOTS[ch] + 12
            pat = [r, r, r + 12, r, r + 7, r, r + 12, r] * 2
            for k, m in enumerate(pat):
                ostinato(T(bar, k * 0.25), m, 0.7 + 0.1 * (bar - 4) + (0.25 if k % 4 == 0 else 0))
    for bar, s in ((0, 0.6), (2, 0.7), (4, 0.75), (6, 0.85)):
        impact(T(bar), s)
    reverse_crash(T(8), 1.6)

    # BUILD 1 8-11 --------------------------------------------------------
    for i, ch in enumerate(PROG_A):
        bar = 8 + i
        supersaw(T(bar), CHORDS[ch], BAR * 0.99, cutoff=500 * (2.2 ** i), cutoff_end=500 * (2.2 ** (i + 1)),
                 vel=0.8, gate=lambda tt: 0.55 + 0.45 * ((tt / (BEAT / 2)) % 1 < 0.6))
        bass_line(bar, ch, "eighths", 0.8, bright=0.4 + 0.2 * i)
        r = ROOTS[ch] + 12
        for k in range(16):
            ostinato(T(bar, k * 0.25), r + (12 if k % 4 == 2 else 0), 0.9)
        for k in range(16):
            hat(T(bar, k * 0.25), 0.3 + 0.1 * i, pan=0.25)
    for bar in (8, 9, 10):
        for b in range(4):
            kick(T(bar, b), 0.9)
    for k in range(7):
        kick(T(11, k * 0.5), 0.9)
    roll = [(8, 1.0), (9, 0.5), (10, 0.25), (11, 0.125)]
    for bar, step in roll:
        b = 0.0
        while b < 4 - 1e-6:
            if bar == 11 and b >= 3.5 - 1e-6:
                break
            pos = (bar - 8) + b / 4
            snare(T(bar, b), 0.35 + 0.17 * pos, clap=False, tone=170 + 40 * pos, verb=0.1, log=(step >= 0.5))
            b += step
    riser(T(8), 4 * BAR - 0.5 * BEAT, 1.0)
    gap(T(11, 3.5), T(12))

    # DROP 1 12-15 --------------------------------------------------------
    impact(T(12), 1.0)
    braam(T(12), 2 * BAR, 1.0)
    sub_drop(T(12), 2.5)
    crash(T(12), 1.0)
    crash(T(14), 0.8)
    for i, bar in enumerate(range(12, 16)):
        ch = PROG_A[i]
        chords_bar(bar, ch, cutoff=4200)
        bass_line(bar, ch, "eighths", 1.0, 1.0)
        drums_halftime(bar, fill=(bar == 15))

    # GROOVE A 16-59 (11 scenes x 4 bars) ----------------------------------
    for bar in range(16, 60):
        local = bar - 16
        scene_start = local % 4 == 0
        scene_end = local % 4 == 3
        prog = PROG_A if bar < 44 else PROG_A2
        ch = prog[local % 4]
        if scene_start:
            crash(T(bar), 0.85)
            impact(T(bar), 0.45 if bar not in (44,) else 0.8)
        big = bar in (43,)
        drums_halftime(bar, fill=scene_end, big_fill=big)
        bass_line(bar, ch, "eighths", 1.0, 0.9 if bar < 28 else 1.1)
        chords_bar(bar, ch, cutoff=2600 if bar < 28 else 3600, vel=0.85 if bar < 28 else 0.95)
        if bar >= 20:
            arp_line(bar, ch, vel=0.7 if bar < 28 else 0.9, bright=0.6 if bar < 28 else 1.0)
        if bar >= 36:
            for k in range(16):
                if k % 2:
                    shaker(T(bar, k / 4), 0.7)
        if bar >= 44 and local % 4 == 0:
            pad(T(bar), CHORDS[prog[0]] + [74], 4 * BAR, cutoff=1500, vel=0.6)
        if bar >= 52:
            for k, m in enumerate(ARP[ch][::-1]):
                bell(T(bar, k), m + 12, 0.6, pan=-0.4 + 0.27 * k)
    reverse_crash(T(44), 1.2, 0.8)

    # BREAKDOWN 60-63 -------------------------------------------------------
    impact(T(60), 0.6)
    crash(T(60), 0.7)
    for i, ch in enumerate(PROG_A):
        bar = 60 + i
        pad(T(bar), CHORDS[ch], BAR, cutoff=900, vel=1.0)
        bass_line(bar, ch, "whole", 0.6)
        for b in (0, 2):
            heartbeat(T(bar, b), 0.9)
        for k in range(8):
            pluck(T(bar, k * 0.5), ARP[ch][[0, 2, 1, 3, 2, 1, 3, 2][k]] + 12, 0.8, pan=-0.3 if k % 2 else 0.3, bright=0.45)
    reverse_crash(T(64), 1.6)

    # BUILD 2 64-67 -------------------------------------------------------
    for i, ch in enumerate(PROG_B):
        bar = 64 + i
        for b in range(4):
            if bar == 67 and b == 3:
                stab(T(bar, b), ch, 1.0, cutoff=7000)
                break
            stab(T(bar, b), ch, 0.7 + 0.1 * i, cutoff=1500 * (1.5 ** i) * (1 + 0.1 * b))
            kick(T(bar, b), 0.9)
        bass_line(bar, ch, "eighths", 0.9, bright=0.5 + 0.2 * i)
        for k in range(16):
            hat(T(bar, k * 0.25), 0.35 + 0.1 * i, pan=0.25)
    for bar, step in [(64, 1.0), (65, 0.5), (66, 0.25), (67, 0.125)]:
        b = 0.0
        while b < 4 - 1e-6:
            if bar == 67 and b >= 3.5 - 1e-6:
                break
            pos = (bar - 64) + b / 4
            snare(T(bar, b), 0.35 + 0.17 * pos, clap=False, tone=170 + 45 * pos, verb=0.1, log=(step >= 0.5))
            b += step
    riser(T(64), 4 * BAR - 0.5 * BEAT, 1.15)
    gap(T(67, 3.5), T(68))

    # DROP 2 68-75 ----------------------------------------------------------
    impact(T(68), 1.25)
    braam(T(68), 2 * BAR, 1.2)
    sub_drop(T(68), 2.5, 1.2)
    for bar in (68, 70, 72, 74):
        crash(T(bar), 1.0 if bar == 68 else 0.8)
        if bar != 68:
            impact(T(bar), 0.5)
    for i, bar in enumerate(range(68, 76)):
        ch = PROG_A[i % 4]
        drums_fulltime(bar, fill=(bar == 75))
        bass_line(bar, ch, "sixteenths", 1.0, 1.1)
        chords_bar(bar, ch, cutoff=4500, vel=1.0)
        arp_line(bar, ch, 0.8, 1.0, octave=1 if i >= 4 else 0)
    play_melody(68, MEL_A, vel=1.0)

    # GROOVE B 76-123 (6 phrases x 8 bars) -----------------------------------
    phrases = [  # (start bar, progression, melody, which half, octave-double)
        (76, PROG_A, MEL_A, 0, False),
        (84, PROG_A, MEL_A, 1, False),
        (92, PROG_A, MEL_A, 1, True),
        (100, PROG_B, MEL_B, 0, False),
        (108, PROG_B, MEL_B, 1, False),
        (116, PROG_B, MEL_B, 1, True),
    ]
    for p0, prog, mel, half, dbl in phrases:
        crash(T(p0), 1.0)
        impact(T(p0), 0.7 if p0 != 100 else 0.9)
        for k in range(8):
            bar = p0 + k
            ch = prog[k % 4]
            last = k == 7
            big = bar in (99,)
            drums_fulltime(bar, fill=last, big_fill=big, extra=(k >= 4))
            bass_line(bar, ch, "sixteenths", 1.0, 0.9 if k < 4 else 1.15)
            chords_bar(bar, ch, cutoff=3000 if k < 4 else 4800, vel=0.85 if k < 4 else 1.0)
            arp_line(bar, ch, 0.75 if k < 4 else 0.9, 0.8 if k < 4 else 1.1, octave=0 if k < 4 else 1)
            if k == 4:
                crash(T(bar), 0.6)
        play_melody(p0 + 4, mel, half=half, vel=0.95, octave_double=dbl)
    reverse_crash(T(100), 1.2, 0.8)

    # FINALE 124-131 ----------------------------------------------------------
    crash(T(124), 1.1)
    impact(T(124), 1.0)
    for i, bar in enumerate(range(124, 130)):
        ch = PROG_A[i % 4]
        if bar in (124, 125):
            for b in range(4):
                stab(T(bar, b), ch, 1.0, cutoff=6500)
        drums_fulltime(bar, extra=True, fill=(bar == 129))
        if bar in (126, 128):
            crash(T(bar), 0.8)
            impact(T(bar), 0.6)
        if bar in (128, 129):
            for b in range(4):
                snare(T(bar, b + 0.5), 0.45, clap=True, log=False)
        bass_line(bar, ch, "sixteenths", 1.05, 1.2)
        chords_bar(bar, ch, cutoff=5500, vel=1.05)
        arp_line(bar, ch, 0.9, 1.2, octave=1)
    play_melody(124, MEL_A, half=1, vel=1.05, octave_double=True)
    for k in range(8):
        snare(T(129, 2 + k * 0.125), 0.4 + 0.08 * k, clap=False, tone=200 + 10 * k, verb=0.1, log=False)
    gap(T(129, 3.5), T(130))
    impact(T(130), 1.35)
    braam(T(130), 2 * BAR, 1.25)
    sub_drop(T(130), 3.0, 1.2)
    crash(T(130), 1.2, dur=4.0)
    kick(T(130), 1.0, big=True)
    supersaw(T(130), CHORDS["Dm"] + [74, 77], 2 * BAR, cutoff=5000, cutoff_end=900, vel=1.0, release=1.5, hall=0.5)
    bass(T(130), 38, 2 * BAR, 1.0, 0.6)

    # OUTRO 132-135 -------------------------------------------------------------
    for i, ch in enumerate(["Bb", "F", "C", "Dm"]):
        pad(T(132 + i), CHORDS[ch], BAR, cutoff=1100 - 150 * i, vel=0.9 - 0.12 * i)
    for k, m in enumerate([74, 69, 65, 62, 57, 62]):
        bell(T(132, k * 1.5), m + 12, 0.7 - 0.08 * k, pan=-0.4 + 0.16 * k)


# --------------------------------------------------------------------------
# Effects, sidechain and master
# --------------------------------------------------------------------------
def make_ir(rt60, length, predelay=0.018, damp=5500.0, seed=7):
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    env = np.exp(-6.91 * t / rt60)
    irs = []
    for _ in range(2):
        x = rng.standard_normal(n) * env
        x = filt(x, "lp", damp, 0.5)
        x = filt(x, "hp", 180)
        x = np.concatenate([np.zeros(int(predelay * SR)), x])
        irs.append(x / np.sqrt(np.sum(x ** 2)))
    return irs


def reverb(bus, rt60, length, damp):
    irL, irR = make_ir(rt60, length, damp=damp)
    x = bus.x
    L = fftconvolve(x[0], irL)[: x.shape[1]]
    R = fftconvolve(x[1], irR)[: x.shape[1]]
    return np.stack([L, R])


def pingpong(bus, delay_s, fb=0.42, taps=6):
    x = bus.x
    out = np.zeros_like(x)
    d = int(delay_s * SR)
    src = filt(x, "lp", 4500)
    src = filt(src, "hp", 400)
    for k in range(1, taps + 1):
        g = fb ** (k - 1)
        ch = (k + 1) % 2
        s = src[0] + src[1]
        out[ch, k * d:] += 0.5 * g * s[: x.shape[1] - k * d]
    return out


def sidechain_env(length, depth, tau=0.13):
    g = np.ones(length)
    seg = int(0.45 * SR)
    tt = np.arange(seg) / SR
    curve = 1 - depth * np.minimum(1, tt / 0.004) * np.exp(-tt / tau)
    for tk, vel in EVENTS["kick"]:
        i = int(round(tk * SR))
        j = min(i + seg, length)
        if j > i:
            c = 1 - (1 - curve[: j - i]) * min(1.0, vel)
            g[i:j] = np.minimum(g[i:j], c)
    return g


def gap_env(length):
    g = np.ones(length)
    f = int(0.006 * SR)
    for t0, t1 in EVENTS["gap"]:
        i, j = int(t0 * SR), int(t1 * SR)
        g[i:j] = 0.0
        g[i - f:i] = np.minimum(g[i - f:i], np.linspace(1, 0, f))
    return g


def limiter(x, ceiling=0.89, lookahead=0.004):
    la = int(lookahead * SR)
    peak = np.max(np.abs(x), axis=0)
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    g = minimum_filter1d(g, 2 * la + 1)
    g = uniform_filter1d(g, la * 2 + 1)
    # release: let gain recover smoothly instead of snapping back
    g = -maximum_filter1d(-g, 1)
    b, a = [0.0015], [1, -(1 - 0.0015)]
    rec = lfilter(b, a, g - 1.0) + 1.0
    g = np.minimum(g, np.maximum(rec, g))
    return x * g


def lufs(x):
    """Integrated loudness (ITU-R BS.1770 K-weighting, simple gating)."""
    b1, a1 = biquad_coef("peak", 1681.97, 0.7072, 4.0)
    b2, a2 = biquad_coef("hp", 38.13, 0.5003)
    y = lfilter(b2, a2, lfilter(b1, a1, x, axis=-1), axis=-1)
    blk = int(0.4 * SR)
    hop = int(0.1 * SR)
    ms = []
    for s in range(0, y.shape[1] - blk, hop):
        ms.append(np.sum(np.mean(y[:, s:s + blk] ** 2, axis=1)))
    ms = np.array(ms)
    ld = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[ld > -70]
    rel = -0.691 + 10 * np.log10(np.mean(ms)) - 10
    ms = ms[-0.691 + 10 * np.log10(ms) > rel]
    return -0.691 + 10 * np.log10(np.mean(ms))


def master():
    L = N + SR * 4
    duck_bass = sidechain_env(L, 0.55, 0.11)
    duck_synth = sidechain_env(L, 0.42, 0.15)
    room = reverb(BUS["room"], 0.9, 1.4, 7000)
    hall = reverb(BUS["hall"], 2.6, 3.6, 5200)
    dly = pingpong(BUS["delay"], 0.75 * BEAT)
    mix = (
        BUS["drums"].x * 1.0
        + BUS["bass"].x * duck_bass * 0.9
        + BUS["synth"].x * duck_synth * 0.85
        + BUS["fx"].x * 0.9
        + room * 0.55
        + hall * duck_synth * 0.6
        + dly * duck_synth * 0.5
    )
    mix = filt(mix, "hp", 28, 0.7)
    mix = filt(mix, "lowshelf", 90, 0.7, 1.0)
    mix = filt(mix, "peak", 3500, 0.8, 2.0)
    mix = mix[:, :N]
    mix *= gap_env(N)
    fade = int(2.4 * SR)
    mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.5
    # gain-stage to a target loudness, then a look-ahead peak limiter at -1 dBFS
    mix *= 10 ** ((TARGET_LUFS - lufs(mix)) / 20)
    pre = np.max(np.abs(mix), axis=0)
    mix = limiter(mix, ceiling=0.891)
    gr = 20 * np.log10(np.maximum(pre, 1e-9) / np.maximum(np.max(np.abs(mix), axis=0), 1e-9))
    print(f"limiter: {np.mean(gr > 1):.1%} of samples above 1 dB reduction, max {gr.max():.1f} dB")
    return mix


def section_report(mix):
    rows = []
    for m in TL["music"]:
        a, b = int(T(m["bar"]) * SR), int(T(m["bar"] + m["len"]) * SR)
        seg = mix[:, a:b]
        rms = 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12)
        pk = 20 * np.log10(np.max(np.abs(seg)) + 1e-12)
        rows.append(f"  {m['section']:<10} bars {m['bar']:>3}-{m['bar'] + m['len'] - 1:<3} RMS {rms:6.1f} dBFS  peak {pk:5.1f} dBFS")
    return "\n".join(rows)


def write_wav(path, x):
    import wave
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    BUILD.mkdir(exist_ok=True)
    arrange()
    mix = master()
    write_wav(BUILD / "bgm.wav", mix)
    beatmap = {
        "bpm": BPM, "beat": BEAT, "bar": BAR, "duration": DURATION, "sampleRate": SR,
        **{k: sorted(v) for k, v in EVENTS.items()},
    }
    (BUILD / "beatmap.json").write_text(json.dumps(beatmap), encoding="utf-8")
    print(f"wrote {BUILD / 'bgm.wav'}  ({DURATION:.1f} s)")
    print(f"integrated loudness {lufs(mix):.1f} LUFS, sample peak {20 * np.log10(np.max(np.abs(mix))):.1f} dBFS")
    print(section_report(mix))
    print("events: " + ", ".join(f"{k} {len(v)}" for k, v in EVENTS.items()))


if __name__ == "__main__":
    main()
