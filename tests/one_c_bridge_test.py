import json
import importlib.util
import io
import os
from contextlib import redirect_stdout
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "integrations/one-c"))
from wirehouse_bridge import BridgeError, Config, Worker, load_env, parse_json


class FakeNative:
    def __init__(self, error=None):
        self.calls = []
        self.error = error
        self.outgoing = None
        self.incoming_kinds = None

    def call(self, name, *args):
        self.calls.append((name, args))
        if name == "AdapterInfo":
            return json.dumps({'schemaVersion': 1, **({'incomingKinds': self.incoming_kinds} if self.incoming_kinds is not None else {})})
        if name == "InspectState":
            return '{}'
        if name == "ClaimOutgoing":
            row, self.outgoing = self.outgoing, None
            return json.dumps(row)
        if name == "ApplyMessage":
            if self.error:
                raise BridgeError(self.error)
            return '{"accepted":true,"duplicate":true}'


class FakeTransport:
    def __init__(self):
        self.calls = []
        self.environment = "test"
        self.items = [{"id": "row-1", "sourceId": "source-1", "messageId": "reading-1", "kind": "readings", "payload": {}}]
        self.incoming_status = "applied"
        self.outgoing_kinds = ["readings"]

    def call(self, suffix, data=None):
        self.calls.append((suffix, data))
        if suffix == "/capabilities":
            return {"sourceId": "source-1", "environment": self.environment, "schemaVersion": 1, "incomingKinds": ["accounts"], "outgoingKinds": self.outgoing_kinds}
        if suffix == "/outbox/claim":
            return {"items": self.items}
        if suffix == "/messages":
            return {"status": self.incoming_status}
        return {}


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        (Path(self.directory.name) / "1Cv8.1CD").touch()
        self.config = Config("http://127.0.0.1:19045", "source-1", "test", "x" * 43, self.directory.name)
        self.native = FakeNative()
        self.transport = FakeTransport()

    def worker(self):
        return Worker(self.config, self.native, self.transport)

    def test_ack_follows_native_commit_and_duplicates_are_success(self):
        result = self.worker().run_once()
        self.assertEqual((result["received"], result["duplicates"]), (1, 1))
        self.assertIn(("/outbox/claim", {"limit": 50, "kinds": ["readings"]}), self.transport.calls)
        self.assertIn(("/outbox/row-1/ack", {"accepted": True}), self.transport.calls)

    def test_semantic_failure_is_visible_and_never_positively_acknowledged(self):
        self.native.error = "METER_NOT_FOUND"
        self.assertEqual(self.worker().run_once()["rejected"], 1)
        self.assertEqual(self.transport.calls[-1], ("/outbox/row-1/ack", {"accepted": False, "error": "METER_NOT_FOUND"}))

    def test_native_capabilities_select_new_supported_work_kinds(self):
        kinds = ["readings", "work_results", "work_reopened", "service_acts"]
        self.native.incoming_kinds = kinds
        self.transport.outgoing_kinds = kinds + ["future_kind"]
        self.transport.items[0]["kind"] = "service_acts"
        self.assertEqual(self.worker().run_once()["received"], 1)
        self.assertIn(("/outbox/claim", {"limit": 50, "kinds": kinds}), self.transport.calls)

    def test_old_native_adapter_does_not_claim_work_events(self):
        self.transport.outgoing_kinds = ["readings", "service_acts"]
        self.worker().run_once()
        self.assertIn(("/outbox/claim", {"limit": 50, "kinds": ["readings"]}), self.transport.calls)

    def test_act_reconciliation_error_is_negatively_acknowledged(self):
        self.native.error = "ACT_TOTAL_MISMATCH"
        self.assertEqual(self.worker().run_once()["rejected"], 1)
        self.assertEqual(self.transport.calls[-1], ("/outbox/row-1/ack", {"accepted": False, "error": "ACT_TOTAL_MISMATCH"}))

    def test_uncertain_native_commit_is_not_acknowledged(self):
        self.native.error = "ONE_C_OPERATION_UNCERTAIN"
        with self.assertRaisesRegex(BridgeError, "ONE_C_OPERATION_UNCERTAIN"):
            self.worker().run_once()
        self.assertFalse(any(suffix.endswith("/ack") for suffix, _ in self.transport.calls))

    def test_environment_is_checked_before_claim_or_native_mutation(self):
        self.transport.environment = "production"
        with self.assertRaisesRegex(BridgeError, "CAPABILITIES_MISMATCH"):
            self.worker().run_once()
        self.assertEqual(self.native.calls, [])
        self.assertEqual(len(self.transport.calls), 1)

    def test_foreign_source_in_claim_is_rejected(self):
        self.transport.items[0]["sourceId"] = "other-source"
        with self.assertRaisesRegex(BridgeError, "INVALID_CLAIM_MESSAGE"):
            self.worker().run_once()
        self.assertFalse(any(name == "ApplyMessage" for name, _ in self.native.calls))

    def test_http_200_failed_package_is_not_success(self):
        self.native.outgoing = {"messageId": "packet-1", "packet": {"messageId": "packet-1", "kind": "accounts", "schemaVersion": 1, "environment": "test", "items": []}}
        self.transport.incoming_status = "failed"
        result = self.worker().run_once()
        self.assertEqual((result["sent"], result["rejected"]), (0, 1))
        self.assertIn(("ConfirmOutgoing", ("source-1", "test", "packet-1", False)), self.native.calls)

    def test_insecure_remote_or_production_urls_and_credential_urls_are_rejected(self):
        for url, env in [("http://example.test", "test"), ("http://127.0.0.1", "production"), ("https://user:secret@example.test", "test"), ("https://example.test?token=secret", "test")]:
            with self.subTest(url=url):
                config = Config(url, "source-1", env, "x" * 43, self.directory.name)
                with self.assertRaises(BridgeError):
                    config.validate()

    def test_json_rejects_duplicates_nonfinite_and_malformed_input(self):
        for raw in ['{"id":1,"id":2}', '{"value":NaN}', '{"value":Infinity}', '{', 'null trailing']:
            with self.subTest(raw=raw), self.assertRaises(BridgeError):
                parse_json(raw)

    def test_private_env_file_preserves_opaque_secrets_and_existing_environment(self):
        path = Path(self.directory.name) / 'agent.env'
        path.write_text('ONE_C_PASSWORD="private=opaque value"\nONE_C_USER=file-user\n', encoding='utf-8-sig')
        with patch.dict(os.environ, {'ONE_C_USER': 'process-user'}, clear=True):
            load_env(path)
            self.assertEqual(os.environ['ONE_C_PASSWORD'], 'private=opaque value')
            self.assertEqual(os.environ['ONE_C_USER'], 'process-user')

    def test_server_credentials_are_not_accepted_as_agent_configuration(self):
        path = Path(self.directory.name) / 'wrong.env'
        path.write_text('JWT_ACCESS_SECRET=do-not-load\n', encoding='utf-8')
        with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(BridgeError, 'INVALID_ENV_FILE'):
            load_env(path)

    def configure(self):
        spec = importlib.util.spec_from_file_location('configure_one_c_test', ROOT / 'scripts/configure-one-c.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        mapping = Path(self.directory.name) / 'mapping.json'
        mapping.write_text(json.dumps({'accounts': [{'externalId': 'account-1'}], 'meters': [{'externalId': 'meter-1'}]}), encoding='utf-8')
        with patch.object(sys, 'argv', ['configure-one-c.py', '--env-file', 'private.env', '--mapping', str(mapping)]), patch.object(module, 'load_env'), patch.object(module.Config, 'from_env', return_value=self.config), patch.object(module, 'Transport', return_value=self.transport), patch.object(module, 'Native', return_value=self.native), redirect_stdout(io.StringIO()) as output:
            code = module.main()
        return code, json.loads(output.getvalue())

    def test_configuration_rejects_remote_environment_before_native_writes(self):
        self.transport.environment = 'production'
        code, result = self.configure()
        self.assertEqual((code, result['code']), (1, 'CAPABILITIES_MISMATCH'))
        self.assertEqual(self.native.calls, [])

    def test_configuration_stages_native_mappings_and_queue_without_sending_business_data(self):
        code, result = self.configure()
        self.assertEqual((code, result['status']), (0, 'configured'))
        self.assertEqual([name for name, _ in self.native.calls], ['AdapterInfo', 'ConfigureSource', 'PutAccount', 'PutMeter', 'QueueAccounts'])
        self.assertEqual([suffix for suffix, _ in self.transport.calls], ['/capabilities'])


if __name__ == '__main__':
    unittest.main()
