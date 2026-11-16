import copy
import json

import pytest

from amphion_pipeline import rc20

NOTE = {"id": "guitar-0", "startTime": 1.0, "duration": 0.5, "string": None, "fret": None, "pitch": 52, "confidence": 0.8, "edited": False}
CHORD = {"id": "chord-0", "startTime": 0.0, "endTime": 2.0, "name": "Em", "confidence": None, "edited": False}


def good():
    return {
        "schemaVersion": 1,
        "audioSha256": "a" * 64,
        "duration": 12.5,
        "key": "E minor",
        "bpm": 96.0,
        "tuningOffsetCents": -12.0,
        "beatsPerBar": 4,
        "beats": [0.5, 1.0],
        "downbeats": [0.5],
        "chords": [dict(CHORD)],
        "guitar": {"notes": [dict(NOTE)]},
        "bass": None,
    }


def test_a_valid_document_passes():
    rc20.validate(good())


def test_unknown_values_may_be_null():
    doc = good()
    doc.update(key=None, bpm=None, tuningOffsetCents=None, beatsPerBar=None, guitar=None, beats=[], downbeats=[], chords=[])
    rc20.validate(doc)


def test_string_and_fret_may_both_be_set():
    doc = good()
    doc["guitar"]["notes"][0].update(string=6, fret=12)
    rc20.validate(doc)


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d.pop("audioSha256"),
        lambda d: d.update(schemaVersion=2),
        lambda d: d.update(audioSha256="ABC"),
        lambda d: d.update(extra=1),
        lambda d: d.update(key="Emin"),
        lambda d: d.update(tuningOffsetCents=75),
        lambda d: d.update(bass={"notes": [dict(NOTE, string=5, fret=3)]}),  # a bass has four strings
        lambda d: d["guitar"]["notes"][0].update(string=7, fret=0),
        lambda d: d["guitar"]["notes"][0].update(string=3),  # string without fret
        lambda d: d["guitar"]["notes"][0].update(fret=3),  # fret without string
        lambda d: d["guitar"]["notes"][0].update(string=1, fret=-1),
        lambda d: d["guitar"]["notes"][0].update(confidence=1.5),
        lambda d: d["guitar"]["notes"][0].update(startTime=-1),
        lambda d: d["guitar"]["notes"][0].pop("pitch"),
        lambda d: d["chords"][0].update(name="E:maj"),
    ],
)
def test_a_broken_document_fails(change):
    doc = copy.deepcopy(good())
    change(doc)
    with pytest.raises(ValueError, match="rc20.schema.json"):
        rc20.validate(doc)


def test_the_schema_file_is_valid_json_with_version_one():
    schema = json.loads(rc20.SCHEMA_PATH.read_text())
    assert schema["properties"]["schemaVersion"] == {"description": schema["properties"]["schemaVersion"]["description"], "const": 1}
