# pipeline/

The Python analysis code: the processing function that turns an uploaded song into tab data (SDD 5.1, DD-02, DD-16).
Demucs separates the guitar and bass parts, Basic Pitch finds the notes, the tab-assignment module picks strings and
frets (DD-15), madmom finds beats, chords and key, and librosa finds tempo and tuning.

Belongs here: the `amphion_pipeline` package, its tests, the RC-20 JSON Schema, pinned requirements, and later the
Cloud Run function that wraps the package.

Does not belong here: audio files, separated parts, or secrets (RC-03, RC-06, ARCHITECTURE.md rule A3). Audio is
never committed or stored.

Empty until P1-01 and P1-04 add the code.
