"""Parse a tab written out as text into notes counted in quarter beats.

One line per bar, `#` starts a comment:

    bpm 33 = 158              tempo from bar 33 on (the tab's tempo marks)
    17: r:q D4:q. D2:q.       bar 17: a quarter rest, then two dotted quarters
    1-16: R4                  bars 1 to 16 are empty bars of 4 beats
    26: =18                   bar 26 is a copy of bar 18

A token is `<what>:<duration>`. `<what>` is a note `<string><fret>` (strings e B G D A E for guitar, G D A E for
bass, so `D4` is the D string, fret 4), a chord of notes joined by `+` (`B0+G3+D4`), `r` for a rest, or `~` to hold
the notes before it longer (a tie). A note written `~G3` inside a chord continues the last G-string note. Durations
are w h q e s t (whole to 32nd), `.` dots them, a trailing `3` makes a triplet, `q+e` adds, and a bare number is a
count of beats (`4` is a whole bar of 4/4). Dead (X) notes have no pitch: leave them out and write a rest.

Check that every bar adds up: `python tabtext.py song.guitar.txt guitar 4`.
"""
import re
import sys
from collections import Counter

TUNINGS = {
    'bass': {'G': 43, 'D': 38, 'A': 33, 'E': 28},
    'guitar': {'e': 64, 'B': 59, 'G': 55, 'D': 50, 'A': 45, 'E': 40},
}
# string numbers in RC-20 (1 = highest)
STRING_NO = {
    'bass': {'G': 1, 'D': 2, 'A': 3, 'E': 4},
    'guitar': {'e': 1, 'B': 2, 'G': 3, 'D': 4, 'A': 5, 'E': 6},
}
DUR = {'w': 4.0, 'h': 2.0, 'q': 1.0, 'e': 0.5, 's': 0.25, 't': 0.125}


def parse_dur(tok):
    """'q.' -> 1.5, 'e3' -> triplet eighth, '6' -> 6 beats, 'q+e' -> 1.5"""
    total = 0.0
    for part in tok.split('+'):
        trip = part.endswith('3')
        if trip:
            part = part[:-1]
        dots = len(part) - len(part.rstrip('.'))
        base = part.rstrip('.')
        if re.fullmatch(r'[0-9.]+', base):
            v = float(base)
        else:
            v = DUR[base]
        v = v * (1.5 if dots == 1 else 1.75 if dots == 2 else 1.0)
        if trip:
            v = v * 2 / 3
        total += v
    return total


def parse(path, inst):
    """Returns (bars, notes). bars: list of (bar_no, start_beat, length_beats, bpm).
    notes: list of dict(start, dur, string, fret, pitch, bar)."""
    tun = TUNINGS[inst]
    sno = STRING_NO[inst]
    lines = {}
    meta_bpm = {}
    for raw in open(path):
        line = raw.split('#', 1)[0].strip()
        if not line:
            continue
        m = re.match(r'^(\d+)(?:-(\d+))?\s*:\s*(.*)$', line)
        if not m:
            mm = re.match(r'^bpm\s+(\d+)\s*=\s*([\d.]+)$', line)
            if mm:
                meta_bpm[int(mm.group(1))] = float(mm.group(2))
                continue
            raise ValueError(f'bad line: {raw!r}')
        a = int(m.group(1))
        b = int(m.group(2) or a)
        body = m.group(3).strip()
        for n in range(a, b + 1):
            lines[n] = body

    def resolve(n, seen=()):
        body = lines[n]
        if body.startswith('='):
            ref = int(body[1:])
            if ref in seen or ref not in lines:
                raise ValueError(f'bar {n}: =N points to a missing bar or loops')
            return resolve(ref, seen + (n,))
        return body

    bars = []
    notes = []
    beat = 0.0
    bpm = meta_bpm.get(1, None)
    last_by_string = {}
    last_notes = []
    for n in sorted(lines):
        if n in meta_bpm:
            bpm = meta_bpm[n]
        body = resolve(n)
        toks = body.split()
        if len(toks) == 1 and toks[0].startswith('R'):
            length = float(toks[0][1:])
            bars.append((n, beat, length, bpm))
            beat += length
            last_notes = []
            continue
        pos = beat
        for tok in toks:
            what, d = tok.rsplit(':', 1)
            dur = parse_dur(d)
            if what == 'r':
                last_notes = []
            elif what == '~':
                for nt in last_notes:
                    nt['dur'] += dur
            else:
                group = []
                for item in what.split('+'):
                    tie = item.startswith('~')
                    item = item.lstrip('~')
                    mm = re.fullmatch(r'([eBGDAE])(\d+)', item)
                    if not mm:
                        raise ValueError(f'bar {n}: bad token {tok!r}')
                    s, f = mm.group(1), int(mm.group(2))
                    if inst == 'bass' and s == 'e':
                        raise ValueError(f'bar {n}: bass has no e string')
                    if tie and s in last_by_string:
                        last_by_string[s]['dur'] += dur
                        group.append(last_by_string[s])
                        continue
                    nt = dict(start=pos, dur=dur, string=sno[s], fret=f, pitch=tun[s] + f, bar=n)
                    notes.append(nt)
                    last_by_string[s] = nt
                    group.append(nt)
                last_notes = group
            pos += dur
        length = pos - beat
        bars.append((n, beat, length, bpm))
        beat = pos
    return bars, notes


def wrong_length_bars(bars, beats_per_bar):
    return [(b[0], b[2]) for b in bars if abs(b[2] - beats_per_bar) > 1e-6]


if __name__ == '__main__':
    bars, notes = parse(sys.argv[1], sys.argv[2])
    lens = Counter(round(b[2], 3) for b in bars)
    print('bars', len(bars), 'notes', len(notes), 'bar lengths', dict(lens))
    if len(sys.argv) > 3:
        bad = wrong_length_bars(bars, float(sys.argv[3]))
        for bn, length in bad:
            print(f'  bar {bn} is {length} beats')
        sys.exit(1 if bad else 0)
