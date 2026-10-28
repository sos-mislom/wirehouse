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
        if not isinstance(data, dict) or not {"accounts", "meters"}.issubset(data) or set(data)-{"accounts","meters","catalogs","finance","meterBindings"}:
            raise BridgeError("INVALID_MAPPING_FILE")
        if any(not isinstance(data[key], list) or len(data[key]) > 500 for key in ("accounts", "meters")):
            raise BridgeError("INVALID_MAPPING_FILE")
        if not data["accounts"]:
            raise BridgeError("INVALID_MAPPING_FILE")
        catalogs=data.get("catalogs",{})
        if not isinstance(catalogs,dict) or set(catalogs)-{"properties","units","tenants","leases","meters"} or any(not isinstance(v,list) or len(v)>10000 for v in catalogs.values()):
            raise BridgeError("INVALID_MAPPING_FILE")
        for key in ["finance","meterBindings"]:
            if not isinstance(data.get(key,[]),list) or len(data.get(key,[]))>10000:raise BridgeError("INVALID_MAPPING_FILE")
        native = Native(config)
        info=parse_json(native.call("AdapterInfo"))
        if info.get("schemaVersion") != 1 or (catalogs or data.get("finance") or data.get("meterBindings")) and not info.get("autoExport"):
            raise BridgeError("ADAPTER_VERSION_MISMATCH")
        native.call("ConfigureSource", config.source_id, config.environment)
        for kind in ["properties","units","tenants","leases","meters"]:
            if catalogs.get(kind) and kind not in remote.get("incomingKinds",[]):raise BridgeError("CAPABILITIES_MISMATCH")
            for row in catalogs.get(kind,[]):native.call("PutCatalog",config.source_id,config.environment,kind,json.dumps(row,ensure_ascii=False,allow_nan=False))
        for account in data["accounts"]:
            native.call("PutAccount", config.source_id, config.environment, json.dumps(account, ensure_ascii=False, allow_nan=False))
        for meter in data["meters"]:
            native.call("PutMeter", config.source_id, config.environment, json.dumps(meter, ensure_ascii=False, allow_nan=False))
        for row in data.get("finance",[]):native.call("PutFinance",config.source_id,config.environment,row["accountExternalId"],json.dumps(row["settings"],ensure_ascii=False,allow_nan=False))
        for row in data.get("meterBindings",[]):native.call("SetMeterAccount",config.source_id,config.environment,row["externalId"],row["accountExternalId"],row["validFrom"])
        native.call("QueueAll" if info.get("autoExport") else "QueueAccounts", config.source_id, config.environment)
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
