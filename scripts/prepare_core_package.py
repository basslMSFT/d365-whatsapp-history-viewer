"""Remove everything from an unpacked solution that is not the control itself.

The release package carries only the control and the three anchor columns. A
solution exported from a development environment also contains the forms of
Contact, Case, and Conversation as they look in that environment, including
fields and scripts from every app installed there (Marketing, Field Service,
Event Management, ...). Importing those forms fails in an environment that
doesn't have the same apps. The export also copies the default grid
configuration of each table (`CustomControlDefaultConfigs`), which can refer to
tables of that environment and would overwrite the target's own settings.

Run this on an unpacked solution folder before `pac solution pack`. It is safe
to run repeatedly.

    python scripts/prepare_core_package.py [folder]
"""
import re
import shutil
import sys
from pathlib import Path


DEFAULT_SOURCE = (
    Path(__file__).resolve().parent.parent
    / "solutions"
    / "WhatsAppConversationViewer"
    / "src"
)
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_SOURCE

FORM_COMPONENT_TYPE = "60"
# A MissingDependency block never nests, so this stays inside one element.
FORM_DEPENDENCY = re.compile(
    r"[ \t]*<MissingDependency>(?:(?!</MissingDependency>).)*?"
    rf'<Dependent type="{FORM_COMPONENT_TYPE}"(?:(?!</MissingDependency>).)*?'
    r"</MissingDependency>\r?\n?",
    re.DOTALL,
)
CONTROL_DEFAULTS = re.compile(
    r"[ \t]*<CustomControlDefaultConfigs>.*?</CustomControlDefaultConfigs>\r?\n?",
    re.DOTALL,
)


def remove_control_defaults() -> int:
    removed = 0
    for path in sorted((SOURCE / "Entities").glob("*/Entity.xml")):
        with path.open("r", encoding="utf-8", newline="") as handle:
            original = handle.read()
        text, count = CONTROL_DEFAULTS.subn("", original)
        if count:
            with path.open("w", encoding="utf-8", newline="") as handle:
                handle.write(text)
            print(f"Removed default grid configuration from {path.relative_to(SOURCE)}")
            removed += count
    return removed


def remove_form_files() -> int:
    removed = 0
    for folder in sorted((SOURCE / "Entities").glob("*/FormXml")):
        removed += sum(1 for item in folder.rglob("*") if item.is_file())
        # OneDrive can keep an empty folder locked; Git ignores empty folders.
        shutil.rmtree(folder, ignore_errors=True)
        print(f"Removed {folder.relative_to(SOURCE)}")
    return removed


def remove_form_dependencies() -> int:
    path = SOURCE / "Other" / "Solution.xml"
    with path.open("r", encoding="utf-8", newline="") as handle:
        original = handle.read()
    text, count = FORM_DEPENDENCY.subn("", original)
    if count:
        with path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)
        print(f"Removed {count} form dependencies from {path.relative_to(SOURCE)}")
    return count


def find_leftovers() -> list[str]:
    leftovers = [
        str(folder.relative_to(SOURCE))
        for folder in (SOURCE / "Entities").glob("*/FormXml")
        if any(folder.rglob("*.xml"))
    ]
    solution = (SOURCE / "Other" / "Solution.xml").read_text(encoding="utf-8-sig")
    if f'<Dependent type="{FORM_COMPONENT_TYPE}"' in solution:
        leftovers.append("Other/Solution.xml still lists form dependencies")
    return leftovers


def main() -> int:
    if not SOURCE.is_dir():
        print(f"Folder not found: {SOURCE}")
        return 2
    changes = remove_form_files() + remove_form_dependencies() + remove_control_defaults()
    leftovers = find_leftovers()
    if leftovers:
        print("Forms are still present:")
        for item in leftovers:
            print(f"  {item}")
        return 1
    print("Cleaned the solution source." if changes else "Solution source is already clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
