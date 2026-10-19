#!/usr/bin/env python3
"""Waveform + spectrogram sanity plot with section markers.  usage: audio_report.py bgm.wav out.png"""
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy import signal

sr, x = wavfile.read(sys.argv[1])
x = x.astype(np.float32) / 32768
mono = x.mean(1)
BAR = 1.6
fig, ax = plt.subplots(2, 1, figsize=(19, 8), facecolor='#263B54', gridspec_kw={'height_ratios': [1, 2]}, sharex=True)
t = np.arange(len(mono)) / sr
step = 480
env = np.sqrt(np.convolve(mono ** 2, np.ones(step) / step, 'same'))[::step]
ax[0].fill_between(t[::step], -env, env, color='#9FBDDA', lw=0)
ax[0].set_facecolor('#263B54'); ax[0].set_ylim(-0.6, 0.6); ax[0].set_ylabel('level', color='#CCDBEB')
f, tt, S = signal.spectrogram(mono, sr, nperseg=2048, noverlap=1536)
ax[1].pcolormesh(tt, f, 10 * np.log10(S + 1e-12), shading='auto', cmap='Blues', vmin=-110, vmax=-45)
ax[1].set_yscale('symlog', linthresh=200); ax[1].set_ylim(30, 16000); ax[1].set_facecolor('#263B54')
marks = {1: 'intro', 5: 'DROP 1', 37: 'breakdown', 41: 'build', 45: 'DROP 2', 61: 'key up', 77: 'loops', 81: 'finale', 85: 'outro'}
for b, name in marks.items():
    for a in ax:
        a.axvline((b - 1) * BAR, color='#F4F7FB', lw=0.8, alpha=0.6)
    ax[0].text((b - 1) * BAR + 0.3, 0.52, f'b{b} {name}', color='#F4F7FB', fontsize=9)
for a in ax:
    a.tick_params(colors='#CCDBEB')
    for s in a.spines.values(): s.set_color('#497DAE')
ax[1].set_xlabel('seconds', color='#CCDBEB'); ax[1].set_ylabel('Hz', color='#CCDBEB')
plt.tight_layout(); plt.savefig(sys.argv[2], dpi=70, facecolor='#263B54')
print('saved', sys.argv[2])
