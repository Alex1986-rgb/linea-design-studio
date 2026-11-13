"""Фоновая музыка ролика — синтез (своя, без чужих прав): тёплый лёгкий поп-эмбиент, 96 BPM, Fmaj7 – G6 – Em7 – Am7,
пэд + «электропиано»-арпеджио + мягкий бас + лёгкий шейкер и бочка, реверберация. numpy → WAV 48 кГц стерео.
  uv run --with numpy python music.py <секунд> <out.wav>"""
import sys, wave, numpy as np

SR, BPM = 48000, 96
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 80.0
out = sys.argv[2] if len(sys.argv) > 2 else "music.wav"
beat = 60 / BPM; bar = 4 * beat
N = int(dur * SR); L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
CH = [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67]]   # Fmaj7 G6 Em7 Am7
BASS = [41, 43, 40, 45]

def add(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR); j = min(N, i + len(sig))
    if i >= N: return
    s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))

def env(n, a, d, s, r):
    e = np.full(n, s); A, D, Rl = int(a * SR), int(d * SR), int(r * SR)
    e[:A] = np.linspace(0, 1, max(A, 1)); e[A:A + D] = np.linspace(1, s, max(len(e[A:A + D]), 1)) if D else s
    if Rl: e[-Rl:] *= np.linspace(1, 0, Rl)
    return e

def pad(notes, length):
    n = int(length * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in notes:
        f = hz(m)
        for det in (-0.12, 0.0, 0.11):                       # лёгкий хор из трёх голосов
            ff = f * 2 ** (det / 12)
            s += np.sin(2 * np.pi * ff * t) * 0.6 + np.sin(2 * np.pi * 2 * ff * t) * 0.15 + np.sin(2 * np.pi * 3 * ff * t) * 0.05
    return s / 30 * env(n, 0.8, 0.5, 0.85, 1.0)

def ep(m, length):                                       # «электропиано»: синус + обертон, затухание, тремоло
    n = int(length * SR); t = np.arange(n) / SR; f = hz(m)
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6) + 0.1 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 9))
    return s * np.exp(-t * 2.2) * (1 + 0.06 * np.sin(2 * np.pi * 5 * t)) * 0.22

def bass(m, length):
    n = int(length * SR); t = np.arange(n) / SR; f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * env(n, 0.01, 0.2, 0.7, 0.15) * 0.32

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * (45 + 80 * np.exp(-t * 30)) * t) * np.exp(-t * 9) * 0.5

def shaker():
    n = int(0.08 * SR); return rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 60) * 0.035

intro = 2 * bar                                          # вступление — только пэд и пиано, ритм входит со 3-го такта
t = 0.0; k = 0
while t < dur:
    c = k % 4
    add(pad(CH[c], bar + 1.0), t, 0.0)
    for b in range(8):                                   # восьмые арпеджио
        m = CH[c][[0, 1, 2, 3, 2, 1, 2, 3][b]] + 12
        add(ep(m, 1.4), t + b * beat / 2, pan=(-0.35 if b % 2 else 0.35), gain=0.9 if b % 4 == 0 else 0.7)
    if t >= intro:
        for b in range(4):
            add(bass(BASS[c], beat * 0.95), t + b * beat, 0.0, 1.0 if b in (0, 2) else 0.7)
            if b in (0, 2): add(kick(), t + b * beat, 0.0, 0.8)
            for h in range(2): add(shaker(), t + b * beat + h * beat / 2 + beat / 4, 0.4)
    t += bar; k += 1

def reverb(x):                                           # свёртка с экспоненциальным шумовым хвостом (1,8 с)
    n = int(1.8 * SR); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2); ir /= np.sqrt((ir ** 2).sum())
    m = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]

L = L + 0.28 * reverb(L); R = R + 0.28 * reverb(R)
fade = int(3.0 * SR); L[-fade:] *= np.linspace(1, 0, fade); R[-fade:] *= np.linspace(1, 0, fade)
L[: int(0.5 * SR)] *= np.linspace(0, 1, int(0.5 * SR)); R[: int(0.5 * SR)] *= np.linspace(0, 1, int(0.5 * SR))
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk * 0.8, R / pk * 0.8
st = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print("музыка:", out, round(dur, 1), "с")
