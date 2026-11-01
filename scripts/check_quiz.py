# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""Validate quiz data in chapter front matter."""

import re
import sys
from pathlib import Path

import yaml

FRONT_MATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)
REQUIRED_KEYS = ("q", "choices", "answer", "explain")


def check_file(file: Path) -> int:
    match = FRONT_MATTER_RE.match(file.read_text())
    if not match:
        print(f"FAIL {file.name}: front matter not found")
        return 1
    meta = yaml.safe_load(match.group(1)) or {}
    quiz = meta.get("quiz") or []
    if not quiz:
        print(f"FAIL {file.name}: no quiz")
        return 1

    failures = 0
    for i, q in enumerate(quiz, start=1):
        problems = [f"missing '{k}'" for k in REQUIRED_KEYS if k not in q]
        choices = q.get("choices") or []
        answer = q.get("answer")
        if len(choices) < 2:
            problems.append("needs at least 2 choices")
        if len(set(map(str, choices))) != len(choices):
            problems.append("duplicate choices")
        if not isinstance(answer, int) or not 0 <= answer < len(choices):
            problems.append("answer out of range")
        if problems:
            failures += 1
            print(f"FAIL {file.name} Q{i}: {', '.join(problems)}")

    if failures == 0:
        print(f"PASS {file.name} ({len(quiz)} questions)")
    return failures


def main() -> int:
    files = sorted(Path(p) for p in sys.argv[1:])
    if not files:
        print("usage: uv run scripts/check_quiz.py content/docs/[0-9]*.md", file=sys.stderr)
        return 2

    failures = sum(check_file(f) for f in files)
    print("ALL OK" if failures == 0 else f"{failures} failure(s)")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
