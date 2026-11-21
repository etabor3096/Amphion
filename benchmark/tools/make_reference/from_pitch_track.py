"""Replace a bass-only recording's reference bass notes with its pitch track.

usage (from the repo root):
    python benchmark/tools/make_reference/from_pitch_track.py with-rob-as-my-witness \
        --audio-dir benchmark/audio/trimmed --allowed "C C# D D# E F# G# A B"

For a recording of one bass and nothing else (no published tab matches it). It tracks the pitch (librosa pYIN), cuts
notes at onsets and at pitch changes that last 5 frames or more, fixes short octave jumps, then removes low-confidence
blips, short slides into a note and doubled attacks. --allowed lists the pitch classes the song uses: a low-confidence
note is kept only if it is 0.1 s or longer and in that list. Strings and frets are chosen for low frets and small hand
moves, because a recording does not say where a note was played. Only the bass part is replaced.
"""
import argparse
import json
from collections import Counter
from pathlib import Path

import librosa
import numpy as np

BENCHMARK = Path(__file__).resolve().parents[2]
SR, HOP = 22050, 256
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
OPEN = {4: 28, 3: 33, 2: 38, 1: 43}  # bass strings E1 A1 D2 G2, 1 = highest


def track(path):
    y, _ = librosa.load(path, sr=SR)
    f0, vflag, vprob = librosa.pyin(y, fmin=librosa.note_to_hz('B0'), fmax=librosa.note_to_hz('G4'), sr=SR,
                                    frame_length=4096, hop_length=HOP)
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    onsets = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, backtrack=False, units='frames')
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    return f0, vflag, vprob, onsets, rms


def runs(arr):
    out = []
    i = 0
    while i < len(arr):
        j = i
        while j + 1 < len(arr) and (arr[j + 1] == arr[i] or (np.isnan(arr[j + 1]) and np.isnan(arr[i]))):
            j += 1
        out.append((i, j, arr[i]))
        i = j + 1
    return out


def segment(f0, vflag, vprob, onsets, rms):
    n = len(f0)
    t = librosa.frames_to_time(np.arange(n), sr=SR, hop_length=HOP)
    midi = librosa.hz_to_midi(np.where(vflag, f0, np.nan))
    dev = midi[vflag] - np.round(midi[vflag])
    print('tuning: median deviation from equal temperament %.0f cents' % (100 * np.median(dev)))
    rnd = np.round(midi)

    # isolated octave jumps: a short run an octave off its neighbours
    for _ in range(2):
        rs = runs(rnd)
        for k in range(1, len(rs) - 1):
            a, b, p = rs[k]
            if np.isnan(p) or b - a > 12:
                continue
            for q in (rs[k - 1][2], rs[k + 1][2]):
                if not np.isnan(q) and abs(p - q) == 12:
                    rnd[a:b + 1] = q
                    break

    quiet = librosa.amplitude_to_db(rms, ref=np.max) < -38
    onset_set = set(int(o) for o in onsets)
    bounds = set(onset_set)
    i = 1
    while i < n:
        if not np.isnan(rnd[i]) and not np.isnan(rnd[i - 1]) and rnd[i] != rnd[i - 1]:
            j = i
            while j < n and rnd[j] == rnd[i]:
                j += 1
            if j - i >= 5:
                bounds.add(i)
            i = j
        else:
            i += 1
    bounds = sorted(b for b in bounds if 0 <= b < n)
    bounds.append(n)

    notes = []
    for a, b in zip(bounds, bounds[1:]):
        seg = rnd[a:b]
        voiced = ~np.isnan(seg) & ~quiet[a:b]
        if voiced.sum() < 5:
            continue
        vals, counts = np.unique(seg[voiced], return_counts=True)
        p = int(vals[np.argmax(counts)])
        if counts.max() < 0.5 * voiced.sum():
            continue
        idx = np.where(voiced & (seg == p))[0]
        start, end = a + idx[0], a + idx[-1] + 1
        conf = float(np.clip(np.mean(vprob[a:b][voiced]), 0, 1))
        notes.append({'s': float(t[start]), 'e': float(t[min(end, n - 1)]), 'p': p, 'conf': conf,
                      'onset': a in onset_set})
    # same pitch split at a pitch boundary with no fresh attack: one note
    merged = []
    for nt in notes:
        if merged and nt['p'] == merged[-1]['p'] and not nt['onset'] and nt['s'] - merged[-1]['e'] < 0.06:
            merged[-1]['e'] = nt['e']
            continue
        merged.append(nt)
    return [x for x in merged if x['e'] - x['s'] >= 0.05]


def place(notes):
    """Viterbi over (string, fret): prefer low frets, small hand moves, few open strings."""
    layers = [[(s, nt['p'] - o) for s, o in OPEN.items() if 0 <= nt['p'] - o <= 15] or [(None, None)]
              for nt in notes]
    cost = [dict() for _ in layers]
    back = [dict() for _ in layers]
    for k, cs in enumerate(layers):
        for c in cs:
            own = 0.0 if c[1] is None else (0.15 * c[1] + (0.4 if c[1] == 0 else 0))
            if k == 0:
                cost[k][c] = own
                continue
            best = None
            for pc, pcost in cost[k - 1].items():
                move = 0 if (c[1] is None or pc[1] is None or c[1] == 0 or pc[1] == 0) else abs(c[1] - pc[1])
                v = pcost + own + 0.5 * move
                if best is None or v < best[0]:
                    best = (v, pc)
            cost[k][c] = best[0]
            back[k][c] = best[1]
    c = min(cost[-1], key=cost[-1].get)
    path = [c]
    for k in range(len(layers) - 1, 0, -1):
        c = back[k][c]
        path.append(c)
    path.reverse()
    return [{'startTime': round(nt['s'], 3), 'duration': round(max(nt['e'] - nt['s'], 0.02), 3), 'string': s,
             'fret': f, 'pitch': nt['p'], 'confidence': round(nt['conf'], 3), 'edited': False}
            for nt, (s, f) in zip(notes, path)]


def clean(notes, allowed):
    notes = sorted(notes, key=lambda x: x['startTime'])
    out = []
    dropped = Counter()
    for i, x in enumerate(notes):
        nxt = notes[i + 1] if i + 1 < len(notes) else None
        end = x['startTime'] + x['duration']
        if x['confidence'] < 0.15 and (x['duration'] < 0.1 or NAMES[x['pitch'] % 12] not in allowed):
            dropped['low confidence'] += 1
            continue
        if (nxt and x['duration'] < 0.15 and abs(nxt['pitch'] - x['pitch']) in (1, 2)
                and nxt['startTime'] - end < 0.05 and nxt['duration'] > x['duration']):
            dropped['slide into the next note'] += 1
            continue
        if (out and out[-1]['pitch'] == x['pitch'] and out[-1]['duration'] < 0.09
                and x['startTime'] - (out[-1]['startTime'] + out[-1]['duration']) < 0.03):
            # a split attack: keep the first onset, take this note's end
            out[-1]['duration'] = round(end - out[-1]['startTime'], 3)
            out[-1]['confidence'] = max(out[-1]['confidence'], x['confidence'])
            dropped['doubled attack'] += 1
            continue
        out.append(dict(x))
    print('kept', len(out), 'dropped', dict(dropped))
    return [{'id': f'bass-{k}', **x} for k, x in enumerate(out)]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('id')
    ap.add_argument('--audio-dir', required=True)
    ap.add_argument('--allowed', required=True, help='pitch classes the song uses, e.g. "C# D# E F# G# A B"')
    ap.add_argument('--out', help='write here instead of over the reference')
    args = ap.parse_args()
    allowed = set(args.allowed.split())
    unknown = allowed - set(NAMES)
    if unknown:
        raise SystemExit(f'not pitch classes: {sorted(unknown)} (use sharps: {" ".join(NAMES)})')

    manifest = json.load(open(BENCHMARK / 'manifest.json'))
    song = next(s for s in manifest['songs'] if s['id'] == args.id)
    ref_path = BENCHMARK / song['reference']
    notes = clean(place(segment(*track(str(Path(args.audio_dir) / song['audioFile'])))), allowed)
    print('median note length %.3f s' % np.median([x['duration'] for x in notes]))
    ref = json.load(open(ref_path))
    ref['bass'] = {'notes': notes}
    out_path = Path(args.out) if args.out else ref_path
    with open(out_path, 'w') as fh:
        json.dump(ref, fh, indent=2)
        fh.write("\n")
    print('wrote', out_path)


if __name__ == '__main__':
    main()
