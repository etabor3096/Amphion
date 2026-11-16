"""Amphion analysis pipeline: an audio file in, RC-20 tab data out (P1-04).

Every time in the output is song time: seconds from the start of the input file (RC-18). The separated guitar and bass
parts only ever exist in a temporary folder that is deleted on exit (RC-03, ARCHITECTURE.md rule A3).
"""

from .rc20 import SCHEMA_VERSION
from .run import analyze

__all__ = ["SCHEMA_VERSION", "analyze"]
