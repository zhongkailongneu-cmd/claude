"""Procedurally synthesised BGM: 140 BPM epic electronic track in D minor (key change to E minor).

Writes bgm.wav and events.json (exact times of kicks, claps, crashes, impacts, risers, gaps)
so the renderer can lock every visual hit to the music.
"""
import json
import os
import wave

import numpy as np
from scipy import signal

from timeline import (SR, SPB, BEAT, BAR, TOTAL_BARS, DURATION, chord_at, IMPACTS, BRAAMS, RISERS, GAPS)

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(11)
N = int(DURATION * SR)


def S(bar, beat=0.0):
    """sample index of a bar/beat position"""
    return int(round((bar * 4 + beat) * SPB))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos"), x, axis=0)


def sweep_filter(x, fcs, kind="low", block=512, order=2):
    """time-varying filter: fcs is the cutoff per block (or center freq for band)."""
    y = np.zeros_like(x)
    zi = None
    for k, i in enumerate(range(0, len(x), block)):
        fc = float(np.clip(fcs[min(k, len(fcs) - 1)], 30, SR * 0.45))
        if kind == "band":
            sos = signal.butter(order, [fc / 1.6, min(fc * 1.6, SR * 0.45)], "band", fs=SR, output="sos")
        else:
            sos = signal.butter(order, fc, kind, fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        y[i:i + block], zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
    return y


def saw(freq, n, ph0=None):
    """PolyBLEP band-limited sawtooth; freq may be scalar or per-sample array."""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = (rng.random() if ph0 is None else ph0) + np.cumsum(dt)
    ph %= 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def sine(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.sin(2 * np.pi * (ph0 + np.cumsum(f) / SR))


def tvec(n):
    return np.arange(n) / SR


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, gate=None):
    gate = n / SR - r if gate is None else gate
    t = tvec(n)
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > gate
    if rel.any():
        g = np.interp(gate, t, e)
        e[rel] = g * np.exp(-(t[rel] - gate) / max(r / 4, 1e-6))
    return e


def pan2(x, p):
    """mono -> stereo, p in [-1, 1]"""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


def stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], 1)


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, start, sig, gain=1.0, p=0.0):
        sig = stereo(sig) if sig.ndim == 2 else pan2(sig, p)
        if start < 0:
            sig, start = sig[-start:], 0
        end = min(N, start + len(sig))
        if end > start:
            self.x[start:end] += gain * sig[:end - start]


# ============================================================== instruments
def kick(punch=1.0):
    n = int(0.5 * SR)
    t = tvec(n)
    f = 46 + 130 * np.exp(-t / 0.028) + 22 * np.exp(-t / 0.12)
    body = sine(f, n) * np.minimum(1, t / 0.0015) * np.exp(-t / 0.30)
    click = hp(rng.normal(size=n), 2500) * np.exp(-t / 0.004) * 0.35 * punch
    return np.tanh(2.0 * (body + click)) * 0.9


def heartbeat():
    n = int(0.6 * SR)
    t = tvec(n)

    def thump(amp, delay):
        tt = np.maximum(t - delay, 0)
        f = 38 + 55 * np.exp(-tt / 0.04)
        return amp * sine(f, n) * (t >= delay) * np.minimum(1, tt / 0.004) * np.exp(-tt / 0.16)
    return lp(np.tanh(1.6 * (thump(1.0, 0) + thump(0.75, 0.21))), 260)


def clap():
    n = int(0.45 * SR)
    t = tvec(n)
    nz = bp(rng.normal(size=n), 900, 5200)
    env = np.zeros(n)
    for k, d in enumerate([0, 0.008, 0.017, 0.026]):
        tt = t - d
        env += (tt >= 0) * np.exp(-np.maximum(tt, 0) / (0.005 if k < 3 else 0.11))
    tone = sine(195 * (1 + 0.25 * np.exp(-t / 0.01)), n) * np.exp(-t / 0.05) * 0.5
    wires = hp(rng.normal(size=n), 5000) * np.exp(-t / 0.07) * 0.35
    return np.tanh(1.4 * (nz * env * 0.8 + tone + wires))


def snare_hit(v=1.0):
    n = int(0.25 * SR)
    t = tvec(n)
    nz = bp(rng.normal(size=n), 1200, 9000) * np.exp(-t / 0.06)
    tone = sine(210, n) * np.exp(-t / 0.035) * 0.6
    return v * np.tanh(1.5 * (nz + tone))


METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def metallic(n):
    t = tvec(n)
    return sum(np.sign(np.sin(2 * np.pi * f * 1.9 * t + rng.random() * 6)) for f in METAL) / 6


def hat(open_=False):
    n = int((0.35 if open_ else 0.09) * SR)
    t = tvec(n)
    x = hp(0.6 * rng.normal(size=n) + 0.5 * metallic(n), 7000, 4)
    return x * np.exp(-t / (0.16 if open_ else 0.022))


def crash(dur=3.2):
    n = int(dur * SR)
    t = tvec(n)
    out = []
    for _ in range(2):
        x = hp(0.7 * rng.normal(size=n) + 0.4 * metallic(n), 3500, 2)
        out.append(x * np.exp(-t / 1.0) * np.minimum(1, t / 0.002))
    return np.stack(out, 1)


def tom(f0):
    n = int(0.4 * SR)
    t = tvec(n)
    f = f0 * (1 + 0.7 * np.exp(-t / 0.04))
    x = sine(f, n) * np.exp(-t / 0.2) + 0.15 * lp(rng.normal(size=n), 1500) * np.exp(-t / 0.05)
    return np.tanh(1.6 * x)


def impact(strength=1.0, dur=4.5):
    n = int(dur * SR)
    t = tvec(n)
    f = 30 + 70 * np.exp(-t / 0.35)
    boom = sine(f, n) * np.minimum(1, t / 0.002) * np.exp(-t / 1.3)
    nz = lp(rng.normal(size=n), 2200) * np.exp(-t / 0.22) * 0.55
    hitk = kick(1.4)
    x = boom + nz
    x[:len(hitk)] += 0.8 * hitk
    return np.tanh(1.5 * x) * strength


def braam(root_midi, dur=3.6):
    n = int(dur * SR)
    t = tvec(n)
    x = np.zeros(n)
    for m, g in [(root_midi - 24, 1.0), (root_midi - 12, 0.9), (root_midi - 5, 0.6), (root_midi, 0.5)]:
        for d in (-0.08, 0.0, 0.08):
            x += g * saw(mtof(m + d), n)
    fcs = []
    for k in range(0, n, 512):
        tk = k / SR
        fcs.append(160 + 2600 * min(1, tk / 0.18) * np.exp(-max(0, tk - 0.18) / 1.0))
    y = sweep_filter(x, fcs, "low")
    env = np.minimum(1, t / 0.04) * np.exp(-t / 1.6)
    return np.tanh(1.8 * y * env / 6) * 1.1


def riser(dur):
    n = int(dur * SR)
    t = tvec(n)
    u = t / dur
    nz = rng.normal(size=n)
    centers = [300 * (8000 / 300) ** ((k / SR) / dur) for k in range(0, n, 512)]
    x = sweep_filter(nz, centers, "band") * 0.8
    f = 180 * 2 ** (3.2 * u)
    tone = (saw(f, n) + saw(f * 1.006, n)) * 0.18
    tone = lp(tone, 5000)
    return (x + tone) * u ** 2.2


def reverse_cymbal(dur):
    c = crash(dur + 0.2)[:int(dur * SR)][::-1]
    return c * np.linspace(0, 1, len(c))[:, None] ** 1.5


def downlifter(dur=3.0):
    n = int(dur * SR)
    u = tvec(n) / dur
    centers = [6000 * (150 / 6000) ** ((k / SR) / dur) for k in range(0, n, 512)]
    return sweep_filter(rng.normal(size=n), centers, "band") * (1 - u) ** 2 * 0.7


def subdrop(dur=1.8):
    n = int(dur * SR)
    t = tvec(n)
    return sine(30 + 55 * np.exp(-t / 0.5), n) * np.exp(-t / 0.9) * np.minimum(1, t / 0.003)


_bass_cache = {}


def bass_note(m, heavy=False):
    key = (m, heavy)
    if key not in _bass_cache:
        n = int(0.14 * SR)
        t = tvec(n)
        f = mtof(m)
        x = saw(f, n, 0) + 0.7 * saw(f * 1.004, n, 0.3) + 0.9 * sine(f, n)
        x = lp(x, 1500 if heavy else 950)
        env = np.minimum(1, t / 0.002) * np.exp(-t / 0.075)
        y = x * env
        if heavy:
            y = np.tanh(2.2 * y) * 0.8
        _bass_cache[key] = y
    return _bass_cache[key]


def supersaw(notes, dur, cutoff=5200, attack=0.01, release=0.25, voices=7, spread=0.18):
    n = int((dur + release) * SR)
    L, R = np.zeros(n), np.zeros(n)
    det = np.linspace(-spread, spread, voices)
    for m in notes:
        for k, d in enumerate(det):
            v = saw(mtof(m + d), n)
            p = (k / (voices - 1)) * 2 - 1
            a = (p * 0.8 + 1) * np.pi / 4
            L += v * np.cos(a)
            R += v * np.sin(a)
    st = np.stack([L, R], 1) / (len(notes) * voices) * 3.0
    st = lp(st, cutoff)
    env = adsr(n, attack, 0.6, 0.75, release, gate=dur)
    return st * env[:, None]


_pluck_cache = {}


def pluck(m):
    if m not in _pluck_cache:
        n = int(0.42 * SR)
        t = tvec(n)
        x = saw(mtof(m), n, 0) + 0.6 * saw(mtof(m) * 1.003, n, 0.5)
        y = lp(x, 7000) * np.exp(-t / 0.045) + lp(x, 1400) * np.exp(-t / 0.16)
        _pluck_cache[m] = y * np.minimum(1, t / 0.002) * 0.6
    return _pluck_cache[m]


def lead_note(m, dur):
    n = int((dur + 0.2) * SR)
    t = tvec(n)
    vib = 1 + 0.009 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.18) / 0.25, 0, 1)
    f = mtof(m) * vib
    x = sum(saw(f * 2 ** (d / 1200), n) for d in (-11, -4, 0, 5, 12)) / 5
    x += 0.35 * np.sign(sine(f / 2, n))
    x = lp(x, 6500)
    return x * adsr(n, 0.008, 0.25, 0.8, 0.2, gate=dur) * 0.8


def bell(m, dur=2.5):
    n = int(dur * SR)
    t = tvec(n)
    f = mtof(m)
    x = sum(a * sine(f * h, n) * np.exp(-t / dd) for h, a, dd in
            [(1, 1, 1.4), (2, 0.5, 0.8), (3, 0.25, 0.5), (4.2, 0.18, 0.3), (5.4, 0.1, 0.2)])
    return x * np.minimum(1, t / 0.003) * 0.5


def pad(notes, dur):
    n = int((dur + 1.2) * SR)
    x = sum(saw(mtof(m + d), n) for m in notes for d in (-0.1, 0, 0.1))
    x = lp(x / (3 * len(notes)), 1100)
    return x * adsr(n, 0.6, 1.0, 0.85, 1.2, gate=dur)


# ============================================================== harmony helpers
def chord_pcs(ch):
    root, q = ch
    return [root, (root + (3 if q == "m" else 4)) % 12, (root + 7) % 12]


def voicing(ch, lo=57, hi=72):
    """triad in [lo, hi] plus root an octave below"""
    pcs = chord_pcs(ch)
    notes = sorted(m for m in range(lo, hi + 1) if m % 12 in pcs)
    root = min(m for m in range(45, 57) if m % 12 == ch[0])
    return [root] + notes[:4]


def bass_root(ch):
    return min((m for m in range(33, 45) if m % 12 == ch[0]))


def arp_notes(ch):
    pcs = chord_pcs(ch)
    return sorted(m for m in range(69, 89) if m % 12 in pcs)


# lead melody, 8 bars over Dm-Bb-Gm-A: (beat offset, length in beats, midi)
MELODY = [
    (0, .75, 74), (.75, .25, 74), (1, 1, 77), (2, 1.5, 81), (3.5, .5, 79),
    (4, 1.5, 77), (5.5, .5, 74), (6, 1, 77), (7, 1, 82),
    (8, .75, 81), (8.75, .25, 79), (9, 1, 77), (10, 1, 79), (11, 1, 74),
    (12, 2, 76), (14, 1, 73), (15, 1, 76),
    (16, .75, 74), (16.75, .25, 74), (17, 1, 77), (18, 1, 81), (19, 1, 86),
    (20, 1, 84), (21, 1, 82), (22, 1, 81), (23, 1, 77),
    (24, 1.5, 79), (25.5, .5, 81), (26, 1, 82), (27, 1, 86),
    (28, 2, 85), (30, 2, 88),
]
BREAK_BELLS = [(60, 0, 74), (60, 1, 77), (60, 2, 82), (61, 0, 81), (61, 1.5, 79), (61, 2, 77),
               (62, 0, 76), (62, 1, 79), (62, 2, 84), (63, 0, 86), (63, 2, 81)]


def in_gap(bar, beat):
    pos = bar + beat / 4
    return any(a <= pos < b for a, b in GAPS)


# ============================================================== arrangement
drums, bass, synth, lead, fx, sc_src = Bus(), Bus(), Bus(), Bus(), Bus(), np.zeros(N)
verb_send = Bus()
ev = {"kick": [], "clap": [], "hat": [], "tom": [], "crash": [], "impact": [], "heart": [], "snare": []}
K = kick()
CL = clap()
HB = heartbeat()
HC, HO = hat(False), hat(True)


def put_kick(bar, beat, g=1.0):
    if in_gap(bar, beat):
        return
    s = S(bar, beat)
    drums.add(s, K, 0.95 * g)
    sc_src[s] = max(sc_src[s], g)
    ev["kick"].append(s / SR)


def section(bar):
    if bar < 8:
        return "intro"
    if bar < 60:
        return "p1"
    if bar < 68:
        return "break"
    if bar < 100:
        return "p2"
    if bar < 108:
        return "finale"
    return "outro"


for bar in range(TOTAL_BARS):
    sec = section(bar)
    ch = chord_at(bar)
    drop = sec in ("p1", "p2", "finale")
    blk_last = drop and ((bar - 8) % 4 == 3)

    # ---------------- heartbeat (intro, break, outro)
    if (sec == "intro" and bar < 4) or (sec == "break" and bar < 64):
        for b in (0, 2):
            drums.add(S(bar, b), HB, 0.55)
            sc_src[S(bar, b)] = 0.5
            ev["heart"].append(S(bar, b) / SR)
    if sec == "outro" and 109 <= bar <= 110:
        drums.add(S(bar, 0), HB, 0.8 if bar == 109 else 0.55)
        ev["heart"].append(S(bar, 0) / SR)

    # ---------------- intro / break builds
    if sec in ("intro", "break"):
        base = 4 if sec == "intro" else 64
        k = bar - base
        if k >= 0:
            if k < 2:
                for b in (0, 2):
                    put_kick(bar, b, 0.85)
            else:
                for b in range(4):
                    put_kick(bar, b, 0.9)
            for e in range(8):
                if not in_gap(bar, e / 2):
                    drums.add(S(bar, e / 2), HC, 0.10 + 0.04 * k)
            if k == 2:
                for e in range(8):
                    drums.add(S(bar, e / 2), snare_hit(0.35 + 0.05 * e), 0.5)
                    ev["snare"].append(S(bar, e / 2) / SR)
            if k == 3:
                for s16 in range(16):
                    if in_gap(bar, s16 / 4):
                        break
                    drums.add(S(bar, s16 / 4), snare_hit(0.5 + 0.03 * s16), 0.55)
                    ev["snare"].append(S(bar, s16 / 4) / SR)

    # ---------------- main groove
    if drop:
        for b in range(4):
            put_kick(bar, b)
            if b in (1, 3) and not (blk_last and b == 3) and not in_gap(bar, b):
                drums.add(S(bar, b), CL, 0.55, 0.0)
                ev["clap"].append(S(bar, b) / SR)
            for s16, (smp, g) in enumerate([(None, 0), (HC, 0.10), (HO, 0.07), (HC, 0.085)]):
                if smp is not None and not in_gap(bar, b + s16 / 4):
                    drums.add(S(bar, b + s16 / 4), smp, g, 0.25 if s16 == 2 else -0.2)
            if sec != "p1" or bar >= 44:   # 16th shaker layer in the bigger sections
                for s16 in range(4):
                    if not in_gap(bar, b + s16 / 4):
                        drums.add(S(bar, b + s16 / 4), HC, 0.03 + 0.02 * (s16 % 2), 0.5)
        if blk_last:
            big = bar in (59, 99, 107)
            n_hits = 12 if big else 4
            start_beat = 4 - n_hits / 4
            for i in range(n_hits):
                bt = start_beat + i / 4
                if in_gap(bar, bt):
                    break
                f0 = [180, 150, 120, 95][min(3, int(i * 4 / n_hits))]
                drums.add(S(bar, bt), tom(f0), 0.55, [-0.4, -0.15, 0.15, 0.4][i % 4])
                ev["tom"].append(S(bar, bt) / SR)
        # rolling bass: 16ths 2-4 of every beat (kick takes the first)
        heavy = sec != "p1"
        r = bass_root(ch)
        for b in range(4):
            for s16 in (1, 2, 3):
                if in_gap(bar, b + s16 / 4):
                    continue
                m = r + (12 if (s16 == 3 and b % 2 == 1) else 0)
                bass.add(S(bar, b + s16 / 4), bass_note(m, heavy), 0.5)
        # chords
        cut = {"p1": 3800 if bar < 28 else 3000 if bar < 44 else 4800, "p2": 5600, "finale": 6800}[sec]
        synth.add(S(bar), supersaw(voicing(ch), BAR, cutoff=cut), 0.5)
        # arp
        if (sec == "p1" and bar >= 28) or sec in ("p2", "finale"):
            notes = arp_notes(ch)
            pat = [0, 2, 1, 3, 2, 4, 3, 1]
            for s16 in range(16):
                if in_gap(bar, s16 / 4):
                    continue
                m = notes[pat[s16 % 8] % len(notes)]
                lead.add(S(bar, s16 / 4), pluck(m), 0.16 if sec == "p1" else 0.13, 0.35 if s16 % 2 else -0.35)
        # lead melody
        mel_on = (sec == "p2" and bar >= 76) or sec == "finale"
        if mel_on:
            rel = (bar - 76) % 8 if sec == "p2" else (bar - 100) % 4 + (0 if bar < 104 else 4)
            transpose = 2 if bar >= 104 else 0
            octave = sec == "finale" or bar >= 84
            for (ob, dur, m) in MELODY:
                if rel * 4 <= ob < rel * 4 + 4:
                    bt = ob - rel * 4
                    if in_gap(bar, bt):
                        continue
                    note = lead_note(m + transpose, dur * BEAT * 0.95)
                    lead.add(S(bar, bt), note, 0.33)
                    if octave:
                        lead.add(S(bar, bt), lead_note(m + transpose - 12, dur * BEAT * 0.95), 0.2)
        # crash on block downbeats
        if (bar - 8) % 4 == 0:
            fx.add(S(bar), crash(), 0.17)
            ev["crash"].append(S(bar) / SR)

    # ---------------- pads (intro, break, outro)
    if sec == "intro":
        synth.add(S(bar), pad(voicing(ch, 55, 70), BAR), 0.3 * (0.6 + 0.4 * bar / 7))
    if sec == "break":
        synth.add(S(bar), pad(voicing(ch, 55, 70), BAR), 0.32)
        if bar >= 64:
            notes = arp_notes(ch)
            for s16 in range(16):
                if not in_gap(bar, s16 / 4):
                    m = notes[[0, 1, 2, 3][s16 % 4] % len(notes)]
                    lead.add(S(bar, s16 / 4), pluck(m), 0.06 + 0.025 * (bar - 64), 0.3 if s16 % 2 else -0.3)

for (bar, bt, m) in BREAK_BELLS:
    lead.add(S(bar, bt), bell(m), 0.32, 0.15)
    ev.setdefault("bell", []).append(S(bar, bt) / SR)

# intro filtered arp (bars 2-7) for motion before the drop
for bar in range(2, 8):
    notes = arp_notes(chord_at(bar))
    for s16 in range(16):
        if in_gap(bar, s16 / 4):
            continue
        m = notes[[0, 2, 1, 3][s16 % 4] % len(notes)] - 12
        g = 0.03 + 0.03 * (bar - 2)
        lead.add(S(bar, s16 / 4), lp(pluck(m), 900 + 700 * (bar - 2)), g, 0.3 if s16 % 2 else -0.3)

# ---------------- dramatic fx
for (bar, strength) in IMPACTS:
    fx.add(S(bar), impact(strength), 0.95 * strength)
    fx.add(S(bar), subdrop(), 0.5 * strength)
    fx.add(S(bar), crash(4.0), 0.3)
    ev["impact"].append([S(bar) / SR, strength])
    if bar in (8, 68, 100):
        fx.add(S(bar), downlifter(3.0), 0.22)
for bar in BRAAMS:
    root = chord_at(bar)[0] + 48  # around C3..B3 region
    while root < 48:
        root += 12
    fx.add(S(bar), braam(root, 3.8 if bar != 108 else 7.0), 0.55)
for (a, b) in RISERS:
    s0, s1 = S(a), S(b)
    fx.add(s0, riser((s1 - s0) / SR), 0.42)
for (a, b) in GAPS:
    dur = (S(b) - S(a)) / SR + 0.25
    rc = reverse_cymbal(dur)
    fx.add(S(b) - len(rc), rc, 0.4)

# final sustained chord in the outro
synth.add(S(108), supersaw(voicing(chord_at(108)), BAR * 3, cutoff=4200, release=2.5), 0.4)
synth.add(S(108), pad(voicing(chord_at(108), 55, 70), BAR * 3.5), 0.45)

# ---------------- hard gaps: silence everything except reverse cymbals inside gap windows
gate = np.ones(N)
for (a, b) in GAPS:
    s0, s1 = S(a), S(b)
    fade = int(0.006 * SR)
    gate[s0:s1] = 0
    gate[s0:s0 + fade] = np.linspace(1, 0, fade)
for bus in (drums, bass, synth, lead):
    bus.x *= gate[:, None]

# ---------------- sidechain (kick-driven pump on synths and pads)
kern_n = int(0.32 * SR)
kt = tvec(kern_n)
kern = np.minimum(1, kt / 0.004) * np.exp(-kt / 0.11)
duck = signal.fftconvolve(sc_src, kern)[:N]
duck = 1 - 0.6 * np.clip(duck, 0, 1)
synth.x *= duck[:, None]
lead.x *= (1 - 0.35 * (1 - duck))[:, None]
bass.x *= (1 - 0.25 * (1 - duck))[:, None]


# ---------------- reverb
def make_ir(rt=2.3, n_sec=3.0):
    n = int(n_sec * SR)
    t = tvec(n)
    ir = rng.normal(size=(n, 2)) * np.exp(-t * 6.9 / rt)[:, None]
    ir = lp(ir, 6000)
    ir[:int(0.012 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(0))


IR = make_ir()


def reverb(x, amount):
    y = np.stack([signal.fftconvolve(x[:, c], IR[:, c])[:N] for c in range(2)], 1)
    return y * amount


def pingpong(x, delay_beats=0.75, fb=0.38, taps=5):
    d = int(delay_beats * SPB)
    y = np.zeros_like(x)
    for k in range(1, taps + 1):
        g = fb ** k
        if d * k < len(x):
            y[d * k:, k % 2] += g * x[:-d * k, :].mean(1)
    return y


lead_wet = pingpong(lead.x) * 0.5
mix = drums.x + bass.x + synth.x + lead.x + lead_wet + fx.x
# the reverb return is also mostly gated so the pre-drop gaps fall into near silence
mix += reverb(drums.x * 0.18 + synth.x * 0.25 + lead.x * 0.35 + fx.x * 0.3, 0.9) * (0.2 + 0.8 * gate)[:, None]
mix = hp(mix, 28)

# master: gentle glue + soft clip + normalise
mix /= np.percentile(np.abs(mix), 99.95) + 1e-9
mix = np.tanh(1.25 * mix) / np.tanh(1.25)
fade_n = int(3.0 * SR)
mix[-fade_n:] *= np.linspace(1, 0, fade_n)[:, None] ** 2
mix *= 0.93 / np.abs(mix).max()

pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(os.path.join(HERE, "bgm.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

ev["risers"] = [[S(a) / SR, S(b) / SR] for a, b in RISERS]
ev["gaps"] = [[S(a) / SR, S(b) / SR] for a, b in GAPS]
ev["braams"] = [S(b) / SR for b in BRAAMS]
for k in ("kick", "clap", "tom", "crash", "heart", "snare"):
    ev[k] = sorted(set(round(v, 5) for v in ev[k]))
json.dump(ev, open(os.path.join(HERE, "events.json"), "w"))
rms = np.sqrt((mix ** 2).mean())
print(f"bgm.wav {N / SR:.1f}s  rms {20 * np.log10(rms):.1f} dBFS  kicks {len(ev['kick'])}")
