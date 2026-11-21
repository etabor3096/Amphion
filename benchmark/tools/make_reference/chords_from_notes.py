"""Replace a reference's chords with chords worked out from its own notes.

usage (from the repo root):
    python benchmark/tools/make_reference/chords_from_notes.py <id> --timing benchmark/audio/tabs/<id>.timing.json --splits 2 --min-tones 2
    python benchmark/tools/make_reference/chords_from_notes.py <id> --beats-per-window 2

The song is cut into windows: each tab bar split into --splits equal parts (with --timing, from from_tab.py), or
--beats-per-window beats of the reference's own beat grid. In each window every major and minor triad is scored
against the notes sounding there (time-weighted, guitar and bass), with a bonus when the lowest note is the root and a
small bonus for chords in the song's key. Neighbouring windows with the same chord are joined. Only major and minor
names are allowed (RC-20). For a bass part alone the chord is mostly the bass note's triad in the key, so treat those
as a guide, not a transcription. Writes confidence null and edited false.
"""
import argparse
import json
from pathlib import Path

import numpy as np

BENCHMARK = Path(__file__).resolve().parents[2]
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]


def key_chords(key):
    """Diatonic major/minor triads of a key like 'B major' or 'C# minor', as (root, is_minor)."""
    tonic, mode = key.split()
    t = NAMES.index(tonic)
    if mode == 'minor':
        t = (t + 3) % 12  # relative major
    qual = [False, True, True, False, False, True, None]  # I ii iii IV V vi (vii dim left out)
    out = {((t + d) % 12, q) for d, q in zip(MAJOR_SCALE, qual) if q is not None}
    if mode == 'minor':
        out.add(((t + 4) % 12, False))  # the major V of the minor key (G# in C# minor)
    return out


def window_bounds(ref, args):
    if args.timing:
        bs = json.load(open(args.timing))['bar_starts']
        starts = [bs[k] for k in sorted(bs, key=int)]
        edges = []
        for a, b in zip(starts, starts[1:]):
            edges += list(np.linspace(a, b, args.splits + 1)[:-1])
        edges.append(starts[-1])
    else:
        edges = ref['beats'][::args.beats_per_window]
    edges = [e for e in edges if 0 <= e <= ref['duration']]
    return list(zip(edges, edges[1:] + [ref['duration']]))


def best_chord(notes, a, b, diatonic, min_tones=1):
    w = np.zeros(12)
    low = None
    for n in notes:
        s, e = n['startTime'], n['startTime'] + n['duration']
        ov = min(e, b) - max(s, a)
        if ov <= 0:
            continue
        w[n['pitch'] % 12] += ov
        if low is None or n['pitch'] < low[0] or (n['pitch'] == low[0] and ov > low[1]):
            low = (n['pitch'], ov)
    if w.sum() < 0.05:
        return None
    w = w / w.sum()
    if (w > 0.1).sum() < min_tones:
        return 'hold'  # one lone note (a passing note, not a chord): keep the chord before it
    best = None
    for root in range(12):
        for minor in (False, True):
            tones = {root, (root + (3 if minor else 4)) % 12, (root + 7) % 12}
            sc = sum(w[p] for p in tones) - 0.5 * sum(w[p] for p in range(12) if p not in tones)
            sc += 0.6 * w[root]
            if low and low[0] % 12 == root:
                sc += 0.25
            if (root, minor) in diatonic:
                sc += 0.15
            if best is None or sc > best[0]:
                best = (sc, NAMES[root] + ('m' if minor else ''))
    return best[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('id')
    ap.add_argument('--timing', help='bar start times from from_tab.py (tab songs)')
    ap.add_argument('--splits', type=int, default=2, help='windows per tab bar (with --timing)')
    ap.add_argument('--beats-per-window', type=int, default=2, help='without --timing: beats of the reference grid')
    ap.add_argument('--min-tones', type=int, default=1,
                    help='fewest pitch classes that make a chord; 2 carries the chord through lone passing notes '
                         '(use 1 for a bass part alone)')
    ap.add_argument('--out', help='write here instead of over the reference')
    args = ap.parse_args()
    manifest = json.load(open(BENCHMARK / 'manifest.json'))
    song = next(s for s in manifest['songs'] if s['id'] == args.id)
    ref_path = BENCHMARK / song['reference']
    ref = json.load(open(ref_path))
    notes = [n for p in ('guitar', 'bass') if ref.get(p) for n in ref[p]['notes']]
    diatonic = key_chords(ref['key'])
    segs = []
    for a, b in window_bounds(ref, args):
        name = best_chord(notes, a, b, diatonic, args.min_tones)
        if name is None:
            continue
        if name == 'hold':
            if segs and abs(segs[-1]['endTime'] - a) < 1e-3:
                segs[-1]['endTime'] = round(b, 3)
            continue
        if segs and segs[-1]['name'] == name and abs(segs[-1]['endTime'] - a) < 1e-3:
            segs[-1]['endTime'] = round(b, 3)
        else:
            segs.append({'startTime': round(a, 3), 'endTime': round(b, 3), 'name': name})
    ref['chords'] = [{'id': f'chord-{i}', 'startTime': s['startTime'], 'endTime': s['endTime'], 'name': s['name'],
                      'confidence': None, 'edited': False} for i, s in enumerate(segs)]
    out_path = Path(args.out) if args.out else ref_path
    with open(out_path, 'w') as fh:
        json.dump(ref, fh, indent=2)
        fh.write('\n')
    from collections import Counter
    print(args.id, len(segs), 'chords;', ' '.join(f'{k}x{v}' for k, v in Counter(s['name'] for s in segs).most_common()))
    print('  first ones:', ' '.join(f"{s['startTime']:.1f}:{s['name']}" for s in segs[:16]))


if __name__ == '__main__':
    main()
