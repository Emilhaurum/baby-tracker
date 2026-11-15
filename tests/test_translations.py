"""Tests for the Danish translation of the integration."""

from __future__ import annotations

import json
from pathlib import Path
import re

from custom_components.baby_logger.logbook import describe
from custom_components.baby_logger.milestones import (
    MILESTONES,
    MILESTONES_DA,
    localized_milestone_name,
    milestone_translations,
)

TRANSLATIONS = Path(__file__).parent.parent / "custom_components" / "baby_logger" / "translations"


def _flatten(node: object, prefix: str = "") -> dict[str, str]:
    if isinstance(node, dict):
        out: dict[str, str] = {}
        for key, value in node.items():
            out.update(_flatten(value, f"{prefix}.{key}" if prefix else key))
        return out
    return {prefix: str(node)}


def test_danish_has_every_english_string() -> None:
    en = _flatten(json.loads((TRANSLATIONS / "en.json").read_text(encoding="utf-8")))
    da = _flatten(json.loads((TRANSLATIONS / "da.json").read_text(encoding="utf-8")))
    assert da.keys() == en.keys()
    for key, text in en.items():
        # Same {placeholders}, and actually translated (apart from words that are the same).
        assert set(re.findall(r"\{\w+\}", da[key])) == set(re.findall(r"\{\w+\}", text)), key
        assert da[key].strip(), key


def test_every_milestone_has_a_danish_name_and_tags() -> None:
    assert MILESTONES_DA.keys() == {m.key for m in MILESTONES}
    for m in MILESTONES:
        name, tags = MILESTONES_DA[m.key]
        assert name, m.key
        assert name != m.name, m.key
        assert tags, m.key
        assert len(tags) == len(set(tags)), m.key
        assert all(tag == tag.strip().lower() for tag in tags), m.key
        assert milestone_translations(m.key) == {"da": {"name": name, "tags": list(tags)}}


def test_localized_milestone_name() -> None:
    assert localized_milestone_name("crawls", "Crawls", "da") == "Kravler"
    assert localized_milestone_name("crawls", "Crawls", "da-DK") == "Kravler"
    assert localized_milestone_name("crawls", "Crawls", "en") == "Crawls"
    assert localized_milestone_name("custom_abc", "First swim", "da") == "First swim"
    assert localized_milestone_name("crawls", "Crawls", None) == "Crawls"


def test_logbook_in_danish() -> None:
    at = "2026-05-05T13:10:00+00:00"
    assert describe({"action": "diaper", "type": "wet", "time": at}, "da").startswith(
        "registrerede en 💧 våd ble ("
    )
    assert describe({"action": "feeding", "side": "left", "time": at}, "da").startswith(
        "startede et måltid: venstre ("
    )
    assert describe(
        {"action": "feeding", "side": "right", "same_feeding": True, "amount_ml": 60, "time": at}, "da"
    ).startswith("skiftede til højre i samme måltid, 60 ml (")
    assert describe({"action": "wake", "minutes": 95, "time": at}, "da").startswith(
        "☀️ vågnede efter 1t 35m ("
    )
    assert describe({"action": "delete", "kind": "sleep"}, "da") == "slettede en registrering (søvn)"
    assert describe({"action": "growth", "weight_kg": 6.2, "length_cm": 61}, "da") == "📏 målte 6,2 kg, 61 cm"
    assert describe({"action": "undo", "undone": "diaper"}, "da") == "↩️ fortrød seneste handling (ble)"
    assert describe({"action": "delete"}, "da") == "slettede en registrering"
    # Built-in milestones get their Danish name; your own keep theirs.
    assert describe({"action": "milestone", "milestone": "crawls", "milestone_name": "Crawls"}, "da") == (
        "🏁 milepæl: Kravler"
    )
    assert describe(
        {"action": "add_milestone", "milestone": "custom_1", "milestone_name": "Svømning"}, "da"
    ) == ("tilføjede milepæl: Svømning")
    # English stays as it was, and unknown languages fall back to English.
    assert describe({"action": "growth", "weight_kg": 6.2}) == "📏 measured 6.2 kg"
    assert describe({"action": "undo", "undone": "diaper"}) == "↩️ undid the last action (diaper)"
    assert describe({"action": "delete", "kind": "sleep"}) == "deleted a sleep entry"
    assert describe({"action": "diaper", "type": "wet", "time": at}).startswith("logged a 💧 wet diaper (")
    assert describe({"action": "milestone", "milestone": "crawls", "milestone_name": "Crawls"}, "fr") == (
        "🏁 milestone: Crawls"
    )
