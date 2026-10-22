"""Read-only aggregate readiness inventory of a file BP base. Never exports business records."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path


def inspect(database):
    import win32com.client
    def quote(value):
        return '"' + value.replace('"', '""') + '"'
    connector = win32com.client.dynamic.Dispatch('V83.COMConnector')
    connection = 'File=' + quote(str(database)) + ';'
    if os.environ.get('ONE_C_USER'):
        connection += 'Usr=' + quote(os.environ['ONE_C_USER']) + ';Pwd=' + quote(os.environ.get('ONE_C_PASSWORD', '')) + ';'
    db = connector.Connect(connection)
    if db.Metadata.Name != 'БухгалтерияПредприятия':
        raise ValueError('UNSUPPORTED_CONFIGURATION')
    tables = {
        'organizations': 'Catalog.Организации',
        'counterparties': 'Catalog.Контрагенты',
        'contracts': 'Catalog.ДоговорыКонтрагентов',
        'ledgerEntries': 'AccountingRegister.Хозрасчетный',
        'salesDocuments': 'Document.РеализацияТоваровУслуг',
        'bankReceipts': 'Document.ПоступлениеНаРасчетныйСчет',
    }
    counts = {}
    for name, table in tables.items():
        query = db.NewObject('Query')
        query.Text = 'SELECT COUNT(*) AS Quantity FROM ' + table
        rows = query.Execute().Select()
        rows.Next()
        counts[name] = int(rows.Quantity)
    metadata = getattr(db.Metadata.AccountingRegisters, 'Хозрасчетный')
    return {
        'inspectedAt': datetime.now(timezone.utc).isoformat(),
        'configuration': {'name': db.Metadata.Name, 'version': db.Metadata.Version},
        'counts': counts,
        'registerDimensions': [metadata.Dimensions.Get(i).Name for i in range(metadata.Dimensions.Count())],
        'registerResources': [metadata.Resources.Get(i).Name for i in range(metadata.Resources.Count())],
        'financialReadiness': 'requires_organization_contracts_and_postings' if any(counts[key] == 0 for key in ['organizations', 'contracts', 'ledgerEntries']) else 'requires_explicit_accounting_mapping_and_reconciliation',
        'evidenceBoundary': 'Aggregate counts only, including marked-for-deletion and unposted records. No identities or transactions exported. No exchange or financial reconciliation proven.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    database = args.database.resolve()
    if not (database / '1Cv8.1CD').is_file():
        parser.error('An existing file database is required')
    try:
        result = inspect(database)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except Exception:
        print(json.dumps({'status': 'failed', 'code': 'READ_ONLY_INVENTORY_FAILED'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
