# -*- coding: utf-8 -*-
"""
Lay a game's sound out as one sprite, the way the atlases lay out its art.

Sound in a browser game costs two things art does not: a request per noise
and a decode per request. Thirty small files would be thirty round trips
before the first shot and thirty buffers to hold, so every cue goes into ONE
file, back to back with a breath of silence between them, and a JSON says
where each one starts and how long it runs. One request, one decode, one
buffer; playing a cue is an offset into it.

The silence between cues is deliberate: an AAC encoder shifts everything a
frame or two late, and a cue that begins after its own silence cannot be
clipped by that shift, however the browser decodes it. The games measure
that shift once, on the sprite itself, and read every offset through it.

Loops live in the same file, made periodic here so that the window the game
loops need not be exactly the window this laid down. See `shape`.

Each game has a table naming what it takes from which pack; this is the part
they share. AAC rather than Opus or Vorbis: this has to play on the iPhone
the site is read on as much as on the desktop it was built on.
"""
import json
import os
import struct
import subprocess

import numpy as np

#: the sprite's sample rate. The packs are 44.1k; the browser resamples to
#: whatever the output device wants anyway, so there is nothing to gain by
#: going higher and a third of the file to lose
SR = 44100
#: silence between cues, wide enough that no decoder's frame shift reaches
#: into the cue before it
GAP = 0.15
#: how loud a cue may be before its own gain is applied. Several of these
#: packs ship clipped (peaks of 1.4), so everything is brought to a common
#: ceiling first and balanced from there
CEIL = 0.9
#: anything below this fraction of a clip's peak, at either end, is silence
HUSH = 0.02


def load(path):
    """A clip as mono float, whatever it arrived as."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def trim(x, head=0.0, tail=0.0):
    """Cut the silence off both ends, then any head or tail the cue asked for."""
    if not x.size:
        return x
    live = np.nonzero(np.abs(x) > np.abs(x).max() * HUSH)[0]
    if live.size:
        x = x[max(0, live[0] - int(SR * 0.004)):live[-1] + int(SR * 0.01)]
    if head:
        x = x[int(SR * head):]
    if tail:
        x = x[:int(SR * tail)]
    return x


#: how much of a loop's tail is folded back over its head to make it periodic
SEAM = 0.25


def shape(x, gain, loop=False):
    """
    One cue, levelled and topped and tailed so it cannot click.

    A loop is treated differently, and the reason is worth writing down. It
    gets no fades — it is never heard starting or stopping — and instead its
    last quarter second is crossfaded back over its first, which makes the
    clip PERIODIC: its end now runs into its own beginning. That matters
    because a decoder may hand back the sprite a frame or two late, so the
    window the game loops is not quite the window this script laid down —
    and any window the length of a period, taken anywhere in a periodic
    signal, loops just as seamlessly as the one it was cut from.
    """
    if not x.size:
        return x
    x = x * (CEIL / max(np.abs(x).max(), 1e-6)) * gain
    if loop:
        n = int(SR * SEAM)
        if x.size > n * 3:
            fade = np.linspace(0, 1, n)
            head, tail = x[:n].copy(), x[-n:]
            x = x[:-n]
            x[:n] = head * fade + tail * (1 - fade)
        return x
    n_in, n_out = int(SR * 0.004), int(SR * 0.012)
    if x.size > n_in + n_out:
        x[:n_in] *= np.linspace(0, 1, n_in)
        x[-n_out:] *= np.linspace(1, 0, n_out)
    return x


def write_wav(path, x):
    """A plain 16-bit file for ffmpeg to swallow — no library needed for that."""
    data = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, SR, SR * 2, 2, 16))
        f.write(b"data" + struct.pack("<I", len(data)) + data)


def encode(src, dst, args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, *args, dst], check=True)


def build_sprite(cues, packs, out, loops=()):
    """
    Every cue in `cues` into out/sfx.m4a, with out/sfx.json saying where.

    A cue is a list of takes — (pack, file, gain, head, tail) — and which
    take plays is the game's business, decided at the moment it plays so
    that thirty creeps do not die in unison.
    """
    board, index, at = [], {}, 0.0
    for cue, takes in cues.items():
        slots = []
        for pack, name, gain, head, tail in takes:
            p = os.path.join(packs, pack, name)
            if not os.path.exists(p):
                raise SystemExit(f"{cue}: no {pack}/{name} under {packs}")
            x = shape(trim(load(p), head, tail), gain, cue in loops)
            if not x.size:
                raise SystemExit(f"{cue}: {name} is silent")
            board.append(x)
            board.append(np.zeros(int(SR * GAP)))
            slots.append([round(at, 4), round(x.size / SR, 4)])
            at += (x.size / SR) + GAP
        index[cue] = slots
        print(f"  {cue:11} {len(slots)} take(s), {sum(s[1] for s in slots):5.2f}s"
              f"{'  (loop)' if cue in loops else ''}")
    sprite = np.concatenate(board)
    os.makedirs(out, exist_ok=True)
    raw = os.path.join(out, "sfx.wav")
    write_wav(raw, sprite)
    dst = os.path.join(out, "sfx.m4a")
    encode(raw, dst, ["-c:a", "aac", "-b:a", "96k", "-ac", "1"])
    os.remove(raw)
    json.dump({"rate": SR, "cues": index},
              open(os.path.join(out, "sfx.json"), "w", encoding="utf-8"),
              separators=(",", ":"))
    print(f"  sprite: {len(cues)} cues, {sprite.size / SR:.1f}s, "
          f"{os.path.getsize(dst) / 1024:.0f} kB")


def build_music(tracks, packs, out):
    """
    One file per track, cut to the window that loops and re-encoded small.

    Each is faded in at the front and out at the back, so a track that comes
    round again does it as a breath rather than a splice. That breath is
    audible once every minute and a half; a hard cut would be audible every
    time and wrong every time.
    """
    for name, (src_name, start, end) in tracks.items():
        src = os.path.join(packs, "music", src_name)
        if not os.path.exists(src):
            print(f"  {name}: no {src_name}, skipped")
            continue
        dst = os.path.join(out, f"{name}.m4a")
        os.makedirs(out, exist_ok=True)
        encode(src, dst, [
            "-ss", str(start), "-to", str(end),
            # every track to the same loudness first. These come from
            # different rooms and different decades — an orchestral loop
            # mastered quiet and a synthwave one mastered hot — and without
            # this the music sits under the game in one place and on top of
            # it in another. -22 LUFS is a background: present, not competing
            "-af", "loudnorm=I=-22:TP=-3:LRA=11,"
                   "afade=t=in:st=0:d=1.5,afade=t=out:st=%g:d=2.5"
                   % (end - start - 2.5),
            "-c:a", "aac", "-b:a", "80k", "-ac", "2",
        ])
        print(f"  {name:8} {end - start:5.1f}s  {os.path.getsize(dst) / 1024:.0f} kB")
