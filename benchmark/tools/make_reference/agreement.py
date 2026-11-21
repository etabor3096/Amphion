"""Check that a reference is lined up with its audio, using the pipeline's notes as a witness.

usage (from the repo root):
    python benchmark/tools/make_reference/agreement.py benchmark/references/<id>.json PIPELINE_RESULT.json --bpm 153
    ... --by-section benchmark/audio/tabs/<id>.timing.json      (8-bar sections, after from_tab.py)

PIPELINE_RESULT.json is the pipeline's output for the same audio (`python -m amphion_pipeline song.wav -o ...`) or an
earlier draft reference. For each part it prints the share of reference notes that have a pipeline note with the same
pitch class within 100 ms, with the reference shifted by -1, -1/2, 0, +1/2 and +1 beat. A good fit peaks clearly at 0.
A flat row means that stretch could be off by a beat or more and needs a listen in review.html. This only checks the
timing; it does not move anything.
"""
import argparse
import json

import numpy as np


def hits(ref_notes, wit, shift):
    return sum(((abs(wit[:, 0] - (t + shift)) < 0.1) & (wit[:, 1] % 12 == p % 12)).any() for t, p in ref_notes)


def notes_of(doc, inst):
    return [(n['startTime'], n['pitch']) for n in doc[inst]['notes']] if doc.get(inst) else []


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('reference')
    ap.add_argument('pipeline_result')
    ap.add_argument('--bpm', type=float, required=True, help='the tempo the beat shifts are counted in')
    ap.add_argument('--by-section', metavar='TIMING_JSON', help='also report every 8 bars (from from_tab.py)')
    args = ap.parse_args()
    ref = json.load(open(args.reference))
    pipe = json.load(open(args.pipeline_result))
    spb = 60.0 / args.bpm

    for inst in ('guitar', 'bass'):
        rn, pn = notes_of(ref, inst), notes_of(pipe, inst)
        if not rn or not pn:
            continue
        wit = np.array(pn)
        row = ' '.join(f'{sh / spb:+.1f} beat {hits(rn, wit, sh) / len(rn):.0%}' for sh in
                       (-spb, -spb / 2, 0, spb / 2, spb))
        print(f'{inst}: {len(rn)} notes; matching a pipeline note at shift {row}')

    if args.by_section:
        bs = json.load(open(args.by_section))['bar_starts']
        wit = np.array([x for inst in ('guitar', 'bass') for x in notes_of(pipe, inst)])
        rn = [x for inst in ('guitar', 'bass') for x in notes_of(ref, inst)]
        shifts = np.arange(-2 * spb, 2.01 * spb, spb / 2)
        print('bars       start   n   ' + ' '.join(f'{s / spb:+.1f}'.rjust(4) for s in shifts) + '   (beats)')
        last = max(int(b) for b in bs)
        for a in range(1, last + 1, 8):
            if str(a) not in bs:
                break
            t0, t1 = bs[str(a)], bs.get(str(a + 8), 1e9)
            sel = [(t, p) for t, p in rn if t0 <= t < t1]
            if not sel:
                continue
            row = [hits(sel, wit, sh) / len(sel) for sh in shifts]
            best = (int(np.argmax(row)) - 4) * 0.5
            print(f'{a:3d}-{a + 7:3d}  {t0:6.1f}s {len(sel):3d}   ' + ' '.join(f'{r:.0%}'.rjust(4) for r in row)
                  + f'   best {best:+.1f}')


if __name__ == '__main__':
    main()
