# benchmark/

The accuracy benchmark (RC-10, RISK-01): the hand-checked reference tabs and the scoring harness. It runs offline on a
developer machine and is never deployed.

Belongs here: reference files in the RC-20 note format (`references/`), the manifest, the scoring code (`score.py`) and
its tests, and the dated reports (`reports/`).

Does not belong here: the benchmark audio. It may be copyrighted, so it lives in private storage outside the repo
(OD-04, POLICY.md). Only reference tabs are committed. `.gitignore` blocks `benchmark/audio/`.

Empty until P1-02 and P1-03 add the references and the harness.
