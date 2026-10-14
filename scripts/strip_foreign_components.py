"""Remove components that belong to other solutions from the unpacked source.

The standard forms are exported from a customized development environment, so
the exported FormXml also contains fields and web resources that other teams
added. Those components have nothing to do with the WhatsApp viewer. Shipping
them would create unrelated columns and web resources in every environment that
imports this solution.

Run this after `pac solution unpack` and before `pac solution pack`. It is safe
to run repeatedly.
"""
import json
import re
import sys
from pathlib import Path


DEFAULT_SOURCE = (
    Path(__file__).resolve().parent.parent
    / "solutions"
    / "WhatsAppConversationViewer"
    / "src"
)
# Optionally pass another unpacked folder, for example an unpacked managed export.
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_SOURCE

# The components to remove are specific to your development environment, so
# they live in a local, Git-ignored file. Copy foreign_components.example.json.
CONFIG = Path(__file__).with_name("foreign_components.local.json")
if not CONFIG.exists():
    raise SystemExit(
        f"Create {CONFIG.name} first; see foreign_components.example.json."
    )
_CONFIG = json.loads(CONFIG.read_text(encoding="utf-8"))

# logical name -> schema (physical) name of columns added by other solutions
FOREIGN_COLUMNS = _CONFIG.get("columns", {})
FOREIGN_WEB_RESOURCES = tuple(_CONFIG.get("web_resources", ()))
FOREIGN_OPTION_SETS = tuple(_CONFIG.get("option_sets", ()))

# Rows, sections and attributes never nest, so the tempered patterns below
# stay inside a single element.
ROW = (
    r'[ \t]*<row>(?:(?!</?row>).)*?datafieldname="{name}"'
    r"(?:(?!</?row>).)*?</row>\r?\n?"
)
SECTION = (
    r"[ \t]*<section (?:(?!<section |</section>).)*?<Url>{name}</Url>"
    r"(?:(?!<section |</section>).)*?</section>\r?\n?"
)
ATTRIBUTE = (
    r'[ \t]*<attribute PhysicalName="{name}">(?:(?!<attribute ).)*?'
    r"</attribute>\r?\n?"
)
ROOT_COMPONENT = (
    r'[ \t]*<RootComponent type="{type}" schemaName="{name}" '
    r'behavior="\d+" />\r?\n?'
)


def remove(text: str, pattern: str) -> tuple[str, int]:
    return re.subn(pattern, "", text, flags=re.DOTALL)


def read(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def write(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def strip_entities() -> int:
    removed = 0
    for path in sorted((SOURCE / "Entities").rglob("*.xml")):
        original = read(path)
        text = original
        for logical, physical in FOREIGN_COLUMNS.items():
            text, rows = remove(text, ROW.format(name=re.escape(logical)))
            text, attributes = remove(
                text, ATTRIBUTE.format(name=re.escape(physical))
            )
            removed += rows + attributes
        for name in FOREIGN_WEB_RESOURCES:
            text, sections = remove(text, SECTION.format(name=re.escape(name)))
            removed += sections
        if text != original:
            write(path, text)
            print(f"Cleaned {path.relative_to(SOURCE)}")
    return removed


def strip_solution_manifest() -> int:
    path = SOURCE / "Other" / "Solution.xml"
    original = read(path)
    text = original
    removed = 0
    for component_type, names in (
        (61, FOREIGN_WEB_RESOURCES),
        (9, FOREIGN_OPTION_SETS),
    ):
        for name in names:
            text, count = remove(
                text,
                ROOT_COMPONENT.format(type=component_type, name=re.escape(name)),
            )
            removed += count
    if text != original:
        write(path, text)
        print(f"Cleaned {path.relative_to(SOURCE)}")
    return removed


def delete_component_files() -> int:
    removed = 0
    for name in FOREIGN_OPTION_SETS:
        for path in (SOURCE / "OptionSets").glob(f"{name}*"):
            path.unlink()
            removed += 1
            print(f"Deleted {path.relative_to(SOURCE)}")
    for name in FOREIGN_WEB_RESOURCES:
        for path in (SOURCE / "WebResources").glob(f"{name}*"):
            path.unlink()
            removed += 1
            print(f"Deleted {path.relative_to(SOURCE)}")
    for folder in ("OptionSets", "WebResources"):
        path = SOURCE / folder
        if path.is_dir() and not any(path.iterdir()):
            try:
                path.rmdir()
            except OSError:
                # OneDrive can keep an empty folder locked; Git ignores it.
                pass
    return removed


def find_leftovers() -> list[str]:
    names = (
        *FOREIGN_COLUMNS,
        *FOREIGN_COLUMNS.values(),
        *FOREIGN_WEB_RESOURCES,
        *FOREIGN_OPTION_SETS,
    )
    if not names:
        return []
    pattern = re.compile("|".join(re.escape(name) for name in names), re.I)
    leftovers = []
    for path in sorted(SOURCE.rglob("*.xml")):
        if pattern.search(read(path)):
            leftovers.append(str(path.relative_to(SOURCE)))
    return leftovers


def main() -> int:
    changes = strip_entities() + strip_solution_manifest()
    changes += delete_component_files()
    leftovers = find_leftovers()
    if leftovers:
        print("Foreign components are still referenced in:")
        for item in leftovers:
            print(f"  {item}")
        return 1
    print(
        "Removed foreign components."
        if changes
        else "Solution source already contains no foreign components."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
