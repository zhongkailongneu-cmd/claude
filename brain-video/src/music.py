"""Original score, synthesised from scratch with numpy/scipy.

Epic electronic / trailer hybrid in D minor at 128.57 BPM (14 video frames per
beat). The arrangement follows the video's bar map in timeline.py: every card
change gets a crash and impact, every line of text a tick, every drop a
braam, a white-out and a silent beat in front of it."""

import json
import os
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

import cues
from timeline import SR, BEAT, BEAT_SAMPLES, DURATION

rng = np.random.default_rng(2026)
N = int(DURATION * SR)
OUT = os.path.join(os.path.dirname(__file__), "..", "build", "bgm.wav")


def smp(bar, beat=0.0):
    return int(round((bar * 4 + beat) * BEAT_SAMPLES))


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


def tvec(n):
    return np.arange(n) / SR


# ------------------------------------------------------------------ buses
class Bus:
    def __init__(self):
        self.x = np.zeros((2, N), np.float32)

    def add(self, sig, start, gain=1.0, pan=0.0):
        if start >= N:
            return
        sig = np.asarray(sig, np.float32)
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4
            sig = np.vstack([sig * np.cos(a) * 1.4142, sig * np.sin(a) * 1.4142])
        s0 = max(0, start)
        end = min(N, start + sig.shape[1])
        if end <= s0:
            return
        self.x[:, s0:end] += gain * sig[:, s0 - start:end - start]


drums, bass, synth, lead_bus, fx, send = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()
# bus trims set by measuring bus RMS in the first PFC drop (drums ~ -5 dB):
# chords/arp sit ~8 dB under the drums, the lead ~6 dB under
TRIM = {id(synth): 4.0, id(lead_bus): 2.3, id(drums): 0.85}


def put(bus, sig, start, gain=1.0, pan=0.0, verb=0.0):
    gain *= TRIM.get(id(bus), 1.0)
    bus.add(sig, start, gain, pan)
    if verb:
        send.add(sig, start, gain * verb, pan)


# ------------------------------------------------------------------ dsp
def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "low", fs=SR, output="sos"), x, axis=-1)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "high", fs=SR, output="sos"), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=-1)


def sweep_lp(x, fc, q=0.8, block=256):
    """Lowpass whose cutoff follows the array fc (one value per sample)."""
    y = np.empty_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        f = float(np.clip(fc[min(i, len(fc) - 1)], 30, SR * 0.45))
        w0 = 2 * np.pi * f / SR
        al = np.sin(w0) / (2 * q)
        c = np.cos(w0)
        b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2])
        a = np.array([1 + al, -2 * c, 1 - al])
        y[i:i + block], zi = signal.lfilter(b / a[0], a / a[0], x[i:i + block], zi=zi)
    return y


def polyblep(t, dt):
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]
    y[m] = x * x + x + x + 1
    return y


def _phase(freq, n, ph0):
    inc = np.broadcast_to(np.asarray(freq, float) / SR, (n,))
    ph = (ph0 + np.cumsum(inc) - inc[0]) % 1.0
    return ph, inc


def saw(freq, n, ph0=None):
    ph, dt = _phase(freq, n, rng.random() if ph0 is None else ph0)
    return 2 * ph - 1 - polyblep(ph, dt)


def pulse(freq, n):
    ph, dt = _phase(freq, n, rng.random())
    ph2 = (ph + 0.5) % 1.0
    return (2 * ph - 1 - polyblep(ph, dt)) - (2 * ph2 - 1 - polyblep(ph2, dt))


def sine(freq, n, ph0=0.0):
    ph, _ = _phase(freq, n, ph0)
    return np.sin(2 * np.pi * ph)


def fade(x, a=0.003, r=0.02):
    n = x.shape[-1]
    env = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        env[:na] = np.linspace(0, 1, na)
    if nr:
        env[n - nr:] *= np.linspace(1, 0, nr)
    return x * env


def norm(x, peak=1.0):
    return x * (peak / (np.abs(x).max() + 1e-9))


def pingpong(x, delay, fb=0.38, taps=6):
    out = np.zeros((2, len(x) + delay * taps), np.float32)
    out[0, :len(x)] += x
    out[1, :len(x)] += x
    for k in range(1, taps + 1):
        out[k % 2, delay * k:delay * k + len(x)] += x * fb ** k
    return out


def reverb_ir(seconds=2.6):
    n = int(seconds * SR)
    t = tvec(n)
    ir = np.zeros((2, n))
    for ch in range(2):
        z = rng.standard_normal(n)
        low, high = lp(z, 2800), hp(z, 2800)
        ir[ch] = low * np.exp(-t * 6.9 / seconds) + 0.5 * high * np.exp(-t * 6.9 / (seconds * 0.35))
        for d, g in ((0.011, 0.5), (0.019, 0.4), (0.027, 0.3), (0.037, 0.25)):
            ir[ch, int((d + 0.004 * ch) * SR)] += g
    ir[:, :int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


# ------------------------------------------------------------------ drums
def make_kick(dur=0.55, low=46):
    n = int(dur * SR)
    t = tvec(n)
    f = low + 125 * np.exp(-t / 0.03) + 70 * np.exp(-t / 0.005)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.32)
    click = hp(rng.standard_normal(n), 1800) * np.exp(-t / 0.004) * 0.3
    return fade(norm(np.tanh(1.9 * (body + click))), 0.0005, 0.03)


def make_clap():
    n = int(0.6 * SR)
    t = tvec(n)
    env = sum(np.where(t >= o, np.exp(-(t - o) / 0.006), 0) for o in (0.0, 0.010, 0.021))
    env = env + 0.7 * np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.13), 0)
    out = np.vstack([bp(rng.standard_normal(n), 900, 7500) * env for _ in range(2)])
    out += np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.8
    return norm(out)


def make_snare():
    n = int(0.3 * SR)
    t = tvec(n)
    x = bp(rng.standard_normal(n), 1000, 8500) * np.exp(-t / 0.07)
    x += np.sin(2 * np.pi * 205 * t) * np.exp(-t / 0.035) * 1.2
    return norm(x)


def make_hat(open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = tvec(n)
    metal = sum(pulse(f, n) for f in (3150, 4270, 5340, 6870)) * 0.15
    x = hp(rng.standard_normal(n) + metal, 7200) * np.exp(-t / (0.16 if open_ else 0.022))
    return norm(x)


def make_crash(dur=3.0):
    n = int(dur * SR)
    t = tvec(n)
    out = []
    for _ in range(2):
        z = hp(rng.standard_normal(n), 3800) * np.exp(-t / 1.1)
        metal = hp(sum(pulse(f, n) for f in (2049, 3011, 4021, 5179, 6311, 7559)), 5000) * np.exp(-t / 0.7) * 0.25
        out.append(fade(z + metal, 0.001, 0.2))
    return norm(np.vstack(out))


def make_taiko(f0=72, dur=1.4):
    n = int(dur * SR)
    t = tvec(n)
    f = f0 + 55 * np.exp(-t / 0.045)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.38)
    skin = lp(rng.standard_normal(n), 700) * np.exp(-t / 0.03) * 0.8
    return fade(norm(np.tanh(1.5 * (body + skin))), 0.0005, 0.05)


def make_impact(dur=3.5):
    n = int(dur * SR)
    t = tvec(n)
    f = 27 + 48 * np.exp(-t / 0.5)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.1)
    thud = lp(rng.standard_normal(n), 260) * np.exp(-t / 0.15) * 1.5
    crack = bp(rng.standard_normal(n), 300, 3000) * np.exp(-t / 0.05) * 0.5
    return fade(norm(np.tanh(1.6 * (body + thud + crack))), 0.0005, 0.3)


def make_heartbeat():
    n = int(0.6 * SR)
    t = tvec(n)
    out = np.zeros(n)
    for off, g in ((0.0, 1.0), (0.19, 0.72)):
        tt = np.clip(t - off, 0, None)
        f = 38 + 50 * np.exp(-tt / 0.03)
        out += g * (t >= off) * np.sin(2 * np.pi * np.cumsum(f * (t >= off)) / SR) * np.exp(-tt / 0.12)
    return fade(norm(lp(out, 160)), 0.001, 0.05)


def make_tick():
    n = int(0.09 * SR)
    t = tvec(n)
    x = bp(rng.standard_normal(n), 3000, 9000) * np.exp(-t / 0.006)
    x += np.sin(2 * np.pi * 2637 * t) * np.exp(-t / 0.025) * 0.6
    return norm(x)


def make_riser(dur, pitch=True):
    n = int(dur * SR)
    t = tvec(n)
    ramp = t / dur
    fc = 500 * (14000 / 500) ** ramp
    out = []
    for _ in range(2):
        z = sweep_lp(rng.standard_normal(n), fc, q=1.2)
        out.append(hp(z, 250) * ramp ** 2.2)
    out = np.vstack(out)
    if pitch:
        f = mtof(50 + 36 * ramp ** 1.4)
        s = sweep_lp(saw(f, n) + saw(f * 1.006, n), fc * 0.6, q=2.0) * ramp ** 2.5 * 0.5
        out += s
    return norm(out)


def reverse_crash(dur):
    c = make_crash(dur + 0.2)[:, :int(dur * SR)][:, ::-1]
    return norm(c * np.linspace(0, 1, c.shape[1]) ** 1.5)


def make_braam(notes, dur=3.2):
    n = int(dur * SR)
    t = tvec(n)
    out = []
    for ch in range(2):
        x = np.zeros(n)
        for m in notes:
            for det in (-0.13, 0.0, 0.13):
                x += saw(mtof(m + det + (0.03 if ch else -0.03)), n)
        fc = 110 + 2600 * (1 - np.exp(-t / 0.1)) * np.exp(-t / 1.0)
        x = sweep_lp(x, fc, q=1.4)
        x = np.tanh(2.2 * norm(x)) * (1 - np.exp(-t / 0.012)) * np.exp(-t / 1.5)
        out.append(x)
    return fade(norm(np.vstack(out)), 0.002, 0.4)


KICK, KICK_BIG = make_kick(), make_kick(0.9, 40)
CLAP, SNARE = make_clap(), make_snare()
HAT_C, HAT_O = make_hat(), make_hat(True)
CRASH = make_crash()
TAIKO, TOM_HI, TOM_MID = make_taiko(), make_taiko(130, 0.7), make_taiko(98, 0.9)
IMPACT, HEART, TICK = make_impact(), make_heartbeat(), make_tick()
kick_times = []
EVENTS = dict(kick=[], clap=[], snare=[], impact=[], crash=[])   # seconds, read by render.py


def ev(kind, s, gain=1.0):
    EVENTS[kind].append((round(s / SR, 5), round(float(gain), 3)))


def kick(bar, beat, gain=0.95, big=False):
    s = smp(bar, beat)
    put(drums, KICK_BIG if big else KICK, s, gain)
    kick_times.append(s)
    ev("kick", s, gain)


# ------------------------------------------------------------------ harmony
CHORDS = {"Dm": (50, 3), "Bb": (46, 4), "F": (53, 4), "C": (48, 4), "Gm": (55, 3), "A": (57, 4),
          "Em": (52, 3), "G": (55, 4), "D": (50, 4), "Am": (57, 3), "B": (47, 4), "E": (52, 4)}
P1 = ["Dm", "Bb", "F", "C"]
P2 = ["Dm", "Bb", "Gm", "A"]
LOOP8 = P1 + P2


def chord_at(b):
    if b < 4:
        return "Dm"
    if b < 8:
        return ["Dm", "Bb", "Gm", "A"][b - 4]
    if b < 52:
        return P1[(b - 8) % 4]
    if b < 56:
        return P2[b - 52]
    if b < 60:
        return P1[b - 56]
    if b < 64:
        return ["Bb", "C", "Gm", "A"][b - 60]
    if b < 118:
        return LOOP8[(b - 64) % 8]
    if b < 120:
        return ["C", "B"][b - 118]
    if b < 128:
        return ["Em", "C", "G", "D", "Em", "C", "Am", "B"][b - 120]
    if b < 130:
        return ["C", "D"][b - 128]
    return "E"


def voicing(name, top=True):
    r, third = CHORDS[name]
    v = [r, r + 7, r + 12, r + 12 + third]
    return v + [r + 19] if top else v


def sub_note(name):
    r = CHORDS[name][0] - 12
    return r if r <= 44 else r - 12


def arp_root(name):
    r = CHORDS[name][0]
    return r + 12 if r + 12 <= 68 else r


# main theme, (midi, start16, len16) per bar
MEL = [
    [(74, 0, 4), (69, 4, 2), (74, 6, 2), (76, 8, 2), (77, 10, 4), (76, 14, 2)],
    [(74, 0, 6), (72, 6, 2), (70, 8, 4), (69, 12, 4)],
    [(69, 0, 2), (72, 2, 2), (77, 4, 4), (76, 8, 2), (77, 10, 2), (79, 12, 4)],
    [(76, 0, 8), (74, 8, 2), (72, 10, 2), (76, 12, 4)],
    [(74, 0, 4), (69, 4, 2), (74, 6, 2), (76, 8, 2), (77, 10, 4), (79, 14, 2)],
    [(77, 0, 2), (82, 2, 4), (81, 6, 2), (77, 8, 4), (74, 12, 4)],
    [(82, 0, 4), (81, 4, 2), (79, 6, 2), (77, 8, 4), (79, 12, 4)],
    [(81, 0, 8), (79, 8, 2), (76, 10, 2), (73, 12, 4)],
]
MEL_C = [(79, 0, 4), (76, 4, 2), (79, 6, 2), (84, 8, 4), (79, 12, 4)]
MEL_B = [(78, 0, 8), (75, 8, 2), (71, 10, 2), (78, 12, 4)]
HOOK = {"Dm": [69, 74, 69, 77, 76], "Bb": [70, 74, 70, 77, 74],
        "F": [69, 72, 69, 77, 76], "C": [67, 72, 67, 76, 74],
        "Gm": [67, 70, 67, 74, 72], "A": [69, 73, 69, 76, 73]}


def melody_at(b):
    if 64 <= b < 118:
        return MEL[(b - 64) % 8]
    if b == 118:
        return MEL_C
    if b == 119:
        return MEL_B
    if 120 <= b < 128:
        return [(m + 2, s, d) for m, s, d in MEL[(b - 120) % 8]]
    return []


# ------------------------------------------------------------------ voices
def supersaw(m, n, voices=7, spread=0.2, bright=4500):
    out = np.zeros((2, n))
    for v in range(voices):
        d = spread * (2 * v / (voices - 1) - 1)
        s = saw(mtof(m + d), n)
        p = (v % 2) * 2 - 1 if v != voices // 2 else 0
        out[0] += s * (1 - 0.6 * max(p, 0))
        out[1] += s * (1 + 0.6 * min(p, 0))
    return lp(out, bright) / voices


def pad_bar(bar, nbars=1, cutoff=3800, gain=0.16, attack=0.01, top=True, octave=0, verb=0.25):
    name = chord_at(bar)
    n = int(nbars * 4 * BEAT_SAMPLES) + int(0.08 * SR)
    x = sum(supersaw(m + octave, n, bright=cutoff) for m in voicing(name, top))
    x = fade(x, attack, 0.08)
    put(synth, x, smp(bar), gain, verb=verb)


def pad_sweep(bar0, nbars, f0, f1, gain=0.16):
    n = int(nbars * 4 * BEAT_SAMPLES)
    fc = f0 * (f1 / f0) ** (np.arange(n) / n) ** 1.6
    out = np.zeros((2, n))
    for k in range(nbars):
        s, e = smp(k), smp(k + 1)
        name = chord_at(bar0 + k)
        out[:, s:e] = sum(supersaw(m, e - s, bright=16000) for m in voicing(name))
        out[:, s:e] = fade(out[:, s:e], 0.004, 0.01)
    out = np.vstack([sweep_lp(out[c], fc, q=1.1) for c in range(2)])
    put(synth, out, smp(bar0), gain, verb=0.25)


def strings_bar(bar, gain=0.13, octave=12):
    name = chord_at(bar)
    n = int(4 * BEAT_SAMPLES) + int(0.2 * SR)
    t = tvec(n)
    x = np.zeros((2, n))
    for m in voicing(name, top=False)[1:]:
        for v in range(4):
            vib = 0.07 * np.sin(2 * np.pi * (5.0 + 0.3 * v) * t + v)
            s = saw(mtof(m + octave + vib + (v - 1.5) * 0.06), n)
            x[v % 2] += s
    x = lp(x, 2600)
    x = fade(norm(x), 0.18, 0.2)
    put(synth, x, smp(bar), gain, verb=0.35)


def sub_bar(bar, gain=0.5, nbars=1):
    m = sub_note(chord_at(bar))
    n = int(nbars * 4 * BEAT_SAMPLES)
    x = sine(mtof(m), n) + 0.18 * sine(mtof(m + 12), n)
    put(bass, fade(x, 0.004, 0.01), smp(bar), gain)


def roll_bass_bar(bar, gain=0.26, pattern=(1, 2, 3)):
    m = sub_note(chord_at(bar)) + 12
    L = BEAT_SAMPLES // 4
    for beat in range(4):
        for s16 in pattern:
            n = L
            t = tvec(n)
            x = saw(mtof(m), n) + saw(mtof(m + 0.08), n)
            bright, dark = lp(x, 2600), lp(x, 240)
            e = np.exp(-t / 0.035)
            y = dark + e * (bright - dark)
            y = fade(y * (0.6 + 0.4 * np.exp(-t / 0.08)), 0.002, 0.012)
            put(bass, y, smp(bar, beat + s16 / 4), gain)


def pluck(m, n_len, decay=0.2):
    n = n_len + int(0.05 * SR)
    t = tvec(n)
    x = saw(mtof(m), n) + 0.5 * pulse(mtof(m + 0.05), n)
    bright, dark = lp(x, 7000), lp(x, 600)
    y = dark + np.exp(-t / 0.06) * (bright - dark)
    return fade(y * np.exp(-t / decay), 0.002, 0.03)


def arp_bar(bar, gain=0.13, pattern=(0, 7, 12, None)):
    name = chord_at(bar)
    r, third = arp_root(name), CHORDS[name][1]
    seq = [r, r + 7, r + 12, r + 12 + third]
    L = BEAT_SAMPLES // 4
    bus_part = np.zeros(4 * BEAT_SAMPLES + L * 2)
    for i in range(16):
        m = seq[i % 4] + (12 if (i // 4) == 3 and i % 4 == 0 else 0)
        p = pluck(m, L, 0.12)
        bus_part[i * L:i * L + len(p)] += p[:len(bus_part) - i * L]
    st = pingpong(bus_part.astype(np.float32), int(BEAT_SAMPLES * 0.75), 0.33, 5)
    put(synth, st, smp(bar), gain, verb=0.2)


def hook_bar(bar, gain=0.2):
    notes = HOOK.get(chord_at(bar))
    if not notes:
        return
    for m, pos in zip(notes, (0, 3, 6, 10, 12)):
        p = pluck(m, BEAT_SAMPLES // 2, 0.25)
        st = pingpong(p.astype(np.float32), int(BEAT_SAMPLES * 0.75), 0.3, 4)
        put(synth, st, smp(bar, pos / 4), gain, verb=0.25)


def lead_note(m, n_len, gain, start):
    n = n_len + int(0.06 * SR)
    t = tvec(n)
    vib = 0.12 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.16) / 0.2, 0, 1)
    out = np.zeros((2, n))
    for v, d in enumerate((-0.14, -0.07, 0.0, 0.07, 0.14)):
        s = saw(mtof(m + d + vib), n)
        out[v % 2] += s
        out[(v + 1) % 2] += 0.4 * s
    sq = pulse(mtof(m - 12 + vib), n) * 0.35
    out += sq
    out = lp(out, 7500)
    out = np.tanh(1.3 * norm(out))
    env = np.ones(n)
    env[-int(0.06 * SR):] = np.linspace(1, 0, int(0.06 * SR))
    out = fade(out * env, 0.006, 0.0)
    put(lead_bus, out, start, gain, verb=0.28)
    d = pingpong(norm(out.mean(0)).astype(np.float32) * 0.5, int(BEAT_SAMPLES * 0.75), 0.3, 3)
    d[:, :n] = 0
    put(lead_bus, d, start, gain * 0.5)


def lead_bar(bar, gain=0.3, octave_double=False):
    L = BEAT_SAMPLES // 4
    for m, s16, d16 in melody_at(bar):
        lead_note(m, d16 * L, gain, smp(bar, s16 / 4))
        if octave_double:
            lead_note(m - 12, d16 * L, gain * 0.5, smp(bar, s16 / 4))


def bell(m, dur=1.6):
    n = int(dur * SR)
    t = tvec(n)
    f = mtof(m)
    x = sum(np.sin(2 * np.pi * f * k * (1 + 0.0007 * k * k) * t) * k ** -1.4 * np.exp(-t * (1.6 + 1.5 * k))
            for k in range(1, 7))
    return fade(norm(x), 0.002, 0.1)


def piano_bar(bar, notes, gain=0.32):
    for m, s16, d16 in notes:
        put(synth, bell(m, 1.8), smp(bar, s16 / 4), gain, pan=0.15 * np.sign(m - 72), verb=0.5)


# ------------------------------------------------------------------ patterns
def groove_bar(bar, hats=True, clap=True, open_hats=True, kick_gain=0.95):
    for b in range(4):
        kick(bar, b, kick_gain)
    if clap:
        for b in (1, 3):
            put(drums, CLAP, smp(bar, b), 0.58, verb=0.28)
            ev("clap", smp(bar, b))
    if hats:
        for i in range(16):
            v = (0.55, 0.28, 0.75, 0.3)[i % 4]
            put(drums, HAT_C, smp(bar, i / 4), 0.21 * v, pan=0.25)
    if open_hats:
        for b in range(4):
            put(drums, HAT_O, smp(bar, b + 0.5), 0.16, pan=-0.2, verb=0.1)


def halftime_bar(bar):
    kick(bar, 0, 1.0, big=True)
    kick(bar, 1.75, 0.8)
    kick(bar, 2.5, 0.7)
    put(drums, CLAP, smp(bar, 2), 0.55, verb=0.4)
    put(drums, SNARE, smp(bar, 2), 0.35, verb=0.4)
    ev("clap", smp(bar, 2))
    for b, g in ((0, 0.75), (1.5, 0.45), (2.5, 0.5), (3, 0.6), (3.5, 0.4)):
        put(drums, TAIKO, smp(bar, b), g, pan=0.15 * (1 if b % 1 else -1), verb=0.35)
    for i in range(8):
        put(drums, HAT_C, smp(bar, i / 2), 0.1 * (0.8 if i % 2 else 0.5), pan=0.25)


def snare_roll(bar0, beat0, bar1, beat1, div0, div1, g0=0.12, g1=0.45):
    t0, t1 = bar0 * 4 + beat0, bar1 * 4 + beat1
    t = t0
    while t < t1 - 1e-6:
        r = (t - t0) / (t1 - t0)
        div = div0 * (div1 / div0) ** r
        div = 2 ** round(np.log2(div))
        put(drums, SNARE, int(round(t * BEAT_SAMPLES)), g0 + (g1 - g0) * r ** 1.5,
            pan=0.1 * np.sin(t * 7), verb=0.25)
        ev("snare", int(round(t * BEAT_SAMPLES)), g0 + (g1 - g0) * r ** 1.5)
        t += 1.0 / div


def tom_fill(bar, beat0=2):
    pitches = [TOM_HI, TOM_HI, TOM_MID, TOM_MID, TAIKO, TAIKO, TAIKO, TAIKO]
    for i, tom in enumerate(pitches):
        put(drums, tom, smp(bar, beat0 + i / 4), 0.45 + 0.04 * i, pan=0.4 - 0.1 * i, verb=0.3)


def hit(bar, beat=0, crash=0.4, impact=0.5, verb=0.35):
    s = smp(bar, beat)
    if crash:
        put(fx, CRASH, s, crash, verb=0.12)
        ev("crash", s, crash)
    if impact:
        put(fx, IMPACT, s, impact, verb=verb)
        ev("impact", s, impact)


def braam(bar, notes=(26, 33, 38, 45, 50), gain=0.5):
    put(fx, make_braam(notes), smp(bar), gain, verb=0.3)


def riser(bar0, beat0, bar1, beat1, gain=0.25, pitch=True):
    s0, s1 = smp(bar0, beat0), smp(bar1, beat1)
    put(fx, make_riser((s1 - s0) / SR, pitch), s0, gain, verb=0.15)


def rev_into(bar, beats=1.0, gain=0.3):
    rc = reverse_crash(beats * BEAT)
    put(fx, rc, smp(bar) - rc.shape[1], gain)


# ------------------------------------------------------------------ arrangement
def arrange():
    # INTRO 0-7 -----------------------------------------------------------
    hit(0, crash=0, impact=0.45)
    n4 = smp(4)
    drone = (sine(mtof(38), n4) + 0.5 * sine(mtof(26), n4)) * np.linspace(0, 1, n4) ** 0.5
    put(bass, fade(drone, 0.5, 0.3), 0, 0.32)
    for b in range(4):
        pad_bar(b, cutoff=500 + 350 * b, gain=0.07, attack=0.6 if b == 0 else 0.02, verb=0.5)
        put(drums, HEART, smp(b), 0.75)
        if b >= 2:
            put(drums, HEART, smp(b, 2), 0.6)
        if b >= 2:
            for i in range(8):
                put(drums, HAT_C, smp(b, i / 2), 0.05 + 0.02 * (b - 2), pan=0.3)
    sparkle = [74, 77, 81, 86, 84, 81, 77, 79, 81, 86, 89, 86]
    for i, m in enumerate(sparkle):
        put(synth, bell(m, 1.2), smp(1, i * 0.5 + 0.5 * (i % 3 == 2)), 0.04 + 0.004 * i,
            pan=0.5 * np.sin(i), verb=0.6)
    rev_into(4, 4, 0.35)
    riser(3, 0, 4, 0, 0.15, pitch=False)

    braam(4)
    hit(4, crash=0.55, impact=0.85)
    for b in (4, 5):
        pad_bar(b, cutoff=2800, gain=0.15, verb=0.35)
        strings_bar(b, 0.1)
        sub_bar(b, 0.4)
        for beat, g in ((0, 0.9), (1.5, 0.5), (2, 0.7), (3, 0.6), (3.5, 0.45)):
            put(drums, TAIKO, smp(b, beat), g, verb=0.35)
        kick(b, 0, 0.9, big=True)
        kick(b, 2, 0.7)
    # build 6-7, last beat of bar 7 silent
    pad_sweep(6, 2, 400, 9000, 0.15)
    for b in (6, 7):
        sub_bar(b, 0.35)
    for beat in range(4):
        kick(6, beat, 0.8)
    for i in range(6):
        kick(7, i * 0.5, 0.85)
    snare_roll(6, 0, 7, 3, 2, 8)
    riser(6, 0, 7, 3, 0.3)

    # PART 1  8-55 ----------------------------------------------------------
    for b in range(8, 56):
        grp = (b - 8) // 16
        last = b == 55
        groove_bar(b, open_hats=not last)
        pad_bar(b, cutoff=6000 + 1200 * grp, gain=0.14)
        sub_bar(b, 0.4)
        roll_bass_bar(b, 0.24)
        arp_bar(b, 0.12 if grp == 0 else 0.09)
        if grp >= 1:
            hook_bar(b, 0.17)
        if grp == 2:
            strings_bar(b, 0.1)
            put(drums, TAIKO, smp(b, 0), 0.55, verb=0.3)
            if b % 2:
                put(drums, TAIKO, smp(b, 2.5), 0.35, verb=0.3)
    braam(8, gain=0.42)
    hit(8, crash=0.6, impact=0.9)
    put(fx, KICK_BIG, smp(8), 0.6)
    for i in range(12):
        b = cues.region_start(i)
        if b == 8:
            continue
        big = b in (24, 40)
        hit(b, crash=0.55 if big else 0.32, impact=0.6 if big else 0.28)
        if big:
            rev_into(b, 2, 0.25)
    tom_fill(55, 2)

    # TRANSITION 56-63 -------------------------------------------------------
    hit(56, crash=0.45, impact=0.75, verb=0.6)
    for b in range(56, 60):
        pad_bar(b, cutoff=1300, gain=0.07, attack=0.25, verb=0.5)
        sub_bar(b, 0.3)
        put(drums, HEART, smp(b), 0.6)
        piano_bar(b, MEL[b - 56], 0.13)
    strings_bar(58, 0.07)
    strings_bar(59, 0.08)
    pad_sweep(60, 4, 300, 11000, 0.15)
    for b in range(60, 64):
        sub_bar(b, 0.35)
        if b >= 62:
            arp_bar(b, 0.08)
    for b in range(60, 63):
        for beat in range(4):
            kick(b, beat, 0.75 + 0.05 * (b - 60))
    for i in range(6):
        kick(63, i * 0.5, 0.9)
    snare_roll(60, 0, 63, 3, 1, 8, 0.1, 0.5)
    riser(60, 0, 63, 3, 0.32)

    # PART 2  64-119 --------------------------------------------------------
    for b in range(64, 120):
        half = 88 <= b < 104
        if half:
            halftime_bar(b)
            sub_bar(b, 0.4)
            pad_bar(b, cutoff=5500, gain=0.13)
            strings_bar(b, 0.11)
        else:
            groove_bar(b, open_hats=b != 119)
            sub_bar(b, 0.4)
            roll_bass_bar(b, 0.24)
            pad_bar(b, cutoff=7500, gain=0.13)
            arp_bar(b, 0.07)
            if b >= 104:
                strings_bar(b, 0.1)
        lead_bar(b, 0.3, octave_double=b >= 104)
    braam(64, gain=0.48)
    hit(64, crash=0.65, impact=0.95)
    put(fx, KICK_BIG, smp(64), 0.6)
    for j in range(1, 7):
        hit(cues.pfc_start(j), crash=0.5, impact=0.45)
    for b in cues.page_flips():
        rev_into(b, 1, 0.22)
        hit(b, crash=0.25, impact=0.0)
    hit(88, crash=0.4, impact=0.6)
    snare_roll(103, 0, 104, 0, 4, 8, 0.12, 0.35)
    riser(102, 0, 104, 0, 0.18)
    snare_roll(119, 0, 119, 3.5, 4, 8, 0.12, 0.5)
    riser(118, 0, 119, 3.5, 0.3)

    # NETWORK climax 120-127 (E minor) ---------------------------------------
    for b in range(120, 128):
        groove_bar(b)
        sub_bar(b, 0.4)
        roll_bass_bar(b, 0.24)
        pad_bar(b, cutoff=9000, gain=0.14)
        strings_bar(b, 0.12)
        arp_bar(b, 0.07)
        lead_bar(b, 0.32, octave_double=True)
        put(drums, TAIKO, smp(b, 0), 0.6, verb=0.3)
        if b % 2 == 0:
            hit(b, crash=0.4 if b > 120 else 0.7, impact=0.95 if b == 120 else 0.25)
    braam(120, notes=(28, 35, 40, 47, 52), gain=0.5)
    put(fx, KICK_BIG, smp(120), 0.6)
    tom_fill(127, 2)

    # OUTRO 128-135 -----------------------------------------------------------
    for bar, beat in cues.OUTRO_WORDS:
        name = chord_at(bar)
        n = int(1.8 * BEAT_SAMPLES)
        stab = sum(supersaw(m, n, bright=8000) for m in voicing(name))
        put(synth, fade(stab, 0.004, 0.25), smp(bar, beat), 0.2, verb=0.4)
        kick(bar, beat, 1.0, big=True)
        put(drums, TAIKO, smp(bar, beat), 0.8, verb=0.4)
        put(fx, CRASH, smp(bar, beat), 0.3)
        put(fx, IMPACT, smp(bar, beat), 0.4, verb=0.4)
        put(bass, fade(sine(mtof(sub_note(name)), n), 0.004, 0.2), smp(bar, beat), 0.5)
    put(drums, SNARE, smp(129, 3.5), 0.35, verb=0.4)
    fb = cues.OUTRO_FINAL
    braam(fb, notes=(28, 35, 40, 47, 52, 56), gain=0.55)
    hit(fb, crash=0.6, impact=1.0, verb=0.6)
    put(fx, KICK_BIG, smp(fb), 0.7)
    n = smp(6)
    t = tvec(n)
    tail = sum(supersaw(m, n, bright=3000) for m in voicing("E"))
    tail = tail * np.exp(-t / 3.2) * (1 - np.exp(-t / 0.01))
    put(synth, tail, smp(fb), 0.1, verb=0.5)
    put(bass, sine(mtof(40), n) * np.exp(-t / 2.5), smp(fb), 0.45)
    motif = [(64, 0, 2), (68, 2, 2), (71, 4, 2), (76, 6, 6)]
    for k, bar in enumerate((132, 133)):
        piano_bar(bar, [(m + 12 * k, s, d) for m, s, d in motif], 0.11 - 0.02 * k)
    piano_bar(134, [(76, 0, 8), (80, 0, 8), (83, 0, 8), (88, 0, 8)], 0.07)
    hit(134, crash=0.0, impact=0.35, verb=0.7)

    # text ticks -------------------------------------------------------------
    for bar, beat in cues.text_entries():
        put(fx, TICK, smp(bar, beat), 0.13, pan=0.3, verb=0.2)


def sidechain(depth, rel=0.21):
    ks = np.array(sorted(set(kick_times)), np.int64)
    idx = np.arange(N)
    j = np.searchsorted(ks, idx, side="right") - 1
    dt = np.where(j >= 0, (idx - ks[np.maximum(j, 0)]) / SR, 10.0)
    x = np.clip(dt / rel, 0, 1)
    s = x * x * (3 - 2 * x)
    return (1 - depth * (1 - s)).astype(np.float32)


def limiter(x, ceiling=0.95, release=0.09, look=0.003, block=32):
    """Lookahead peak limiter: instant attack, exponential release."""
    a = np.abs(x).max(0)
    nb = len(a) // block + 1
    padded = np.zeros(nb * block)
    padded[:len(a)] = a
    peak = maximum_filter1d(padded.reshape(nb, block).max(1), size=2 * int(look * SR / block) + 3)
    target = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    rel = np.exp(-block / (release * SR))
    g = np.empty(nb)
    cur = 1.0
    for i, tg in enumerate(target):
        cur = tg if tg < cur else tg + (cur - tg) * rel
        g[i] = cur
    gs = np.interp(np.arange(len(a)), np.arange(nb) * block + block / 2, g)
    return x * gs, gs


def main():
    print("arranging...", flush=True)
    arrange()
    print("mixing...", flush=True)
    sc_bass, sc_synth, sc_lead = sidechain(0.85), sidechain(0.55), sidechain(0.18)
    bass.x *= sc_bass
    synth.x *= sc_synth
    lead_bus.x *= sc_lead
    bass.x = hp(lp(bass.x, 9000), 28).astype(np.float32)
    # silent beat before each drop (reverb tails keep ringing through it)
    for s0, s1 in ((smp(7, 3), smp(8)), (smp(63, 3), smp(64)), (smp(119, 3.5), smp(120))):
        env = np.ones(s1 - s0, np.float32)
        k = int(0.01 * SR)
        env[k:-k] = 0
        env[:k] = np.linspace(1, 0, k)
        env[-k:] = np.linspace(0, 1, k)
        for b in (drums, bass, synth, lead_bus, fx, send):
            b.x[:, s0:s1] *= env
    ir = reverb_ir()
    verb = np.vstack([signal.oaconvolve(send.x[c], ir[c])[:N] for c in range(2)]).astype(np.float32)
    verb = hp(verb, 180).astype(np.float32)
    mix = drums.x * 1.0 + bass.x * 1.0 + synth.x * 1.0 + lead_bus.x * 1.0 + fx.x * 0.9 + verb * 0.55
    mix = hp(mix, 25)
    mix = mix + 0.55 * hp(mix, 4000, order=1)   # gentle air shelf
    for name, b in (("drums", drums), ("bass", bass), ("synth", synth), ("lead", lead_bus), ("fx", fx)):
        seg = b.x[:, smp(64):smp(88)]
        print("  bus %-6s RMS %.1f dB" % (name, 10 * np.log10((seg ** 2).mean() + 1e-12)))
    # glue: gentle saturation, then push ~3 dB into a lookahead limiter
    mix = np.tanh(mix * (0.9 / np.percentile(np.abs(mix), 99.95)))
    mix = mix * (1.35 / np.percentile(np.abs(mix), 99.9))
    mix, g = limiter(mix)
    mix = mix * (0.95 / np.abs(mix).max())
    end = int(DURATION * SR)
    mix[:, end - int(1.5 * SR):end] *= np.linspace(1, 0, int(1.5 * SR))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    wavfile.write(OUT, SR, (mix.T * 32767).astype(np.int16))
    with open(os.path.join(os.path.dirname(OUT), "events.json"), "w") as f:
        json.dump({k: sorted(v) for k, v in EVENTS.items()}, f)
    print("gain reduction p50 %.2f dB, max %.2f dB" % (-20 * np.log10(np.median(g)), -20 * np.log10(g.min())))
    rms = lambda a, b: 20 * np.log10(np.sqrt((mix[:, smp(a):smp(b)] ** 2).mean()) + 1e-9)
    for name, a, b in (("intro", 0, 4), ("title", 4, 8), ("part1", 8, 56), ("breakdown", 56, 60),
                       ("build", 60, 64), ("part2", 64, 88), ("half", 88, 104), ("part2b", 104, 120),
                       ("climax", 120, 128), ("outro", 128, 136)):
        print("%-10s RMS %.1f dBFS" % (name, rms(a, b)))
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
