"""Native 1C checks and synthetic fixtures. Refuses databases outside .local."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "integrations/one-c"))
from wirehouse_bridge import BridgeError, Config, Transport, Worker


def seed(database, source_id):
    import win32com.client
    connector = win32com.client.dynamic.Dispatch("V83.COMConnector")
    db = connector.Connect(f'File="{database}";')
    module = db.WH_Exchange
    native_contract = db.Metadata.Catalogs.Find("ДоговорыКонтрагентов") is not None
    contract_id = str(uuid.uuid4())
    if native_contract:
        # Fixtures only: DataExchange.Load suppresses application-side handlers,
        # not native 1C persistence. No document is posted, no sums are generated.
        tenant = getattr(db.Catalogs, "Контрагенты").CreateItem()
        tenant.Description = "WIREHOUSE SYNTHETIC " + str(uuid.uuid4())
        tenant.DataExchange.Load = True
        tenant.Write()
        contract = getattr(db.Catalogs, "ДоговорыКонтрагентов").CreateItem()
        contract.Description = "WIREHOUSE TEST " + str(uuid.uuid4())
        contract.Owner = tenant.Ref
        setattr(contract, "Номер", "WH-TEST")
        setattr(contract, "Дата", datetime(2026, 1, 1))
        contract.DataExchange.Load = True
        contract.Write()
        contract_id = db.String(contract.Ref.UUID())
    module.ConfigureSource(source_id, "test")
    account = {"externalId": str(uuid.uuid4()), "leaseExternalId": contract_id, "number": "WH-TEST-001",
               "validFrom": "2026-01-01", "validTo": None, "status": "active", "version": 1}
    module.PutAccount(source_id, "test", json.dumps(account))
    meter = {"externalId": str(uuid.uuid4()), "accountExternalId": account["externalId"], "initialValue": 100, "active": True}
    module.PutMeter(source_id, "test", json.dumps(meter))
    packet_id = module.QueueAccounts(source_id, "test")
    fixture = {"sourceId": source_id, "environment": "test", "account": account, "meter": meter,
               "messageId": packet_id, "nativeBPContract": native_contract,
               "configuration": {"name": db.Metadata.Name, "version": db.Metadata.Version}}
    return connector, db, module, fixture


def run_checks(module, fixture):
    source_id, env = fixture["sourceId"], "test"
    passed = []
    def check(name, callback):
        callback()
        passed.append(name)
    def reject(name, callback, code):
        try:
            callback()
        except Exception as error:
            assert code in str(error), str(error)
        else:
            raise AssertionError(name + " was not rejected")
        passed.append(name)
    def equal(actual, expected):
        assert actual == expected, (actual, expected)
    payload = {"schemaVersion": 1, "submissionId": str(uuid.uuid4()), "period": "2026-10",
               "meterExternalId": fixture["meter"]["externalId"], "accountExternalId": fixture["account"]["externalId"],
               "value": 120, "previous": 100, "photoDocumentId": None}
    message = {"messageId": str(uuid.uuid4()), "kind": "readings", "payload": payload}
    apply = lambda value=message: json.loads(module.ApplyMessage(source_id, env, json.dumps(value)))
    check("apply real reading", lambda: equal(apply(), {"accepted": True, "duplicate": False}))
    check("identical replay", lambda: equal(apply(), {"accepted": True, "duplicate": True}))
    reordered = dict(reversed(list(message.items())))
    reordered["payload"] = dict(reversed(list(payload.items())))
    check("key order independent receipt", lambda: equal(apply(reordered)["duplicate"], True))
    reject("message ID conflict", lambda: apply({**message, "payload": {**payload, "value": 121}}), "MESSAGE_CONFLICT")
    reject("submission conflict", lambda: apply({**message, "messageId": str(uuid.uuid4()), "payload": {**payload, "value": 121}}), "SUBMISSION_CONFLICT")
    reject("source environment", lambda: module.ApplyMessage(source_id, "production", json.dumps(message)), "ENVIRONMENT_MISMATCH")
    reject("immutable source environment", lambda: module.ConfigureSource(source_id, "production"), "ENVIRONMENT_IMMUTABLE")
    reject("unsupported kind", lambda: apply({**message, "kind": "future_kind"}), "UNSUPPORTED_KIND")
    reject("foreign meter", lambda: apply({**message, "messageId": str(uuid.uuid4()), "payload": {**payload, "submissionId": str(uuid.uuid4()), "meterExternalId": str(uuid.uuid4())}}), "METER_NOT_FOUND")
    reject("previous reading", lambda: apply({**message, "messageId": str(uuid.uuid4()), "payload": {**payload, "submissionId": str(uuid.uuid4()), "period": "2026-11", "previous": 119, "value": 130}}), "PREVIOUS_READING_CONFLICT")
    reject("duplicate meter period", lambda: apply({**message, "messageId": str(uuid.uuid4()), "payload": {**payload, "submissionId": str(uuid.uuid4())}}), "PERIOD_ALREADY_RECEIVED")
    reject("strict native fields", lambda: apply({**message, "messageId": str(uuid.uuid4()), "payload": {**payload, "unexpected": True}}), "INVALID_FIELDS")
    reject("account version conflict", lambda: module.PutAccount(source_id, env, json.dumps({**fixture["account"], "number": "changed"})), "VERSION_CONFLICT")
    reject("meter identity immutable", lambda: module.PutMeter(source_id, env, json.dumps({**fixture["meter"], "initialValue": 99})), "METER_IDENTITY_IMMUTABLE")
    state = json.loads(module.InspectState(source_id, env))
    check("failed transactions leave no receipt or reading", lambda: equal((state["WH_Readings"], state["WH_Inbox"]), (1, 1)))
    reading = json.loads(module.GetReading(source_id, env, payload["submissionId"]))
    check("native value persisted", lambda: equal((reading["value"], reading["previous"]), (120, 100)))
    outgoing = json.loads(module.ClaimOutgoing(source_id, env))
    check("stable native outbox", lambda: equal(outgoing["packet"]["items"], [fixture["account"]]))
    check("outbox lease excludes immediate second claim", lambda: equal(json.loads(module.ClaimOutgoing(source_id, env)), None))
    module.ConfirmOutgoing(source_id, env, outgoing["messageId"], True)
    module.ConfirmOutgoing(source_id, env, outgoing["messageId"], True)
    reject("cannot reject confirmed export", lambda: module.ConfirmOutgoing(source_id, env, outgoing["messageId"], False), "ALREADY_CONFIRMED")
    ticket_id = str(uuid.uuid4())
    work = {"schemaVersion": 1, "ticketId": ticket_id, "number": "WH-TEST-2",
            "accountExternalId": fixture["account"]["externalId"], "termsVersion": 1,
            "resultVersion": 1, "amount": 122, "acceptedBy": str(uuid.uuid4()), "acceptedAt": "2026-10-22T10:00:00.000Z"}
    event = lambda kind, payload: {"messageId": str(uuid.uuid4()), "kind": kind, "payload": payload}
    work_message = event("work_results", work)
    check("native work receipt", lambda: equal(apply(work_message)["duplicate"], False))
    check("native work transport replay", lambda: equal(apply(work_message)["duplicate"], True))
    check("native work business replay", lambda: equal(apply(event("work_results", work))["duplicate"], True))
    reject("work immutable version", lambda: apply(event("work_results", {**work, "amount": 124})), "WORK_EVENT_CONFLICT")
    reject("work foreign account", lambda: apply(event("work_results", {**work, "accountExternalId": str(uuid.uuid4())})), "ACCOUNT_NOT_FOUND")
    reopened = {"schemaVersion": 1, "ticketId": ticket_id, "accountExternalId": fixture["account"]["externalId"],
                "previousResultVersion": 1, "resultVersion": 2, "reason": "Synthetic retry"}
    check("native work reopened history", lambda: equal(apply(event("work_reopened", reopened))["duplicate"], False))
    reject("work version gap", lambda: apply(event("work_reopened", {**reopened, "resultVersion": 3})), "INVALID_RESULT_VERSION")
    line = {"kind": "labor", "catalogId": None, "description": "Synthetic labor", "unit": "hour",
            "quantity": 2, "unitPrice": 50, "vatRate": "22", "net": 100, "vat": 22, "total": 122}
    act = {"schemaVersion": 1, "actId": str(uuid.uuid4()), "number": "WH-ACT-TEST", "date": "2026-10-22",
           "ticketId": ticket_id, "accountExternalId": fixture["account"]["externalId"], "total": 122, "lines": [line]}
    check("native act receipt", lambda: equal(apply(event("service_acts", act))["duplicate"], False))
    check("native act business replay", lambda: equal(apply(event("service_acts", act))["duplicate"], True))
    reject("act immutable contents", lambda: apply(event("service_acts", {**act, "number": "changed"})), "WORK_EVENT_CONFLICT")
    reject("act total reconciliation", lambda: apply(event("service_acts", {**act, "total": 123})), "ACT_TOTAL_MISMATCH")
    reject("act line reconciliation", lambda: apply(event("service_acts", {**act, "lines": [{**line, "vat": 20}]})), "ACT_TOTAL_MISMATCH")
    reject("act required lines", lambda: apply(event("service_acts", {**act, "lines": []})), "INVALID_ACT_LINES")
    saved_act = json.loads(module.GetWorkEvent(source_id, env, "service_acts:" + act["actId"]))
    check("native act snapshot retained", lambda: equal(saved_act, act))
    state = json.loads(module.InspectState(source_id, env))
    check("failed work leaves no business rows or receipts", lambda: equal((state["WH_WorkEvents"], state["WH_Inbox"]), (3, 6)))
    return passed


class DropAck(Transport):
    def call(self, suffix, data=None):
        if suffix.endswith("/ack") and data == {"accepted": True}:
            raise BridgeError("TEST_ACK_LOST")
        return super().call(suffix, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--source-id", default=None)
    parser.add_argument("--fixture-only", action="store_true")
    parser.add_argument("--state-only", action="store_true")
    parser.add_argument("--drop-ack", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    database = args.database.resolve()
    if ".local" not in database.parts or not (database / "1Cv8.1CD").exists():
        parser.error("A disposable test database under .local is required")
    if args.drop_ack:
        config = Config.from_env()
        if config.environment != "test" or Path(config.database).resolve() != database:
            parser.error("Lost-ack simulation requires this test database")
        try:
            Worker(config, transport=DropAck(config)).run_once()
        except BridgeError as error:
            assert str(error) == "TEST_ACK_LOST", str(error)
            print(json.dumps({"status": "simulated_ack_loss"}))
            return
        raise AssertionError("No reading acknowledgement was intercepted")
    if args.state_only:
        import win32com.client
        connector = win32com.client.dynamic.Dispatch("V83.COMConnector")
        db = connector.Connect(f'File="{database}";')
        print(db.WH_Exchange.InspectState(args.source_id, "test"))
        return
    connector, db, module, fixture = seed(database, args.source_id or str(uuid.uuid4()))
    result = {"fixture": fixture}
    if not args.fixture_only:
        result["passed"] = run_checks(module, fixture)
        result["state"] = json.loads(module.InspectState(fixture["sourceId"], "test"))
        result["status"] = "passed"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
