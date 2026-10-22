"""Apply explicit 1C account/meter mappings; credentials come only from a private env file."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "integrations/one-c"))
from wirehouse_bridge import BridgeError, Config, Native, Transport, load_env, parse_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    args = parser.parse_args()
    try:
        load_env(args.env_file)
        config = Config.from_env()
        remote = Transport(config).call("/capabilities")
        if remote.get("environment") != config.environment or remote.get("sourceId") != config.source_id or remote.get("schemaVersion") != 1:
            raise BridgeError("CAPABILITIES_MISMATCH")
        data = parse_json(args.mapping.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict) or set(data) != {"accounts", "meters"}:
            raise BridgeError("INVALID_MAPPING_FILE")
        if any(not isinstance(data[key], list) or len(data[key]) > 500 for key in ("accounts", "meters")):
            raise BridgeError("INVALID_MAPPING_FILE")
        if not data["accounts"]:
            raise BridgeError("INVALID_MAPPING_FILE")
        native = Native(config)
        if parse_json(native.call("AdapterInfo")).get("schemaVersion") != 1:
            raise BridgeError("ADAPTER_VERSION_MISMATCH")
        native.call("ConfigureSource", config.source_id, config.environment)
        for account in data["accounts"]:
            native.call("PutAccount", config.source_id, config.environment, json.dumps(account, ensure_ascii=False, allow_nan=False))
        for meter in data["meters"]:
            native.call("PutMeter", config.source_id, config.environment, json.dumps(meter, ensure_ascii=False, allow_nan=False))
        native.call("QueueAccounts", config.source_id, config.environment)
        print(json.dumps({"status": "configured", "accounts": len(data["accounts"]), "meters": len(data["meters"]), "delivery": "queued"}))
        return 0
    except BridgeError as error:
        print(json.dumps({"status": "failed", "code": str(error)}))
        return 1
    except Exception:
        print(json.dumps({"status": "failed", "code": "MAPPING_CONFIGURATION_FAILED"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
