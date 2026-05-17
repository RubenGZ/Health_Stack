# tests/unit/test_ranked_service.py
"""Unit tests for pure helper functions in ranked service (no DB needed)."""
from app.modules.ranked.models import TIERS_COMPETITIVE, TIERS_NORMAL
from app.modules.ranked.service import is_top_tier, tier_at_index, tier_index


def test_tier_index_normal():
    assert tier_index("normal", "novato") == 0
    assert tier_index("normal", "leyenda") == 7


def test_tier_index_competitive():
    assert tier_index("competitive", "calentando") == 0
    assert tier_index("competitive", "apex") == 7


def test_top_tier_detection():
    assert is_top_tier("normal", "leyenda")
    assert is_top_tier("competitive", "apex")
    assert not is_top_tier("normal", "elite")
    assert not is_top_tier("competitive", "invicto")


def test_tier_at_index_bounds():
    assert tier_at_index("normal", -1) == TIERS_NORMAL[0]
    assert tier_at_index("normal", 99) == TIERS_NORMAL[-1]
    assert tier_at_index("competitive", 3) == TIERS_COMPETITIVE[3]


def test_tier_at_index_mid():
    assert tier_at_index("normal", 3) == "comprometido"
    assert tier_at_index("competitive", 3) == "bestia"
