"""Objective router contract metrics."""


def exact_accuracy(actual: str | None, expected: str | None) -> float | None:
    return None if expected is None else float(actual == expected)


def set_accuracy(actual: list[str], expected: list[str]) -> float:
    return float(set(actual) == set(expected))


def modality_accuracy(actual_types: list[str], expected_types: list[str]) -> float | None:
    expected = set(expected_types) - {"NONE"}
    if not expected:
        return None
    return float(expected.issubset(set(actual_types)))
