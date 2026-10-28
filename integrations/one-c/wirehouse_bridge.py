"""Local Windows agent. Credentials are read from environment, never CLI arguments.

Python 3 + pywin32, installed 64-bit 1C COMConnector and WirehouseExchange CFE.
The agent runs one bounded pass; Windows Task Scheduler supplies the schedule.
"""
from dataclasses import dataclass
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import ssl
import sys
import uuid
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request


class BridgeError(Exception):
    """A deliberately non-sensitive public error code."""


def parse_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise BridgeError("DUPLICATE_JSON_KEY")
            result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(BridgeError("NONFINITE_JSON")))
    except (ValueError, TypeError, UnicodeError) as error:
        raise BridgeError("INVALID_JSON") from error


@dataclass(frozen=True)
class Config:
    base_url: str
    source_id: str
    environment: str
    token: str
    database: str
    user: str = ""
    password: str = ""
    server: str = ""
    infobase: str = ""

    @classmethod
    def from_env(cls):
        result = cls(*(os.environ.get(name, "") for name in [
            "ONE_C_CRM_URL", "ONE_C_SOURCE_ID", "ONE_C_ENVIRONMENT", "ONE_C_SOURCE_TOKEN",
            "ONE_C_DATABASE", "ONE_C_USER", "ONE_C_PASSWORD",
            "ONE_C_SERVER", "ONE_C_INFOBASE",
        ]))
        result.validate()
        return result

    def validate(self):
        if self.environment not in {"test", "production"}:
            raise BridgeError("INVALID_ENVIRONMENT")
        if not re.fullmatch(r"[A-Za-z0-9-]{1,100}", self.source_id):
            raise BridgeError("INVALID_SOURCE_ID")
        if len(self.token) < 32 or any(c.isspace() for c in self.token):
            raise BridgeError("INVALID_SOURCE_TOKEN")
        url = urllib.parse.urlsplit(self.base_url)
        if not url.hostname or url.username or url.password or url.query or url.fragment:
            raise BridgeError("INVALID_CRM_URL")
        try:
            loopback = ipaddress.ip_address(url.hostname).is_loopback
        except ValueError:
            loopback = url.hostname == "localhost"
        if url.scheme != "https" and not (url.scheme == "http" and self.environment == "test" and loopback):
            raise BridgeError("HTTPS_REQUIRED")
        if self.server or self.infobase:
            if self.database or not re.fullmatch(r"[A-Za-z0-9_.-]+(?::\d{1,5})?", self.server) or not self.infobase.strip() or len(self.infobase)>128 or any(ord(c)<32 for c in self.infobase):
                raise BridgeError("INVALID_SERVER_DATABASE")
        elif not self.database or not (Path(self.database) / "1Cv8.1CD").is_file():
            raise BridgeError("FILE_DATABASE_NOT_FOUND")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the per-source Bearer key to another origin or path.
        raise BridgeError("REDIRECT_REJECTED")


class Transport:
    def __init__(self, config):
        self.config = config
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.opener = urllib.request.build_opener(
            NoRedirect(), urllib.request.HTTPSHandler(context=context),
        )

    def call(self, suffix, data=None):
        request = urllib.request.Request(
            self.config.base_url.rstrip("/") + "/api/integrations/accounting/" + self.config.source_id + suffix,
            method="GET" if data is None else "POST",
            data=None if data is None else json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + self.config.token, "Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with self.opener.open(request, timeout=30) as response:
                body = response.read(4 * 1024 * 1024 + 1)
                if len(body) > 4 * 1024 * 1024:
                    raise BridgeError("RESPONSE_TOO_LARGE")
                return parse_json(body)
        except urllib.error.HTTPError as error:
            # Response bodies and URLs may contain private values. Keep only code.
            raise BridgeError("CRM_HTTP_" + str(error.code)) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise BridgeError("CRM_UNAVAILABLE") from error


SEMANTIC_ERRORS = {
    "SOURCE_NOT_CONFIGURED", "ENVIRONMENT_MISMATCH", "UNSUPPORTED_KIND", "UNSUPPORTED_SCHEMA",
    "INVALID_OBJECT", "INVALID_FIELDS", "INVALID_TEXT", "INVALID_NUMBER", "INVALID_DATE",
    "INVALID_DATE_RANGE", "MESSAGE_CONFLICT", "SUBMISSION_CONFLICT", "METER_NOT_FOUND",
    "ACCOUNT_NOT_FOUND", "METER_ACCOUNT_MISMATCH", "ACCOUNT_NOT_ACTIVE", "DECREASING_READING",
    "PERIOD_ALREADY_RECEIVED", "PREVIOUS_READING_CONFLICT",
    "BP_CONTRACT_NOT_FOUND", "BP_CONTRACT_DELETED", "BP_CONTRACT_CLOSED",
    "INVALID_MONEY", "INVALID_VERSION", "INVALID_RESULT_VERSION", "INVALID_ACT_LINES",
    "ACT_TOTAL_MISMATCH", "WORK_EVENT_CONFLICT",
}
CONFIG_ERRORS = {"INVALID_VERSION", "INVALID_ACCOUNT_STATUS", "INVALID_ACTIVE_FLAG", "STALE_VERSION", "VERSION_CONFLICT", "ACCOUNT_CONTRACT_IMMUTABLE", "METER_IDENTITY_IMMUTABLE", "ENVIRONMENT_IMMUTABLE", "ACCOUNT_BATCH_SIZE", "OUTGOING_NOT_FOUND", "ALREADY_CONFIRMED", "OUTGOING_NOT_RETRYABLE"}
CONFIG_ERRORS |= {"CATALOG_BATCH_SIZE", "BP_COUNTERPARTY_NOT_FOUND", "BP_ORGANIZATION_NOT_FOUND", "ACCOUNTING_ACCOUNT_NOT_FOUND", "ACCOUNT_ORGANIZATION_MISMATCH", "FINANCE_NOT_CONFIGURED", "UNMAPPED_ACCOUNTING_MOVEMENT", "ACCOUNTING_BALANCE_MISMATCH", "DEMO_CONFIRMATION_REQUIRED"}
CONFIG_ERRORS |= {"UNSUPPORTED_ACCOUNTING_ANALYTICS", "STATEMENT_LINE_LIMIT", "STATEMENT_PERIOD_IN_FUTURE", "STATEMENT_HISTORY_LIMIT", "ACT_DOCUMENT_CONFLICT", "ACT_DOCUMENT_NOT_FOUND", "NOMENCLATURE_NOT_CONFIGURED", "CURRENCY_NOT_CONFIGURED", "DEMO_ORGANIZATION_REQUIRED"}
CONFIG_ERRORS |= {"METER_BINDING_MONTH_REQUIRED","METER_BINDING_CONFLICT","METER_BINDING_HAS_READINGS","METER_BINDING_ORDER","DEMO_NOT_FOUND","DEMO_DOCUMENT_MISMATCH"}


class Native:
    def __init__(self, config):
        try:
            import win32com.client
            def quote(text):
                return '"' + text.replace('"', '""') + '"'
            connection = ("Srvr=" + quote(config.server) + ";Ref=" + quote(config.infobase) + ";"
                          if config.server else "File=" + quote(str(Path(config.database).resolve())) + ";")
            if config.user:
                connection += "Usr=" + quote(config.user) + ";Pwd=" + quote(config.password) + ";"
            self.connector = win32com.client.dynamic.Dispatch("V83.COMConnector")
            self.database = self.connector.Connect(connection)
            self.module = self.database.WH_Exchange
        except Exception as error:
            raise BridgeError("ONE_C_CONNECTION_FAILED") from error

    def call(self, name, *args):
        try:
            return getattr(self.module, name)(*args)
        except Exception as error:
            # Surface only known domain codes; an uncertain COM failure leaves
            # the CRM message unacknowledged for a safe, idempotent replay.
            message = str(error)
            for code in sorted(SEMANTIC_ERRORS | CONFIG_ERRORS):
                if re.search(r"\b" + code + r"\b", message):
                    raise BridgeError(code) from error
            raise BridgeError("ONE_C_OPERATION_UNCERTAIN") from error


class Worker:
    def __init__(self, config, native=None, transport=None):
        config.validate()
        self.config = config
        self.native = native if native is not None else Native(config)
        self.transport = transport if transport is not None else Transport(config)

    def verify(self):
        source, environment = self.config.source_id, self.config.environment
        remote = self.transport.call("/capabilities")
        if remote.get("sourceId") != source or remote.get("environment") != environment or remote.get("schemaVersion") != 1:
            raise BridgeError("CAPABILITIES_MISMATCH")
        self.reporting = remote.get("runReports") is True
        if "accounts" not in remote.get("incomingKinds", []) or "readings" not in remote.get("outgoingKinds", []):
            raise BridgeError("CAPABILITIES_MISMATCH")
        info = parse_json(self.native.call("AdapterInfo"))
        if info.get("schemaVersion") != 1:
            raise BridgeError("ADAPTER_VERSION_MISMATCH")
        self.auto_export = info.get("autoExport") is True
        if self.auto_export and any(kind not in remote.get("incomingKinds", []) for kind in info.get("outgoingKinds", [])):
            raise BridgeError("CAPABILITIES_MISMATCH")
        self.native.call("InspectState", source, environment)
        supported = info.get("incomingKinds", ["readings"])
        if not isinstance(supported, list) or "readings" not in supported:
            raise BridgeError("ADAPTER_VERSION_MISMATCH")
        self.incoming_kinds = [kind for kind in ["readings", "work_results", "work_reopened", "service_acts"]
                               if kind in supported and kind in remote.get("outgoingKinds", [])]
        return {"environment": environment, "schemaVersion": 1}

    def run_once(self):
        run_id = str(uuid.uuid4())
        try:
            result = self._run_once()
        except Exception as error:
            self.report(run_id, {"status":"failed","error":str(error) if isinstance(error,BridgeError) else "BRIDGE_FAILED","sent":0,"received":0,"rejected":0})
            raise
        self.report(run_id, {"status":"failed" if result["rejected"] else "ok","error":"EXCHANGE_REJECTED" if result["rejected"] else None,**result})
        return result

    def report(self, run_id, result):
        if getattr(self,"reporting",False):
            try:
                self.transport.call("/runs",{"runId":run_id,**{key:result[key] for key in ["status","error","sent","received","rejected"]}})
            except BridgeError:
                # Reporting failure cannot undo an already committed exchange.
                pass

    def _run_once(self):
        self.verify()
        source, environment = self.config.source_id, self.config.environment
        result = {"sent": 0, "received": 0, "duplicates": 0, "rejected": 0}
        if self.auto_export:
            self.native.call("QueueAll", source, environment)
        for _ in range(10):
            outgoing = parse_json(self.native.call("ClaimOutgoing", source, environment))
            if outgoing is None:
                break
            packet = outgoing.get("packet", {})
            if packet.get("environment") != environment or packet.get("messageId") != outgoing.get("messageId") or packet.get("kind") not in ["properties", "units", "tenants", "leases", "meters", "accounts", "statements"] or packet.get("schemaVersion") != 1:
                raise BridgeError("OUTGOING_PACKET_MISMATCH")
            answer = self.transport.call("/messages", packet)
            status = answer.get("status")
            if status not in {"applied", "failed"}:
                raise BridgeError("INVALID_CRM_RECEIPT")
            self.native.call("ConfirmOutgoing", source, environment, outgoing["messageId"], status == "applied")
            result["sent" if status == "applied" else "rejected"] += 1
            if status == "failed":
                break
        claimed = self.transport.call("/outbox/claim", {"limit": 50, "kinds": self.incoming_kinds})
        items = claimed.get("items")
        if not isinstance(items, list) or len(items) > 50:
            raise BridgeError("INVALID_CLAIM_RESPONSE")
        for message in items:
            if message.get("sourceId") != source or message.get("kind") not in self.incoming_kinds or not re.fullmatch(r"[A-Za-z0-9-]{1,100}", message.get("id", "")):
                raise BridgeError("INVALID_CLAIM_MESSAGE")
            envelope = {key: message[key] for key in ("messageId", "kind", "payload")}
            try:
                receipt = parse_json(self.native.call("ApplyMessage", source, environment, json.dumps(envelope, ensure_ascii=False, allow_nan=False)))
            except BridgeError as error:
                if str(error) not in SEMANTIC_ERRORS:
                    raise
                self.transport.call("/outbox/" + message["id"] + "/ack", {"accepted": False, "error": str(error)})
                result["rejected"] += 1
                continue
            if receipt.get("accepted") is not True:
                raise BridgeError("INVALID_ONE_C_RECEIPT")
            self.transport.call("/outbox/" + message["id"] + "/ack", {"accepted": True})
            result["received"] += 1
            result["duplicates"] += receipt.get("duplicate") is True
        return result


def load_env(path):
    allowed = {"ONE_C_CRM_URL", "ONE_C_SOURCE_ID", "ONE_C_ENVIRONMENT", "ONE_C_SOURCE_TOKEN", "ONE_C_DATABASE", "ONE_C_USER", "ONE_C_PASSWORD", "ONE_C_SERVER", "ONE_C_INFOBASE"}
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except (OSError, UnicodeError) as error:
        raise BridgeError("ENV_FILE_UNAVAILABLE") from error
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if "=" not in line:
            raise BridgeError("INVALID_ENV_FILE")
        name, value = line.split("=", 1)
        name, value = name.strip(), value.strip()
        if name not in allowed:
            raise BridgeError("INVALID_ENV_FILE")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(name, value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--check", action="store_true", help="Validate source/environment and native adapter without delivering messages")
    args = parser.parse_args()
    def finish(payload, code):
        if args.env_file:
            status_file = args.env_file.with_suffix(".status.json")
            try:
                value = {"finishedAt":datetime.now(timezone.utc).isoformat(),**payload}
                temporary = status_file.with_name(status_file.name + "." + str(os.getpid()) + ".tmp")
                temporary.write_text(json.dumps(value)+"\n",encoding="utf-8")
                os.replace(temporary,status_file)
            except OSError:
                pass
        print(json.dumps(payload))
        return code
    try:
        if args.env_file:
            load_env(args.env_file)
        worker = Worker(Config.from_env())
        result = worker.verify() if args.check else worker.run_once()
        rejected=bool(result.get("rejected",0))
        return finish({"status":"failed" if rejected else "ok",**result},1 if rejected else 0)
    except BridgeError as error:
        return finish({"status":"failed","code":str(error)},1)
    except Exception:
        return finish({"status":"failed","code":"BRIDGE_FAILED"},1)


if __name__ == "__main__":
    sys.exit(main())
