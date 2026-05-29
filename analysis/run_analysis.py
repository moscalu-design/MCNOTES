import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = Path(__file__).with_name("note_type_registry.json")


def load_registry():
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def run_note_type(note_type, extra_args=None):
    registry = load_registry()
    key = note_type.upper()
    extra_args = extra_args or []

    if key not in registry:
        available = ", ".join(sorted(registry))
        raise SystemExit(f"Unknown note type: {note_type}. Available: {available}")

    config = registry[key]

    if not config.get("enabled", False):
        raise SystemExit(f"{key} is registered but not enabled yet: {config.get('notes', '')}")

    script = ROOT / config["analysis_script"]

    if not script.exists():
        raise SystemExit(f"Analysis script not found for {key}: {script}")

    subprocess.run([sys.executable, str(script), *extra_args], cwd=ROOT, check=True)


def main():
    note_type = sys.argv[1] if len(sys.argv) > 1 else "GNG"
    run_note_type(note_type, sys.argv[2:])


if __name__ == "__main__":
    main()
