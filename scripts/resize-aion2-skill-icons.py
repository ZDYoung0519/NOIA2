#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit("Missing dependency: Pillow. Install with: python -m pip install pillow") from exc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SKILL_DIR = ROOT / "public" / "aion2" / "skill"
FOUR_DIGIT_PNG = re.compile(r"^\d{4}\.png$", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Resize 4-digit Aion2 skill PNG icons to 100x100."
    )
    parser.add_argument(
        "--skill-dir",
        type=Path,
        default=DEFAULT_SKILL_DIR,
        help=f"Skill icon directory. Default: {DEFAULT_SKILL_DIR}",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=100,
        help="Output width and height in pixels. Default: 100",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print matched files without writing changes.",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        help="Optional directory to copy original files before overwriting.",
    )
    return parser.parse_args()


def resize_png(path: Path, size: int, backup_dir: Path | None, dry_run: bool) -> bool:
    with Image.open(path) as image:
        original_size = image.size
        if original_size == (size, size):
            print(f"skip {path.name}: already {size}x{size}")
            return False

        print(f"resize {path.name}: {original_size[0]}x{original_size[1]} -> {size}x{size}")
        if dry_run:
            return True

        if backup_dir:
            backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup_dir / path.name)

        resized = image.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        resized.save(path, format="PNG", optimize=True)
        return True


def main() -> None:
    args = parse_args()
    skill_dir = args.skill_dir.resolve()

    if not skill_dir.is_dir():
        raise SystemExit(f"Skill directory not found: {skill_dir}")

    files = sorted(path for path in skill_dir.iterdir() if FOUR_DIGIT_PNG.match(path.name))
    print(f"matched {len(files)} four-digit PNG files in {skill_dir}")

    changed = 0
    for path in files:
        if resize_png(path, args.size, args.backup_dir, args.dry_run):
            changed += 1

    action = "would resize" if args.dry_run else "resized"
    print(f"done: {action} {changed}/{len(files)} files")


if __name__ == "__main__":
    main()
