# tests/unit/test_workout_service.py
from app.modules.workout_sessions.service import epley_1rm, detect_prs, compute_volume


def test_epley_1rm_one_rep():
    assert epley_1rm(100, 1) == 100.0


def test_epley_1rm_five_reps():
    result = epley_1rm(100, 5)
    assert abs(result - 116.67) < 0.1


def test_detect_prs_new_pr():
    exercises = [{"exercise_key": "press_banca_plano", "sets": [
        {"weight_kg": 100, "reps": 5, "is_warmup": False}
    ]}]
    prs = detect_prs(exercises, {"press_banca_plano": 110.0})
    # 100 * (1 + 5/30) = 116.67 > 110 → sí es PR
    assert len(prs) == 1
    assert prs[0].exercise_key == "press_banca_plano"


def test_detect_prs_no_pr():
    exercises = [{"exercise_key": "sentadilla", "sets": [
        {"weight_kg": 80, "reps": 3, "is_warmup": False}
    ]}]
    prs = detect_prs(exercises, {"sentadilla": 200.0})
    assert len(prs) == 0


def test_compute_volume_excludes_warmup():
    exercises = [{"exercise_key": "x", "sets": [
        {"weight_kg": 60, "reps": 10, "is_warmup": True},
        {"weight_kg": 80, "reps": 8,  "is_warmup": False},
        {"weight_kg": 80, "reps": 6,  "is_warmup": False},
    ]}]
    assert compute_volume(exercises) == 1120.0
