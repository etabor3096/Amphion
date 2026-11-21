"""Turn a screen recording of a scrolling tab into page images you can read the tab from.

usage: python stitch_video.py RECORDING.mov OUT_PREFIX [--top 330] [--bottom 2300]

Samples about 30 frames a second and finds how far each frame scrolled by comparing the whole overlap, searching only
small moves so repeated bars cannot make it jump. --top and --bottom crop away the app's header and footer (pixels).
Writes OUT_PREFIX_01.png, _02.png, ... with some overlap between pages. Check a page against the raw recording
wherever bars look missing or doubled: stitching is the step most likely to drop a repeated bar.
"""
import argparse

import cv2
import numpy as np

MAX_SHIFT = 220
PAGE_H = 1800


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('video')
    ap.add_argument('out_prefix')
    ap.add_argument('--top', type=int, default=330)
    ap.add_argument('--bottom', type=int, default=2300)
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    step = max(1, int(round(cap.get(cv2.CAP_PROP_FPS) / 30)))
    frames = []
    i = 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        if i % step == 0:
            frames.append(cv2.cvtColor(fr[args.top:args.bottom], cv2.COLOR_BGR2GRAY))
        i += 1
    if not frames:
        raise SystemExit(f'no frames read from {args.video}')
    H, W = frames[0].shape

    def small(g):  # half size, skipping the left 60 px where overlay icons sit
        return cv2.resize(g[:, 60:], ((W - 60) // 2, H // 2)).astype(np.float32)

    pieces = [frames[0]]
    prev, prev_full = small(frames[0]), frames[0]
    shifts = []
    for fr in frames[1:]:
        cur = small(fr)
        h = cur.shape[0]
        s = min(range(0, MAX_SHIFT // 2 + 1), key=lambda s: np.mean(np.abs(prev[s:] - cur[:h - s]))) * 2
        s = min(range(max(0, s - 2), s + 3),
                key=lambda ss: np.mean(np.abs(prev_full[ss:].astype(np.int16) - fr[:H - ss].astype(np.int16))))
        shifts.append(s)
        if s > 0:
            pieces.append(fr[H - s:])
            prev, prev_full = cur, fr
    tall = np.vstack(pieces)
    print(args.video, 'frames', len(frames), 'stitched height', tall.shape[0], 'largest scroll', max(shifts, default=0))
    n = 0
    for y in range(0, tall.shape[0], PAGE_H - 250):
        n += 1
        cv2.imwrite(f'{args.out_prefix}_{n:02d}.png', tall[y:y + PAGE_H])
    print('pages', n)


if __name__ == '__main__':
    main()
