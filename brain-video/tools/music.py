#!/usr/bin/env python3
"""Synthesise the BGM (hot-blooded, epic electronic/orchestral hybrid) and export the beat timeline.

150 BPM, 4/4, 86 bars = 137.6 s.  Every picture cut sits on a bar line (see src/scenes.js), and the
musical events below are placed on exactly the beats the HUD uses for its pop-ins.

  bars  1- 4  intro        drone + heartbeat, riser, snare roll -> impact on bar 5
  bars  5-36  drop 1       four-on-the-floor, theme in A minor, layers added every 8 bars
  bars 37-40  breakdown    pad + bell arpeggio, no kick
  bars 41-44  build        snare roll, riser, one beat of total silence at bar 44 beat 4
  bars 45-76  drop 2       full band + choir + strings, key change up a tone at bar 61 (B minor)
  bars 77-80  control loops half-time, bell pings on the beats the five labels appear
  bars 81-84  finale       tutti hits on each beat (8 executive-function words), lock-up hit on bar 83
  bars 85-86  outro        final hit and ring-out

Outputs: <out>/bgm.wav (48 kHz stereo 16-bit) and <assets>/timeline.json
usage: python -I tools/music.py <out_dir> <assets_dir>
"""
import json
import os
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 150
BEAT = 60.0 / BPM
BAR = 4 * BEAT
NBARS = 86
DUR = NBARS * BAR
N = int(round(DUR * SR))
FPS = 30
rng = np.random.default_rng(20251019)


def t_of(bar, beat=1.0):
    return ((bar - 1) * 4 + (beat - 1)) * BEAT


def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0)


# --------------------------------------------------------------------------------------------- DSP helpers
def sos_filter(kind, fc, order=2, q=None):
    if kind == 'bp':
        return signal.butter(order, fc, 'bandpass', fs=SR, output='sos')
    return signal.butter(order, fc, 'low' if kind == 'lp' else 'high', fs=SR, output='sos')


def lp(x, fc, order=2): return signal.sosfilt(sos_filter('lp', min(fc, SR * 0.45), order), x, axis=0)
def hp(x, fc, order=2): return signal.sosfilt(sos_filter('hp', fc, order), x, axis=0)
def bp(x, lo, hi, order=2): return signal.sosfilt(sos_filter('bp', [lo, min(hi, SR * 0.45)], order), x, axis=0)


def rbj(kind, fc, q):
    fc = np.clip(fc, 20.0, SR * 0.45)
    w0 = 2 * np.pi * fc / SR
    alpha = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    if kind == 'lp': b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == 'hp': b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else: b = [alpha, 0.0, -alpha]
    a0 = 1 + alpha
    return np.array([[b[0] / a0, b[1] / a0, b[2] / a0, 1.0, -2 * c / a0, (1 - alpha) / a0]])


def sweep(x, fc_fn, kind='lp', q=0.9, chunk=256):
    """Time-varying biquad.  fc_fn(t_seconds_array_of_chunk_centres) -> cutoff Hz.  x mono or (n, ch)."""
    x = np.asarray(x, dtype=np.float64)
    two_d = x.ndim == 2
    cols = [x[:, i] for i in range(x.shape[1])] if two_d else [x]
    n = len(cols[0])
    starts = np.arange(0, n, chunk)
    fcs = fc_fn((starts + chunk / 2) / SR)
    outs = []
    for col in cols:
        y = np.empty(n)
        zi = np.zeros((1, 2))
        for s, fc in zip(starts, fcs):
            sos = rbj(kind, float(fc), q)
            seg, zi = signal.sosfilt(sos, col[s:s + chunk], zi=zi)
            y[s:s + chunk] = seg
        outs.append(y)
    return np.stack(outs, 1) if two_d else outs[0]


def polyblep_saw(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    y = 2.0 * ph - 1.0
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= (x + x - x * x - 1.0)
    m2 = ph > 1.0 - dt
    x = (ph[m2] - 1.0) / dt[m2]
    y[m2] -= (x * x + x + x + 1.0)
    return y


def supersaw(freq, n, voices=5, spread=0.011, width=0.7):
    """Detuned saw stack -> stereo (n, 2)."""
    det = np.linspace(-1, 1, voices) * spread
    out = np.zeros((n, 2))
    for i, d in enumerate(det):
        v = polyblep_saw(np.asarray(freq) * (1 + d), n, rng.random())
        pan = (i / (voices - 1) * 2 - 1) * width
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        out[:, 0] += v * gl
        out[:, 1] += v * gr
    return out / np.sqrt(voices)


def adsr(n_on, a, d, s, r):
    n_a, n_d, n_r = int(a * SR), int(d * SR), int(r * SR)
    n_on = max(n_on, n_a + 1)
    env = np.empty(n_on + n_r)
    env[:n_a] = np.linspace(0, 1, n_a, endpoint=False)
    nd = min(n_d, n_on - n_a)
    env[n_a:n_a + nd] = s + (1 - s) * np.exp(-np.arange(nd) / max(1, n_d) * 5)
    env[n_a + nd:n_on] = env[n_a + nd - 1] if nd > 0 else 1.0
    env[n_on:] = env[n_on - 1] * np.exp(-np.arange(n_r) / max(1, n_r) * 6)
    return env


class Bus:
    def __init__(self):
        self.a = np.zeros((N, 2), dtype=np.float32)

    def add(self, x, t0, gain=1.0, pan=0.0):
        s = int(round(t0 * SR))
        if s >= N or s + len(x) <= 0:
            return
        x = np.asarray(x)
        if x.ndim == 1:
            gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            x = np.stack([x * gl * np.sqrt(2), x * gr * np.sqrt(2)], 1)
        e = min(N, s + len(x))
        a0 = 0
        if s < 0:
            a0, s = -s, 0
        self.a[s:e] += (x[a0:a0 + e - s] * gain).astype(np.float32)


def duck_curve(kick_times, depth=0.7, rel=0.19, curve=1.8):
    t = np.arange(N) / SR
    kt = np.asarray(sorted(kick_times))
    idx = np.searchsorted(kt, t, side='right') - 1
    dt = np.where(idx >= 0, t - kt[np.clip(idx, 0, None)], 10.0)
    x = np.clip(dt / rel, 0, 1) ** curve
    return (1.0 - depth * (1.0 - x)).astype(np.float32)


def make_ir(rt60, seed, length=None, hi_rt=0.5):
    length = length or rt60 * 1.15
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        r = np.random.default_rng(seed + ch).standard_normal(n)
        hi = signal.sosfilt(sos_filter('hp', 3200), r)
        lo = signal.sosfilt(sos_filter('lp', 3200), r)
        ir[:, ch] = lo * np.exp(-6.9 * t / rt60) + 0.7 * hi * np.exp(-6.9 * t / (rt60 * hi_rt))
    k = int(0.014 * SR)
    ir[:k] *= np.linspace(0, 1, k)[:, None]
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    return ir


def reverb(bus_arr, ir):
    out = np.zeros_like(bus_arr, dtype=np.float32)
    for ch in range(2):
        out[:, ch] = signal.oaconvolve(bus_arr[:, ch].astype(np.float64), ir[:, ch])[:N].astype(np.float32)
    return out


def pingpong(x, delay, fb=0.42, taps=5, lp_hz=5000):
    """x (n, 2) -> echoes only; each repeat is darker, quieter and swaps channels."""
    out = np.zeros_like(x)
    d = int(delay * SR)
    cur = x
    for k in range(1, taps + 1):
        cur = lp(cur, lp_hz, 1) * fb
        if d * k >= len(x):
            break
        src = cur[:len(x) - d * k]
        out[d * k:] += src[:, ::-1] if k % 2 else src
    return out


# --------------------------------------------------------------------------------------------- instruments
def kick(vel=1.0, sub=52.0):
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = sub + 135 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.17)
    click = hp(rng.standard_normal(n), 2800) * np.exp(-t / 0.004) * 0.28
    sub_t = np.sin(2 * np.pi * sub * t) * np.exp(-t / 0.20) * 0.38
    y = np.tanh(2.0 * (body + sub_t)) * 0.95 + click
    return y * vel


def snare(vel=1.0, tone=190.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    noi = hp(rng.standard_normal(n), 1400)
    noi = lp(noi, 9500) * np.exp(-t / 0.105)
    f = tone * (1 + 0.45 * np.exp(-t / 0.02))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.075)
    return (0.85 * noi + 0.7 * body) * vel


def clap(vel=1.0):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for i, off in enumerate([0, 0.011, 0.023, 0.036]):
        k = int(off * SR)
        burst = bp(rng.standard_normal(n - k), 1100, 3200) * np.exp(-np.arange(n - k) / SR / (0.009 if i < 3 else 0.11))
        y[k:] += burst * (0.6 if i < 3 else 1.0)
    return y * vel * 1.4


def hat(vel=1.0, open_=False):
    n = int((0.34 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    y = hp(rng.standard_normal(n), 7200, 2) * np.exp(-t / (0.16 if open_ else 0.022))
    return y * vel


def crash(vel=1.0, length=3.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    y = hp(rng.standard_normal(n), 3600, 2) * (1 - np.exp(-t / 0.004)) * np.exp(-t / 1.15)
    return y * vel


def tom(vel=1.0, f0=110.0):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.8 * np.exp(-t / 0.045))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    y += lp(rng.standard_normal(n), 900) * np.exp(-t / 0.012) * 0.4
    return y * vel


def taiko(vel=1.0):
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    f = 52 + 62 * np.exp(-t / 0.07)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    y += lp(rng.standard_normal(n), 520) * np.exp(-t / 0.05) * 0.8
    y += np.sin(2 * np.pi * 138 * t) * np.exp(-t / 0.12) * 0.25
    return np.tanh(1.6 * y) * vel


def impact(vel=1.0, length=4.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 34 + 70 * np.exp(-t / 0.35)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.6)
    burst = lp(hp(rng.standard_normal(n), 120), 7000) * np.exp(-t / 0.55) * 0.55
    return np.tanh(1.5 * (boom * 1.1 + burst)) * vel


def noise_riser(dur, f_lo=300.0, f_hi=11000.0, q=1.4, curve=2.2):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    y = sweep(x, lambda tt: f_lo * (f_hi / f_lo) ** ((tt / dur) ** 1.4), 'bp', q)
    env = (np.arange(n) / n) ** curve
    return y * env


def tonal_riser(dur, f0, octaves=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * 2 ** (octaves * (t / dur) ** 1.7)
    y = (polyblep_saw(f, n) + polyblep_saw(f * 1.006, n)) * 0.5
    y = sweep(y, lambda tt: 500 * (14 ** (tt / dur)), 'lp', 1.0)
    return y * (np.arange(n) / n) ** 1.8


def bell(f, vel=1.0, dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.55)
    y += 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.22)
    y += 0.3 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.08)
    y += 0.25 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t / 0.9)
    return y * vel


def blip(f, vel=1.0):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.03) * vel


def sub_note(f, dur, vel=1.0):
    n_on = int(dur * SR)
    env = adsr(n_on, 0.004, 0.08, 0.85, 0.05)
    n = len(env)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)
    return np.tanh(1.3 * y) * env * vel


def mid_bass(f, dur, vel=1.0, cutoff=900):
    n_on = int(dur * SR)
    env = adsr(n_on, 0.003, 0.09, 0.7, 0.04)
    n = len(env)
    y = (polyblep_saw(f, n) + 0.7 * polyblep_saw(f * 1.004, n) + 0.5 * polyblep_saw(f * 0.5, n)) / 2.2
    y = lp(y, cutoff, 2)
    return y * env * vel


def pluck(f, vel=1.0, dur=0.26):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = 0.6 * polyblep_saw(f, n) + 0.4 * polyblep_saw(f * 1.003, n)
    y = sweep(y, lambda tt: 700 + 5200 * np.exp(-tt / 0.045), 'lp', 1.1, 128)
    return y * np.exp(-t / 0.085) * vel


def lead_note(f, dur, vel=1.0, octave_layer=0.0, vib=True):
    n_on = int(dur * SR)
    env = adsr(n_on, 0.004, 0.09, 0.86, 0.14)
    n = len(env)
    t = np.arange(n) / SR
    vib_amt = 0.0042 * np.clip((t - 0.16) / 0.25, 0, 1) if vib else 0.0
    fr = f * (1 + vib_amt * np.sin(2 * np.pi * 5.6 * t))
    y = supersaw(fr, n, 5, 0.010, 0.55)
    if octave_layer > 0:
        y += octave_layer * supersaw(fr * 2, n, 3, 0.006, 0.8)
        y += 0.5 * octave_layer * supersaw(fr * 0.5, n, 3, 0.006, 0.4)
    y = lp(y, 7500, 2)
    return y * env[:, None] * vel


def pad_chord(freqs, dur, vel=1.0, cutoff=2600, attack=0.06):
    n_on = int(dur * SR)
    env = adsr(n_on, attack, 0.2, 0.9, 0.25)
    n = len(env)
    y = np.zeros((n, 2))
    for f in freqs:
        y += supersaw(f, n, 5, 0.013, 0.95)
    y = lp(y / np.sqrt(len(freqs)), cutoff, 2)
    return y * env[:, None] * vel


def choir_chord(freqs, dur, vel=1.0):
    n_on = int(dur * SR)
    env = adsr(n_on, 0.28, 0.3, 0.9, 0.4)
    n = len(env)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for k, f in enumerate(freqs):
        for side, det in ((0, 0.994), (1, 1.006)):
            fr = f * det * (1 + 0.003 * np.sin(2 * np.pi * (4.8 + 0.3 * k) * t + k))
            src = polyblep_saw(fr, n, rng.random())
            voiced = (bp(src, 640, 820) * 1.0 + bp(src, 950, 1250) * 0.8 + bp(src, 2250, 2700) * 0.35 + lp(src, 400) * 0.35)
            out[:, side] += voiced
    return out / len(freqs) * env[:, None] * vel * 1.6


def brass_stab(freqs, dur, vel=1.0):
    n_on = int(dur * SR)
    env = adsr(n_on, 0.012, 0.12, 0.65, 0.08)
    n = len(env)
    y = np.zeros(n)
    for f in freqs:
        y += polyblep_saw(f, n, rng.random()) + 0.8 * polyblep_saw(f * 1.007, n, rng.random()) + 0.8 * polyblep_saw(f * 0.993, n, rng.random())
    y = sweep(y / (len(freqs) * 2.0), lambda tt: 700 + 4300 * (1 - np.exp(-tt / 0.07)), 'lp', 1.3, 128)
    return np.stack([y, y], 1) * env[:, None] * vel


def string_hit(f, vel=1.0, dur=0.15):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = 0.6 * polyblep_saw(f, n) + 0.5 * polyblep_saw(f * 1.005, n)
    y = lp(y, 3200, 2)
    return y * np.exp(-t / 0.075) * vel


# --------------------------------------------------------------------------------------------- harmony
# chord table relative to A: (bass-root semitones relative to A, triad offsets relative to A)
CH = {
    'Am': (0, [0, 3, 7]), 'F': (-4, [-4, 0, 3]), 'C': (3, [3, 7, 10]), 'G': (-2, [-2, 2, 5]),
    'Em': (-5, [-5, -2, 2]), 'E': (-5, [-5, -1, 2]),
}
LOOP = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Em']


def key_shift(bar):
    return 2 if bar >= 61 else 0


def chord_of(bar):
    if bar <= 2: return 'Am'
    if bar == 3: return 'F'
    if bar == 4: return 'G'
    if 5 <= bar <= 36: return LOOP[(bar - 5) % 8]
    if 37 <= bar <= 40: return ['Am', 'F', 'C', 'G'][bar - 37]
    if 41 <= bar <= 44: return ['F', 'G', 'Am', 'E'][bar - 41]
    if 45 <= bar <= 76: return LOOP[(bar - 45) % 8]
    if 77 <= bar <= 80: return ['Am', 'F', 'C', 'G'][bar - 77]
    if 81 <= bar <= 84: return ['Am', 'F', 'G', 'Am'][bar - 81]
    return 'Am'


def pc_notes(bar, base):
    """triad MIDI notes in the octave starting at `base` (A = base)."""
    _, tri = CH[chord_of(bar)]
    ks = key_shift(bar)
    notes = []
    for r in tri:
        m = base + r + ks
        while m < base - 5 + ks: m += 12
        while m > base + 9 + ks: m -= 12
        notes.append(m)
    return sorted(notes)


def bass_root(bar, octave_base=33):
    r, _ = CH[chord_of(bar)]
    m = octave_base + r + key_shift(bar)
    return m


# theme (beat offset, duration in beats, midi in A minor) per bar of the 8-bar phrase
THEME = [
    [(0, 1.5, 76), (1.5, .5, 76), (2, .5, 74), (2.5, .5, 76), (3, 1, 79)],
    [(0, 1.5, 81), (1.5, .5, 79), (2, 1, 77), (3, 1, 81)],
    [(0, 1.5, 76), (1.5, .5, 76), (2, 1, 79), (3, 1, 84)],
    [(0, 1.5, 74), (1.5, .5, 74), (2, 1, 71), (3, 1, 74)],
    [(0, 1.5, 76), (1.5, .5, 76), (2, .5, 74), (2.5, .5, 76), (3, 1, 81)],
    [(0, 1.5, 81), (1.5, .5, 79), (2, 1, 81), (3, 1, 84)],
    [(0, 1.5, 83), (1.5, .5, 81), (2, 1, 79), (3, 1, 74)],
    [(0, 1.5, 83), (1.5, .5, 79), (2, 2, 76)],
]


# --------------------------------------------------------------------------------------------- arrangement
def build():
    buses = {k: Bus() for k in ['kick', 'snare', 'hats', 'perc', 'sub', 'mbass', 'pad', 'arp', 'lead', 'brass', 'choir', 'str', 'fx', 'bells']}
    kick_times, snare_times, hit_times = [], [], []

    def drop_phase(bar):
        if 5 <= bar <= 36: return 'drop1'
        if 45 <= bar <= 76: return 'drop2'
        return None

    for bar in range(1, NBARS + 1):
        ph = drop_phase(bar)
        t0 = t_of(bar)
        ks = key_shift(bar)
        chord = chord_of(bar)
        in_d1, in_d2 = ph == 'drop1', ph == 'drop2'
        d1_idx = bar - 5          # 0..31
        d2_idx = bar - 45

        # ---------------------------------------------------------------- drums
        four = in_d1 or in_d2 or (81 <= bar <= 84) or (bar == 35 or bar == 36)
        if four:
            for b in range(4):
                tt = t0 + b * BEAT
                buses['kick'].add(kick(1.0), tt)
                kick_times.append(tt)
            for b in (1, 3):
                tt = t0 + b * BEAT
                buses['snare'].add(snare(0.9), tt)
                buses['snare'].add(clap(0.55), tt, pan=0.05)
                snare_times.append(tt)
            for b in range(4):
                buses['hats'].add(hat(0.42), t0 + (b + 0.5) * BEAT, pan=0.25)
            busy = (in_d1 and d1_idx >= 8) or in_d2 or bar >= 81
            if busy:
                for b in range(4):
                    for sub in (0.25, 0.75):
                        buses['hats'].add(hat(0.2), t0 + (b + sub) * BEAT, pan=-0.2)
            if (in_d1 and d1_idx % 4 == 3) or (in_d2 and d2_idx % 4 == 3 and bar != 76):
                # open hat on the last "and" before a phrase turns
                buses['hats'].add(hat(0.6, True), t0 + 3.5 * BEAT, pan=0.2)
        # taiko layer
        if (in_d1 and d1_idx >= 8) or in_d2 or bar >= 81:
            buses['perc'].add(taiko(0.85), t0)
            if bar % 2 == 0:
                buses['perc'].add(taiko(0.6), t0 + 2.5 * BEAT)
        # crash at phrase starts
        if (in_d1 and d1_idx % 4 == 0) or (in_d2 and d2_idx % 4 == 0):
            buses['perc'].add(crash(0.7), t0)
        # fill on the last beat of each 4-bar group
        if (in_d1 and d1_idx % 4 == 3) or (in_d2 and d2_idx % 4 == 3):
            for i, sub in enumerate(np.arange(3.0, 4.0, 0.25)):
                buses['snare'].add(snare(0.45 + 0.15 * i), t0 + sub * BEAT)
            for i, (sub, f0) in enumerate([(3.0, 150), (3.25, 130), (3.5, 110), (3.75, 90)]):
                buses['perc'].add(tom(0.5, f0), t0 + sub * BEAT, pan=-0.3 + 0.2 * i)

        # ---------------------------------------------------------------- bass
        root = bass_root(bar)
        if in_d1 or in_d2 or bar >= 81 or bar in (35, 36):
            pat = [0, 0, 12, 0, 0, 12, 0, 12] if bar % 2 == 0 else [0, 0, 12, 0, 0, 0, 12, 0]
            for i in range(8):
                tt = t0 + i * 0.5 * BEAT
                oc = pat[i]
                buses['sub'].add(sub_note(midi_hz(root + (12 if oc and False else 0)), 0.42 * BEAT * 1.0, 0.9), tt)
                buses['mbass'].add(mid_bass(midi_hz(root + 12 + oc), 0.40 * BEAT, 0.85, 800 if in_d1 else 1100), tt)
        elif 77 <= bar <= 80:
            buses['sub'].add(sub_note(midi_hz(root), 1.9 * BEAT, 0.9), t0)
            buses['sub'].add(sub_note(midi_hz(root), 1.9 * BEAT, 0.8), t0 + 2 * BEAT)
        elif bar <= 4 or 37 <= bar <= 44 or bar >= 85:
            lvl = 0.8 if bar >= 85 else (0.28 + 0.07 * (bar - 1) if bar <= 4 else 0.45)
            buses['sub'].add(sub_note(midi_hz(root), 3.9 * BEAT, lvl), t0)

        # ---------------------------------------------------------------- pads
        pn = pc_notes(bar, 57)
        pf = [midi_hz(m) for m in pn] + [midi_hz(bass_root(bar, 45))]
        if bar <= 4:
            buses['pad'].add(pad_chord(pf, 4 * BEAT, 0.28 + 0.1 * (bar - 1), 1000 + 400 * (bar - 1), 0.5), t0)
        elif in_d1 or in_d2 or 81 <= bar <= 84 or bar in (35, 36):
            buses['pad'].add(pad_chord(pf, 4 * BEAT * 0.99, 1.0, 2800 if in_d1 else 3600, 0.03), t0)
        elif 37 <= bar <= 40:
            buses['pad'].add(pad_chord(pf, 4 * BEAT, 0.8, 1500 + 350 * (bar - 37), 0.12), t0)
        elif 41 <= bar <= 44:
            buses['pad'].add(pad_chord(pf, 4 * BEAT, 0.9, 1800 + 1200 * (bar - 41), 0.08), t0)
        elif 77 <= bar <= 80:
            buses['pad'].add(pad_chord(pf, 4 * BEAT, 0.9, 2400, 0.05), t0)
        elif bar >= 85:
            buses['pad'].add(pad_chord(pf, 4 * BEAT, 0.9, 2200, 0.05), t0)

        # choir (epic bed)
        if (in_d1 and d1_idx >= 16) or in_d2 or 77 <= bar <= 84 or bar in (37, 38, 39, 40, 85, 86):
            cn_ = [midi_hz(m + 12) for m in pn]
            buses['choir'].add(choir_chord(cn_, 4 * BEAT * 1.0, 0.8 if bar not in (37, 38, 39, 40) else 0.4), t0)

        # ---------------------------------------------------------------- arp (16ths)
        tri = pc_notes(bar, 60)
        ladder = [tri[0], tri[1], tri[2], tri[0] + 12, tri[1] + 12, tri[2] + 12]
        pat = [0, 2, 3, 2, 1, 2, 4, 2, 0, 2, 3, 2, 1, 2, 5, 4]
        arp_on = in_d1 or in_d2 or bar in (35, 36) or 81 <= bar <= 84
        arp_soft = (41 <= bar <= 44) or (39 <= bar <= 40) or (77 <= bar <= 80) or bar == 4
        if arp_on or arp_soft:
            for i, p in enumerate(pat):
                if arp_soft and not arp_on and bar in (77, 78, 79, 80) and i % 2: continue
                vel = (0.75 if i % 4 == 0 else 0.5) * (1.0 if arp_on else 0.55 + 0.1 * ((bar - 39) if bar >= 39 else 0))
                buses['arp'].add(pluck(midi_hz(ladder[p]), vel), t0 + i * 0.25 * BEAT, pan=-0.35 if i % 2 else 0.35)

        # ---------------------------------------------------------------- strings ostinato (drop 2, finale)
        if in_d2 or 81 <= bar <= 84:
            rt = bass_root(bar, 45)
            seq = [rt, rt, rt + 7, rt, rt, rt + 7, rt + 12, rt + 7] * 2
            for i, m in enumerate(seq):
                buses['str'].add(string_hit(midi_hz(m + 12), 0.55 if i % 4 == 0 else 0.4), t0 + i * 0.25 * BEAT, pan=0.1 if i % 2 else -0.1)

        # ---------------------------------------------------------------- brass stabs
        if (in_d1 and d1_idx >= 8) or in_d2 or 81 <= bar <= 82:
            bn = [midi_hz(m) for m in pc_notes(bar, 57)] + [midi_hz(bass_root(bar, 45) + 12)]
            buses['brass'].add(brass_stab(bn, 0.42 * BEAT, 0.9), t0)
            buses['brass'].add(brass_stab(bn, 0.30 * BEAT, 0.7), t0 + 2.5 * BEAT)
        # chip pops in the PFC scenes (bars 2, 3, 4 of every 4-bar scene) get an accent stab
        if 49 <= bar <= 76 and (bar - 49) % 4 in (1, 2, 3):
            bn = [midi_hz(m + 12) for m in pc_notes(bar, 57)]
            buses['brass'].add(brass_stab(bn, 0.5 * BEAT, 0.8), t0)

        # ---------------------------------------------------------------- lead (theme)
        theme_bar = None
        if in_d1: theme_bar = d1_idx % 8
        if in_d2: theme_bar = d2_idx % 8
        if 81 <= bar <= 83: theme_bar = {81: 0, 82: 1, 83: 6}[bar]
        lead_on = in_d1 or in_d2 or 81 <= bar <= 83
        if lead_on:
            for (off, dur, m) in THEME[theme_bar]:
                m2 = m + ks
                layer = 0.0
                if in_d1 and d1_idx >= 8: layer = 0.45
                if in_d2 or bar >= 81: layer = 0.7
                if in_d1 and d1_idx >= 16 and theme_bar in (2, 5): m2 += 0
                buses['lead'].add(lead_note(midi_hz(m2), dur * BEAT * 0.97, 0.9, layer), t0 + off * BEAT)
        if bar == 84:
            buses['lead'].add(lead_note(midi_hz(81 + 2 + 12), 3.9 * BEAT, 0.8, 0.8), t0)
            buses['lead'].add(lead_note(midi_hz(81 + 2), 3.9 * BEAT, 0.9, 0.8), t0)
        if 37 <= bar <= 40:
            # breakdown: the theme returns softly on bell-like pluck
            for (off, dur, m) in THEME[bar - 37]:
                buses['bells'].add(bell(midi_hz(m), 0.42, 1.2), t0 + off * BEAT, pan=0.25)
        # harmony third above in the later phrases of drop 2
        if in_d2 and d2_idx >= 16:
            for (off, dur, m) in THEME[d2_idx % 8]:
                third = m + (3 if (m % 12) in (4, 9, 11, 2) else 4)
                buses['lead'].add(lead_note(midi_hz(third + ks), dur * BEAT * 0.97, 0.38, 0.2, False), t0 + off * BEAT)

    # -------------------------------------------------------------------- special events
    # intro: heartbeat, then kicks, snare roll
    for bar in (1, 2):
        for b, v in ((0, 0.8), (0.75, 0.5), (2, 0.8), (2.75, 0.5)):
            tt = t_of(bar) + b * BEAT
            h = lp(kick(v * 0.5, 52), 160, 2)
            buses['kick'].add(h, tt)
            kick_times.append(tt)
    for bar in (3, 4):
        for b in range(4):
            tt = t_of(bar) + b * BEAT
            buses['kick'].add(kick(0.3 + 0.22 * (bar - 3) + 0.04 * b, 50), tt)
            kick_times.append(tt)
    # intro snare roll: 8ths (beats 1-2), 16ths (beat 3), 32nds (beat 4) with a steady crescendo
    offs = [0, 0.5, 1.0, 1.5] + [2.0, 2.25, 2.5, 2.75] + [3.0 + k * 0.125 for k in range(8)]
    for i, o in enumerate(offs):
        buses['snare'].add(snare(0.22 + 0.6 * i / len(offs)), t_of(4) + o * BEAT)
    # reverse crash into bar 5 (last 1.6 s of the reversed tail)
    rc = crash(0.9, 3.0)[::-1][-int(1.6 * SR):]
    buses['fx'].add(rc, t_of(5) - len(rc) / SR, 0.9)
    # intro riser
    buses['fx'].add(noise_riser(2 * BAR, 300, 10000), t_of(3), 0.42)
    buses['fx'].add(tonal_riser(2 * BAR, midi_hz(57), 2.0), t_of(3), 0.26)

    # impacts
    def hit(bar, beat, vel, lowtail=True):
        tt = t_of(bar, beat)
        buses['fx'].add(impact(vel, 4.2 if lowtail else 2.2), tt)
        buses['perc'].add(crash(0.8 * vel), tt)
        hit_times.append(tt)

    hit(5, 1, 1.0)
    hit(45, 1, 1.0)
    hit(61, 1, 0.6)
    hit(81, 1, 0.7)
    hit(83, 1, 0.8)
    hit(85, 1, 1.0)
    # scene-change accents (2-bar scenes in drop 1, 4-bar scenes in drop 2): short crash/tick on the downbeat
    for bar in range(9, 37, 2):
        buses['perc'].add(crash(0.32, 1.4), t_of(bar), pan=0.3)
    for bar in range(49, 77, 4):
        buses['perc'].add(crash(0.3, 1.4), t_of(bar), pan=-0.3)

    # counters at bars 5-6 (3 blips) and overview cut-sweep whoosh
    for tt, f in ((t_of(5, 1), 1760), (t_of(5, 3), 2217), (t_of(6, 1), 2637)):
        buses['bells'].add(blip(f, 0.55), tt, pan=-0.3)
    wh = noise_riser(2.4, 250, 9000, 1.0, 1.4)
    buses['fx'].add(wh, t_of(7, 1), 0.5)

    # recap hits (bars 35-36): chord stab on every beat, rising
    for i in range(8):
        bar = 35 + i // 4
        tt = t_of(bar, 1 + i % 4)
        stab = [midi_hz(m + i) for m in pc_notes(bar, 57)] + [midi_hz(bass_root(bar, 45) + 12 + i)]
        buses['brass'].add(brass_stab(stab, 0.35 * BEAT, 0.85), tt)
        buses['bells'].add(blip(1400 + 180 * i, 0.5), tt)
    # breakdown -> build: snare roll + risers
    roll = []
    for i in range(4): roll.append((t_of(41) + i * BEAT, 0.28))
    for i in range(8): roll.append((t_of(42) + i * 0.5 * BEAT, 0.34 + 0.012 * i))
    for i in range(16): roll.append((t_of(43) + i * 0.25 * BEAT, 0.42 + 0.012 * i))
    for i in range(24): roll.append((t_of(44) + i * (0.125 * BEAT) , 0.62 + 0.012 * i))
    for tt, v in roll:
        if tt < t_of(44, 4) - 0.02:
            buses['snare'].add(snare(min(v, 1.0)), tt)
    for bar in (43, 44):
        for b in range(4 if bar == 43 else 3):
            buses['kick'].add(kick(0.8), t_of(bar, 1 + b))
            kick_times.append(t_of(bar, 1 + b))
    buses['fx'].add(noise_riser(3 * BAR + 3 * BEAT, 250, 12000, 1.2, 2.4), t_of(41), 0.6)
    buses['fx'].add(tonal_riser(3 * BAR + 3 * BEAT, midi_hz(57), 3.0), t_of(41), 0.4)
    buses['fx'].add(crash(0.7, 3.0)[::-1][-int(2 * BAR * SR):], t_of(44, 4) - 2 * BAR, 0.6)

    # control-loop bells (labels pop at beat indices 1..5 of bar 77): B minor pentatonic ladder
    ladder = [83, 86, 88, 90, 93]  # B5 D6 E6 F#6 A6
    for i, m in enumerate(ladder):
        tt = t_of(77) + (1 + i) * BEAT
        buses['bells'].add(bell(midi_hz(m), 0.8, 1.6), tt, pan=-0.4 + 0.2 * i)
        buses['bells'].add(bell(midi_hz(m - 12), 0.35, 1.6), tt, pan=-0.4 + 0.2 * i)
    # half-time drums for the network scene
    for bar in range(77, 81):
        t0 = t_of(bar)
        for b in (0, 2):
            buses['kick'].add(kick(0.95), t0 + b * BEAT)
            kick_times.append(t0 + b * BEAT)
        buses['snare'].add(snare(0.85), t0 + 2 * BEAT)
        buses['snare'].add(clap(0.55), t0 + 2 * BEAT)
        snare_times.append(t0 + 2 * BEAT)
        for b in range(8):
            buses['hats'].add(hat(0.32), t0 + (b + 0.5) * 0.5 * BEAT, pan=0.2)
    for i, sub in enumerate(np.arange(0, 3.0, 0.5)):  # build into finale across bar 80
        buses['snare'].add(snare(0.3 + 0.1 * i), t_of(80, 2) + sub * BEAT)
    buses['fx'].add(noise_riser(BAR, 400, 11000, 1.2, 2.0), t_of(80), 0.5)

    # finale tutti hits on every beat of bars 81-82 (8 words) + lock-up bar 83
    for i in range(8):
        bar = 81 + i // 4
        tt = t_of(bar, 1 + i % 4)
        buses['perc'].add(taiko(0.75), tt)
    for b in range(4):
        buses['perc'].add(taiko(0.9), t_of(83, 1 + b))
    # bar 85 final hit: chord + choir swell
    fin = [midi_hz(m + 2) for m in (57, 60, 64)] + [midi_hz(45 + 2)]
    buses['brass'].add(brass_stab(fin, 1.4, 1.0), t_of(85))
    buses['lead'].add(lead_note(midi_hz(83 + 12), 1.8, 0.7, 0.8), t_of(85))

    return buses, kick_times, snare_times


def mixdown(buses, kick_times, snare_times):
    k = np.array(kick_times)
    duck_hard = duck_curve(k, 0.72, 0.19)
    duck_med = duck_curve(k, 0.5, 0.17)
    duck_lite = duck_curve(k, 0.28, 0.15)

    def D(arr, d): return arr * d[:, None]

    mix = np.zeros((N, 2), dtype=np.float32)
    gains = {'kick': 0.95, 'snare': 0.85, 'hats': 0.42, 'perc': 0.55, 'sub': 0.38, 'mbass': 0.42, 'pad': 0.58, 'arp': 0.48,
             'lead': 0.80, 'brass': 0.55, 'choir': 0.52, 'str': 0.46, 'fx': 0.60, 'bells': 0.34}
    duck = {'sub': duck_hard, 'mbass': duck_hard, 'pad': duck_hard, 'arp': duck_med, 'choir': duck_med, 'str': duck_med,
            'lead': duck_lite, 'brass': duck_lite}
    dry = {}
    for name, b in buses.items():
        x = b.a.astype(np.float32)
        if name in duck: x = D(x, duck[name])
        dry[name] = x * gains[name]
        mix += dry[name]

    # sends
    hall_in = (dry['lead'] * 0.35 + dry['pad'] * 0.22 + dry['choir'] * 0.55 + dry['brass'] * 0.3 + dry['fx'] * 0.45 + dry['bells'] * 0.6
               + dry['snare'] * 0.18 + dry['perc'] * 0.25 + dry['str'] * 0.2)
    plate_in = dry['snare'] * 0.28 + dry['hats'] * 0.1 + dry['arp'] * 0.1 + dry['lead'] * 0.12
    echo_in = dry['lead'] * 0.5 + dry['arp'] * 0.6 + dry['bells'] * 0.4
    hall = reverb(hall_in, make_ir(2.8, 11, 3.2))
    plate = reverb(plate_in, make_ir(0.9, 21, 1.1, 0.7))
    echo = pingpong(echo_in.astype(np.float64), BEAT * 0.75, 0.40, 5).astype(np.float32)
    mix += 0.85 * hall + 0.55 * plate + 0.55 * echo

    # master: DC/sub clean-up, gate for the one-beat silence before drop 2, final fade
    mix = hp(mix.astype(np.float64), 28, 2)
    g = np.ones(N)
    a, b = int((t_of(44, 4) - 0.012) * SR), int(t_of(45, 1) * SR)
    g[a:b] = 0.0
    ramp = int(0.012 * SR)
    g[a - ramp:a] = np.linspace(1, 0, ramp)
    mix *= g[:, None]
    fade_n = int(2.4 * SR)
    mix[-fade_n:] *= np.linspace(1, 0, fade_n)[:, None] ** 1.6

    # loudness: put the first drop at about -13 dBFS RMS, then a look-ahead limiter to -1 dBFS
    seg = mix[int(t_of(13) * SR):int(t_of(29) * SR)]
    ref_db = 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)
    mix *= 10 ** ((-13.0 - ref_db) / 20)
    mix = np.tanh(mix * 0.55) / 0.55 * 0.97 if False else mix
    from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
    peak = np.max(np.abs(mix), axis=1)
    w = int(0.012 * SR)
    target = np.minimum(1.0, 0.89 / np.maximum(maximum_filter1d(peak, size=w), 1e-9))
    gl = uniform_filter1d(minimum_filter1d(target, size=w), size=w)
    print('limiter: min gain %.2f dB, mean reduction %.2f dB' % (20 * np.log10(gl.min()), 20 * np.log10(gl).mean()))
    mix *= gl[:, None]
    return mix.astype(np.float32)


def analyse(mix, kick_times, snare_times, hit_times=None):
    frames = int(round(DUR * FPS))
    # envelopes sampled per frame, aligned to the true event times
    def env_from(times, tau):
        out = np.zeros(frames)
        for f in range(frames):
            t = f / FPS
            ts = [tt for tt in times if tt <= t + 1e-6 and t - tt < 1.0]
            if ts:
                out[f] = np.exp(-(t - max(ts)) / tau)
        return out
    kick_env = env_from(sorted(set(round(x, 4) for x in kick_times)), 0.11)
    snare_env = env_from(sorted(set(round(x, 4) for x in snare_times)), 0.09)
    # spectrum bands per frame (log spaced), light temporal smoothing
    mono = mix.mean(1)
    edges = np.geomspace(45, 14000, 49)
    win = 2048
    hann = np.hanning(win)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    idxs = [np.where((freqs >= edges[i]) & (freqs < edges[i + 1]))[0] for i in range(48)]
    bands = np.zeros((frames, 48))
    for f in range(frames):
        c = int((f / FPS + 0.5 / FPS) * SR)
        seg = mono[max(0, c - win // 2):c + win // 2]
        if len(seg) < win:
            seg = np.pad(seg, (0, win - len(seg)))
        sp = np.abs(np.fft.rfft(seg * hann)) / win
        for i, ix in enumerate(idxs):
            bands[f, i] = sp[ix].mean() if len(ix) else 0
    db = 20 * np.log10(bands + 1e-9)
    # tilt compensation (pink-ish) then normalise to 0..1
    tilt = np.linspace(-6, 14, 48)
    norm = np.clip((db + tilt + 78) / 46, 0, 1)
    sm = np.zeros_like(norm)
    for f in range(frames):
        prev = sm[f - 1] if f else np.zeros(48)
        sm[f] = np.where(norm[f] > prev, norm[f], prev * 0.78 + norm[f] * 0.22)
    rms = np.array([np.sqrt(np.mean(mono[int(f / FPS * SR):int((f + 1) / FPS * SR)] ** 2)) for f in range(frames)])
    return {'fps': FPS, 'frames': frames, 'bpm': BPM, 'kick': np.round(kick_env, 3).tolist(), 'snare': np.round(snare_env, 3).tolist(),
            'bands': np.round(sm, 2).tolist(), 'rms': np.round(rms, 4).tolist()}


def main():
    out_dir, assets = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(assets, exist_ok=True)
    buses, kt, st = build()
    print('rendered buses; kicks', len(kt), 'snares', len(st))
    mix = mixdown(buses, kt, st)
    wavfile.write(os.path.join(out_dir, 'bgm.wav'), SR, (mix * 32767).astype(np.int16))
    tl = analyse(mix, kt, st)
    with open(os.path.join(assets, 'timeline.json'), 'w') as fh:
        json.dump(tl, fh, separators=(',', ':'))
    # per-bar loudness report
    mono = mix.mean(1)
    print('bar  rms_dBFS  peak')
    for bar in range(1, NBARS + 1):
        seg = mono[int(t_of(bar) * SR):int(t_of(bar + 1) * SR)]
        print(f'{bar:3d}  {20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9):7.1f}  {np.max(np.abs(seg)):.2f}', end='   ' if bar % 4 else '\n')
    print('\noverall peak', float(np.max(np.abs(mix))), 'rms dBFS', 20 * np.log10(np.sqrt(np.mean(mix ** 2))))
    print('samples above 0.98:', int((np.abs(mix) > 0.98).sum()))
    L, R = mix[:, 0].astype(np.float64), mix[:, 1].astype(np.float64)
    print('stereo correlation', float(np.corrcoef(L, R)[0, 1]))
    # tonal balance of the drop (bars 13-28): share of energy in sub / low / mid / high
    seg = mono[int(t_of(13) * SR):int(t_of(29) * SR)]
    sp = np.abs(np.fft.rfft(seg)) ** 2
    fr = np.fft.rfftfreq(len(seg), 1 / SR)
    tot = sp.sum()
    for name, lo, hi in (('sub <60', 0, 60), ('bass 60-250', 60, 250), ('low-mid 250-1k', 250, 1000), ('mid 1-4k', 1000, 4000), ('high 4-8k', 4000, 8000), ('air >8k', 8000, 24000)):
        print(f'  {name:16s} {100 * sp[(fr >= lo) & (fr < hi)].sum() / tot:5.1f}%')


if __name__ == '__main__':
    main()
