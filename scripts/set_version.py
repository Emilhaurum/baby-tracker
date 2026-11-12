"""Set the release version everywhere it appears.

Usage:
python scripts/set_version.py 1.2.3
python scripts/set_version.py --check 1.2.3   (exit 1 if any file differs)
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "custom_components/baby_logger/manifest.json"
CARD = ROOT / "custom_components/baby_logger/frontend/baby-logger-card.js"
PYPROJECT = ROOT / "pyproject.toml"
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?$")


def current() -> dict[str, str]:
    """Return the version found in each file."""
    card = re.search(r'const CARD_VERSION = "([^"]+)";', CARD.read_text()).group(1)
    pyproject = re.search(r'^version = "([^"]+)"', PYPROJECT.read_text(), re.M).group(1)
    return {
        "manifest.json": json.loads(MANIFEST.read_text())["version"],
        "baby-logger-card.js": card,
        "pyproject.toml": pyproject,
    }


def write(version: str) -> None:
    """Write the version to every file."""
    manifest = json.loads(MANIFEST.read_text())
    manifest["version"] = version
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    CARD.write_text(
        re.sub(r'const CARD_VERSION = "[^"]+";', f'const CARD_VERSION = "{version}";', CARD.read_text())
    )
    PYPROJECT.write_text(
        re.sub(r'^version = "[^"]+"', f'version = "{version}"', PYPROJECT.read_text(), count=1, flags=re.M)
    )


def main(argv: list[str]) -> int:
    """Run the script."""
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    if len(args) != 1:
        print(__doc__)
        return 2
    version = args[0].removeprefix("v")
    if not VERSION_RE.match(version):
        print(f"Invalid version: {version}")
        return 2
    if check:
        found = current()
        wrong = {k: v for k, v in found.items() if v != version}
        for name, value in wrong.items():
            print(f"::error::{name} has version {value}, expected {version}")
        if not wrong:
            print(f"All files are at version {version}")
        return 1 if wrong else 0
    write(version)
    print(f"Version set to {version}: {current()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
