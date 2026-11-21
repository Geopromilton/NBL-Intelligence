"""Provenance and labelling of every number the platform shows.

Two rules from the NBL water-planning standard are enforced here:
1. Every value carries where it came from (measured, imported, calculated,
   forecast, assumption, placeholder, AI interpretation).
2. Anything that changes with season, rain year or treatment carries a label:
   the period (per day / per year / over the run), the case (average / dry /
   wet / peak / design) and, where relevant, before or after treatment.
Supplies are never graded as "low-grade": all water delivered on an NBL site
is treated to one high-quality standard.
"""
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class Provenance(str, Enum):
    MEASURED = "measured"
    IMPORTED = "imported"
    CALCULATED = "calculated"
    FORECAST = "forecast"
    ASSUMPTION = "assumption"
    PLACEHOLDER = "placeholder"
    AI = "ai_interpretation"


PROVENANCE_TEXT = {
    "measured": "Measured on site",
    "imported": "Taken from a source document or agency record",
    "calculated": "Calculated by an engine from other values",
    "forecast": "Forecast for a future period",
    "assumption": "Planning assumption, adjustable",
    "placeholder": "Placeholder until a field test replaces it",
    "ai_interpretation": "AI interpretation, not a calculation",
}


class Value(BaseModel):
    name: str
    value: Any
    unit: str | None = None
    provenance: Provenance
    source: str
    period: str | None = None      # per day / per year / over 10 years / single event
    case: str | None = None        # average / dry / wet / peak / design / central
    treatment: str | None = None   # before treatment / after treatment
    note: str | None = None


def label(period: str | None = None, case: str | None = None, treatment: str | None = None) -> str:
    return " · ".join(x for x in (period, case, treatment) if x)


BANNED_WORDS = ("low-grade", "low grade", "lower-grade", "lower grade", "poor-quality supply")


def clean_wording(text: str) -> str:
    """Replace forbidden supply grading words (used on AI answers before display)."""
    out = text
    for w in BANNED_WORDS:
        out = out.replace(w, "treated").replace(w.title(), "Treated").replace(w.capitalize(), "Treated")
    return out
