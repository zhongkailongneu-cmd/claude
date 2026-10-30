"""Generate the soundtrack: sparse plucked-string pentatonic melody over a soft drone, with a low swell
at every scene change. Everything is synthesised (no samples), seeded, and timed from timeline.json.

usage: python music.py timeline.json out.wav
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve

SR = 44100
rng = np.random.default_rng(2026)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pluck(m, dur=3.2, vel=0.35):
    """Additive plucked string: higher partials decay faster; small upward slide into pitch (guqin-like)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f0 = midi_hz(m)
    slide = 1 - 0.012 * np.exp(-t / 0.05)
    phase_base = 2 * np.pi * np.cumsum(f0 * slide) / SR
    out = np.zeros(n)
    for k in range(1, 9):
        inharm = 1 + 0.0004 * k * k
        amp = 1 / k ** 1.25
        decay = np.exp(-t * (0.9 + 0.55 * k ** 0.9))
        out += amp * decay * np.sin(phase_base * k * inharm + rng.uniform(0, 6.28))
    attack = np.minimum(1, t / 0.004)
    noise = np.convolve(rng.normal(0, 1, n), np.ones(6) / 6, mode="same") * np.exp(-t / 0.01) * 0.12  # soft, low-passed pick noise
    return vel * (out * attack + noise)


def drone(notes, dur, amp=0.085):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for i, m in enumerate(notes):
        f = midi_hz(m)
        lfo = 0.75 + 0.25 * np.sin(2 * np.pi * (0.07 + 0.03 * i) * t + i)
        out += lfo * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2.003 * f * t))
    env = np.minimum(1, t / 2.5) * np.minimum(1, (dur - t) / 2.0)
    return amp * out * np.clip(env, 0, 1) / len(notes)


def swell(dur=2.4, amp=0.16):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi_hz(31)  # G1
    tone = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.7) * np.minimum(1, t / 0.03)
    nz = np.convolve(rng.normal(0, 1, n), np.ones(60) / 60, mode="same") * np.exp(-t / 0.35) * 0.5
    return amp * (tone + nz)


def add(buf, sig, at, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1]:
        return
    sig = sig[: buf.shape[1] - i]
    buf[0, i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    buf[1, i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def reverb(x, seconds=2.8):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    wet = np.zeros_like(x)
    for ch in range(2):
        ir = rng.normal(0, 1, n) * np.exp(-t / 0.55)
        ir = np.convolve(ir, np.ones(8) / 8, mode="same")  # soften highs
        ir /= np.sqrt(np.sum(ir ** 2))
        wet[ch] = fftconvolve(x[ch], ir)[: x.shape[1]]
    return wet


def main(tl_path, out_path):
    tl = json.load(open(tl_path, encoding="utf-8"))
    total = tl["total"] + 0.5
    buf = np.zeros((2, int(total * SR)))
    scale = [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79]  # G major pentatonic (= E minor pentatonic)
    scenes = tl["scenes"]
    for si, sc in enumerate(scenes):
        start, dur = sc["start"], sc["dur"]
        blind_spot = sc["nav"] == "盲点"
        root = [40, 47, 52] if blind_spot else [43, 50, 55]  # E-B-E under the "blind spot" chapter, G-D-G elsewhere
        add(buf, drone(root, dur + 1.5), max(0, start - 0.5))
        if si > 0:
            add(buf, swell(), start - 0.15)
        if si == 0:  # title arpeggio as the name appears
            for j, m in enumerate([55, 62, 67, 71, 74]):
                add(buf, pluck(m, 4.0, 0.42), 2.2 + j * 0.28, pan=-0.3 + 0.15 * j)
            continue
        if si == len(scenes) - 1:  # closing chord on the end card
            for j, m in enumerate([43, 55, 62, 71, 79]):
                add(buf, pluck(m, 6.0, 0.4), start + 10.6 + j * 0.09, pan=-0.4 + 0.2 * j)
            continue
        beat = 0.8
        idx = 5
        t = start + 1.2
        bar = 0
        while t < start + dur - 1.5:
            if bar % 8 in (6, 7):  # breathe every few bars
                t += beat
                bar += 1
                continue
            if rng.random() < 0.5:
                idx = int(np.clip(idx + rng.choice([-2, -1, -1, 1, 1, 2]), 2, len(scale) - 1))
                m = scale[idx] - (2 if blind_spot and scale[idx] == 59 else 0)  # flatten B->A colour in the minor section
                add(buf, pluck(m, 3.4, rng.uniform(0.22, 0.36)), t + rng.uniform(-0.02, 0.02), pan=rng.uniform(-0.45, 0.45))
                if rng.random() < 0.18:
                    add(buf, pluck(m - 12, 3.8, 0.2), t, pan=-0.2)
            t += beat / (2 if rng.random() < 0.15 else 1)
            bar += 1
    mix = buf + 0.38 * reverb(buf)
    n = mix.shape[1]
    tt = np.arange(n) / SR
    mix *= np.clip(np.minimum(tt / 1.5, (total - tt) / 3.0), 0, 1)
    mix *= 0.8 / np.max(np.abs(mix))
    wavfile.write(out_path, SR, (mix.T * 32767).astype(np.int16))
    print(f"wrote {out_path}: {total:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
