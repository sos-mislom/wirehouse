"""Export and summarize configuration metadata; never export business records.

Python 3, Windows and the installed full 1C client are required for --database.
--configuration can inspect an existing XML export on any platform.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


def local_name(element):
    return element.tag.rsplit("}", 1)[-1]


def summarize(configuration, details=None):
    root = ET.parse(configuration).getroot()
    config = next(e for e in root if local_name(e) == "Configuration")
    properties = next(e for e in config if local_name(e) == "Properties")
    children = next(e for e in config if local_name(e) == "ChildObjects")
    objects = [{"type": local_name(e), "name": e.text} for e in children if e.text]
    result = {
        "inspectedAt": datetime.now(timezone.utc).isoformat(),
        "configuration": {local_name(e): e.text for e in properties if local_name(e) in
                          {"Name", "Version", "Vendor", "CompatibilityMode"}},
        "configurationSha256": hashlib.sha256(configuration.read_bytes()).hexdigest(),
        "counts": dict(Counter(e["type"] for e in objects)),
        "objects": objects,
        "details": [],
        "evidenceBoundary": "Configuration metadata only. No accounting data, HTTP publication or exchange was verified.",
    }
    if details:
        for path in sorted(details.glob("*/*.xml")):
            if path.parent.name not in {"Catalogs", "Documents", "InformationRegisters", "AccountingRegisters"}:
                continue
            fields = []
            for element in ET.parse(path).getroot().iter():
                if local_name(element) not in {"Attribute", "Dimension", "Resource", "TabularSection"}:
                    continue
                props = next((e for e in element if local_name(e) == "Properties"), None)
                if props is not None:
                    fields.append({
                        "kind": local_name(element),
                        "name": next((e.text for e in props if local_name(e) == "Name"), ""),
                        "types": [e.text for e in props.iter() if local_name(e) == "Type" and e.text and e.text.strip()],
                    })
            result["details"].append({"object": path.relative_to(details).as_posix(), "fields": fields})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--configuration", type=Path, help="Existing Configuration.xml")
    mode.add_argument("--database", type=Path, help="File database directory; no credentials on command line")
    parser.add_argument("--platform", type=Path, help="Installed 1cv8.exe for metadata export")
    parser.add_argument("--details", type=Path, help="Existing selective XML export root")
    parser.add_argument("--output", required=True, type=Path, help="Private output directory, normally .local/one-c")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    configuration = args.configuration
    if args.database:
        if not args.platform or not args.platform.is_file():
            parser.error("--database requires --platform pointing to the installed 1cv8.exe")
        if not (args.database / "1Cv8.1CD").is_file():
            parser.error("File database not found")
        objects = args.output.resolve() / "objects.txt"
        objects.write_text("Configuration\n", encoding="utf-8-sig")
        destination = args.output.resolve() / "config"
        destination.mkdir(exist_ok=True)
        log = args.output.resolve() / "export.log"
        try:
            run = subprocess.run([
                str(args.platform), "DESIGNER", "/F", str(args.database.resolve()),
                "/DisableStartupDialogs", "/DisableStartupMessages",
                "/DumpConfigToFiles", str(destination), "-listFile", str(objects), "/Out", str(log),
            ], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), timeout=180, check=False)
        except subprocess.TimeoutExpired:
            parser.exit(1, "Metadata export timed out; inspect the local export log. No load/update command was issued.\n")
        configuration = destination / "Configuration.xml"
        if run.returncode or not configuration.exists():
            parser.exit(1, "Metadata export failed; inspect the local export log (authentication/licensing may be required).\n")
    result = summarize(configuration, args.details)
    target = args.output / "inventory.json"
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"configuration": result["configuration"], "counts": result["counts"], "report": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
