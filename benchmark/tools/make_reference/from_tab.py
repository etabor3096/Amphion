"""Replace a reference's guitar and bass notes with a published tab, lined up to the benchmark audio.

usage (from the repo root):
    python benchmark/tools/make_reference/from_tab.py benchmark/tools/make_reference/configs/<id>.json \
        --audio-dir benchmark/audio/trimmed --tabs-dir benchmark/audio/tabs

The config names the song, its tab text files (in --tabs-dir, format in tabtext.py) and how to fit the timing:
    id            the manifest id; the reference is benchmark/references/<id>.json and the audio is its audioFile
    parts         {"guitar": "<file>", "bass": "<file>"}
    map_from      the part whose bars and tempo marks set the beat-to-time map
    bpm           tempo until the tab's first tempo mark
    fit_parts     parts used to fit the timing
    offset_range  [lo, hi] seconds to search for bar 1 (keep it narrow: wide ranges lock on a beat early or late)
    band          [lo, hi] MIDI pitches of the audio to compare (default [28, 90])
    local_range   seconds each bar may move from the global fit (default 0.15)
    anchors       optional {bar: seconds} to pin bars by hand; bars up to the last anchor are placed between them

It fits a start offset and tempo scale for the whole song to the audio's note onsets, then lets each bar move a little
(median of 5 bars), and writes the notes. Everything else in the reference is left as it was. Bar start times go to
--tabs-dir/<id>.timing.json for agreement.py --by-section. The timing is fitted to the audio, never to the pipeline's
notes, so the pipeline gets no head start.
"""
import argparse
import json
from pathlib import Path

import numpy as np

import align
import tabtext

BENCHMARK = Path(__file__).resolve().parents[2]


def make_beat_map(bars, default_bpm):
    """Beat -> seconds at the tab's own tempo marks."""
    pts = [(0.0, 0.0)]
    t = 0.0
    bpm = default_bpm
    for (_, b0, blen, bbpm) in bars:
        if bbpm:
            bpm = bbpm
        t += blen * 60.0 / bpm
        pts.append((b0 + blen, t))
    xb = np.array([p[0] for p in pts])
    xt = np.array([p[1] for p in pts])
    return lambda b: float(np.interp(b, xb, xt, right=xt[-1] + (b - xb[-1]) * 60.0 / bpm))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('config')
    ap.add_argument('--audio-dir', required=True)
    ap.add_argument('--tabs-dir', required=True)
    ap.add_argument('--out', help='write here instead of over the reference')
    args = ap.parse_args()

    cfg = json.load(open(args.config))
    manifest = json.load(open(BENCHMARK / 'manifest.json'))
    song = next(s for s in manifest['songs'] if s['id'] == cfg['id'])
    ref_path = BENCHMARK / song['reference']
    tabs = Path(args.tabs_dir)

    C, dur = align.audio_cqt(str(Path(args.audio_dir) / song['audioFile']))
    parts = {inst: tabtext.parse(tabs / name, inst) for inst, name in cfg['parts'].items()}

    ref_inst = cfg.get('map_from', list(parts)[0])
    bars_ref = parts[ref_inst][0]
    beat2nom = make_beat_map(bars_ref, cfg['bpm'])
    for inst, (bars, _) in parts.items():
        for (bn, b0, _, _) in bars:
            match = [b for b in bars_ref if b[0] == bn]
            if match and abs(match[0][1] - b0) > 1e-6:
                raise SystemExit(f'{inst} bar {bn} starts at beat {b0}, {ref_inst} at {match[0][1]}')

    fit_notes = [n for inst in cfg['fit_parts'] for n in parts[inst][1]]
    band = tuple(cfg.get('band', (28, 90)))
    Con = align.onset_env(C)
    mask = np.zeros(align.NBINS, bool)
    mask[band[0] - align.FMIN_MIDI:band[1] - align.FMIN_MIDI] = True
    Con[~mask] = 0

    def score_map(notes, f):
        R = align.roll(notes, f, C.shape[1], harmonics=(1.0, 0.5))
        return align.score(Con, align.onset_env(R))

    # global fit: offset, then offset and tempo scale together
    lo, hi = cfg.get('offset_range', [-5, 15])
    best = None
    for off in np.arange(lo, hi, 0.1):
        s = score_map(fit_notes, lambda b: off + beat2nom(b))
        if best is None or s > best[0]:
            best = (s, off, 1.0)
    for sc in np.linspace(0.97, 1.03, 61):
        for off in np.arange(best[1] - 0.3, best[1] + 0.3, 0.01):
            s = score_map(fit_notes, lambda b: off + sc * beat2nom(b))
            if s > best[0]:
                best = (s, off, sc)
    gs, goff, gsc = best
    print(f'global: score {gs:.3f} offset {goff:.3f}s scale {gsc:.4f}')

    # per-bar shift; a shift must beat no shift by 5% to count
    local_range = cfg.get('local_range', 0.15)
    bar_shift = {}
    rows = []
    for (bn, b0, blen, _) in bars_ref:
        ns = [n for n in fit_notes if b0 - 1e-9 <= n['start'] < b0 + blen - 1e-9]
        t0 = goff + gsc * beat2nom(b0)
        if t0 > dur:
            break
        if len(ns) < 2:
            continue
        base = score_map(ns, lambda b: goff + gsc * beat2nom(b))
        bb = (base, 0.0)
        for sh in np.arange(-local_range, local_range + 0.001, 0.01):
            s = score_map(ns, lambda b: goff + gsc * beat2nom(b) + sh)
            if s > bb[0] * 1.05:
                bb = (s, sh)
        bar_shift[bn] = bb[1]
        rows.append((bn, round(t0, 2), round(bb[1], 2), round(base, 2), round(bb[0], 2)))
    bns = sorted(bar_shift)
    sm = {bn: float(np.median([bar_shift[x] for x in bns[max(0, i - 2):i + 3]])) for i, bn in enumerate(bns)}
    print('bar start_s raw_shift score_at_0 best_score smoothed_shift')
    for r in rows:
        print(*r, round(sm.get(r[0], 0), 2))

    xs, ys = [], []
    for (bn, b0, _, _) in bars_ref:
        xs.append(b0)
        shift = sm.get(bn)
        if shift is None:
            near = min(bns, key=lambda x: abs(x - bn)) if bns else None
            shift = sm[near] if near is not None else 0.0
        ys.append(goff + gsc * beat2nom(b0) + shift)
    xs = np.array(xs)
    ys = np.array(ys)
    anchors = {int(k): float(v) for k, v in cfg.get('anchors', {}).items()}
    if anchors:
        abars = sorted(anchors)
        bar_beat = {bn: b0 for (bn, b0, _, _) in bars_ref}
        an_nom = [beat2nom(bar_beat[a]) for a in abars]
        an_t = [anchors[a] for a in abars]
        for i, (bn, b0, _, _) in enumerate(bars_ref):
            if bn <= abars[-1]:
                ys[i] = float(np.interp(beat2nom(b0), an_nom, an_t))
        print('anchored bars', abars[0], '-', abars[-1], anchors)

    def beat2sec(b):
        if b <= xs[-1]:
            return float(np.interp(b, xs, ys))
        return float(ys[-1] + gsc * (beat2nom(b) - beat2nom(xs[-1])))

    ref = json.load(open(ref_path))
    for inst, (_, notes) in parts.items():
        out = []
        for n in sorted(notes, key=lambda n: (n['start'], n['pitch'])):
            t0 = beat2sec(n['start'])
            t1 = beat2sec(n['start'] + n['dur'])
            if t0 >= ref['duration'] or t0 < 0:
                continue
            t1 = min(t1, ref['duration'])
            out.append({
                'id': f'{inst}-{len(out)}',
                'startTime': round(t0, 3),
                'duration': round(max(t1 - t0, 0.01), 3),
                'string': n['string'],
                'fret': n['fret'],
                'pitch': n['pitch'],
                'confidence': 1.0,
                'edited': False,
            })
        ref[inst] = {'notes': out}
        print(inst, 'notes written', len(out))
    out_path = Path(args.out) if args.out else ref_path
    with open(out_path, 'w') as fh:
        json.dump(ref, fh, indent=2)
        fh.write("\n")
    timing = {'offset': goff, 'scale': gsc, 'bar_starts': {int(bn): float(y) for (bn, *_), y in zip(bars_ref, ys)}}
    (tabs / f'{cfg["id"]}.timing.json').write_text(json.dumps(timing))
    print('wrote', out_path)


if __name__ == '__main__':
    main()
