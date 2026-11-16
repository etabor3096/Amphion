"""The RC-20 output format: the JSON Schema (pipeline/rc20.schema.json) and a validator."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_VERSION = 1  # the RC-20 format version this code writes; rc20.schema.json pins it with `const`
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "rc20.schema.json"


@lru_cache(maxsize=1)
def _validator() -> Draft202012Validator:
    schema = json.loads(SCHEMA_PATH.read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate(document: dict) -> None:
    """Raise ValueError listing every way `document` breaks the schema."""
    errors = sorted(_validator().iter_errors(document), key=lambda error: list(error.absolute_path))
    if errors:
        lines = [f"{'/'.join(str(p) for p in error.absolute_path) or '(top level)'}: {error.message}" for error in errors[:10]]
        raise ValueError("the result does not match rc20.schema.json:\n  " + "\n  ".join(lines))
