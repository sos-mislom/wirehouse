"""Generate stable extension metadata and compile it in an explicitly selected test base."""
import argparse
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = uuid.UUID("bedc9c76-d156-4db6-b985-5ef4e88a022a")
VERSION = "0.3.0"
HEADER = '''<?xml version="1.0" encoding="UTF-8"?>
<MetaDataObject xmlns="http://v8.1c.ru/8.3/MDClasses" xmlns:v8="http://v8.1c.ru/8.1/data/core" xmlns:xr="http://v8.1c.ru/8.3/xcf/readable" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:app="http://v8.1c.ru/8.2/managed-application/core" version="2.20">'''

# No accounting objects are adopted or changed. Identity is explicit per base.
REGISTERS = {
    "WH_Catalog": ({"SourceId":"key","Kind":"short","ExternalId":"key"}, {"Environment":"short","Payload":"text","PayloadHash":"key","Version":"integer"}),
    "WH_Snapshots": ({"SourceId":"key","Kind":"short","ExternalId":"key"}, {"Payload":"text","PayloadHash":"key","Version":"integer"}),
    "WH_Streams": ({"SourceId":"key","Kind":"short"}, {"PayloadHash":"key","MessageId":"key"}),
    "WH_Finance": ({"SourceId":"key","AccountExternalId":"key"}, {"Payload":"text"}),
    "WH_ActDocuments": ({"SourceId":"key","ActId":"key"}, {"DocumentId":"key","LedgerId":"key","ReceivedAt":"date"}),
    "WH_Demos": ({"SourceId":"key","DemoKey":"key"}, {"Payload":"text","CreatedAt":"date"}),
    "WH_MeterBindings": ({"SourceId":"key","ExternalId":"key","ValidFrom":"short"}, {"AccountExternalId":"key","CreatedAt":"date"}),
    "WH_Sources": ({"SourceId": "key"}, {"Environment": "short"}),
    "WH_Accounts": ({"SourceId": "key", "ExternalId": "key"}, {
        "Environment": "short", "LeaseExternalId": "key", "Number": "label",
        "ValidFrom": "short", "ValidTo": "short", "Status": "short", "Version": "integer",
    }),
    "WH_Meters": ({"SourceId": "key", "ExternalId": "key"}, {
        "Environment": "short", "AccountExternalId": "key", "InitialValue": "number", "IsActive": "boolean",
    }),
    "WH_Readings": ({"SourceId": "key", "SubmissionId": "key"}, {
        "Environment": "short", "MeterExternalId": "key", "AccountExternalId": "key",
        "BillingPeriod": "short", "Value": "number", "Previous": "number", "ReceivedAt": "date",
    }),
    "WH_Inbox": ({"SourceId": "key", "MessageId": "key"}, {
        "Environment": "short", "Kind": "short", "PayloadHash": "key", "ReceivedAt": "date",
    }),
    "WH_Outbox": ({"SourceId": "key", "MessageId": "key"}, {
        "Environment": "short", "Kind": "short", "Payload": "text", "Status": "short",
        "Attempts": "integer", "Priority": "integer", "LastError": "label", "NextAttemptAt": "date", "UpdatedAt": "date",
    }),
    "WH_WorkEvents": ({"SourceId": "key", "EventKey": "label"}, {
        "Environment": "short", "Kind": "short", "AccountExternalId": "key",
        "Payload": "text", "PayloadHash": "key", "ReceivedAt": "date",
    }),
}


def uid(name):
    return str(uuid.uuid5(NAMESPACE, name))


def save(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8-sig")


def field(kind, name, field_type, path):
    types = {
        "key": '<v8:Type>xs:string</v8:Type><v8:StringQualifiers><v8:Length>100</v8:Length><v8:AllowedLength>Variable</v8:AllowedLength></v8:StringQualifiers>',
        "short": '<v8:Type>xs:string</v8:Type><v8:StringQualifiers><v8:Length>32</v8:Length><v8:AllowedLength>Variable</v8:AllowedLength></v8:StringQualifiers>',
        "label": '<v8:Type>xs:string</v8:Type><v8:StringQualifiers><v8:Length>300</v8:Length><v8:AllowedLength>Variable</v8:AllowedLength></v8:StringQualifiers>',
        "text": '<v8:Type>xs:string</v8:Type><v8:StringQualifiers><v8:Length>0</v8:Length><v8:AllowedLength>Variable</v8:AllowedLength></v8:StringQualifiers>',
        "number": '<v8:Type>xs:decimal</v8:Type><v8:NumberQualifiers><v8:Digits>28</v8:Digits><v8:FractionDigits>10</v8:FractionDigits><v8:AllowedSign>Any</v8:AllowedSign></v8:NumberQualifiers>',
        "integer": '<v8:Type>xs:decimal</v8:Type><v8:NumberQualifiers><v8:Digits>10</v8:Digits><v8:FractionDigits>0</v8:FractionDigits><v8:AllowedSign>Nonnegative</v8:AllowedSign></v8:NumberQualifiers>',
        "boolean": '<v8:Type>xs:boolean</v8:Type>',
        "date": '<v8:Type>xs:dateTime</v8:Type><v8:DateQualifiers><v8:DateFractions>DateTime</v8:DateFractions></v8:DateQualifiers>',
    }
    return f'<{kind} uuid="{uid(path + name)}"><Properties><Name>{name}</Name><Synonym/><Comment/><Type>{types[field_type]}</Type><FillChecking>DontCheck</FillChecking></Properties></{kind}>'


def generate(target):
    children = '<Role>WH_Integration</Role><CommonModule>WH_Exchange</CommonModule>' + ''.join(f'<InformationRegister>{name}</InformationRegister>' for name in REGISTERS)
    classes = ['9cd510cd-abfc-11d4-9434-004095e12fc7', '9fcd25a0-4822-11d4-9414-008048da11f9', 'e3687481-0a87-462c-a166-9f34594f9bba', '9de14907-ec23-4a07-96f0-85521cb6b53b', '51f2d5d8-ea4d-4064-8892-82951750031e', 'e68182ea-4237-4383-967f-90c1e3370bc7', 'fb282519-d103-4dd3-bc12-cb271d631dfc']
    internal = ''.join(f'<xr:ContainedObject><xr:ClassId>{value}</xr:ClassId><xr:ObjectId>{uid(value)}</xr:ObjectId></xr:ContainedObject>' for value in classes)
    config = f'''<Configuration uuid="{uid('Configuration')}"><InternalInfo>{internal}</InternalInfo><Properties>
<ObjectBelonging>Adopted</ObjectBelonging><Name>WirehouseExchange</Name><Synonym/><Comment/>
<ConfigurationExtensionPurpose>AddOn</ConfigurationExtensionPurpose><KeepMappingToExtendedConfigurationObjectsByIDs>true</KeepMappingToExtendedConfigurationObjectsByIDs>
<NamePrefix>WH_</NamePrefix><ConfigurationExtensionCompatibilityMode>Version8_3_27</ConfigurationExtensionCompatibilityMode>
<DefaultRunMode>ManagedApplication</DefaultRunMode><ScriptVariant>English</ScriptVariant><Vendor>Wirehouse</Vendor><Version>{VERSION}</Version>
</Properties><ChildObjects>{children}</ChildObjects></Configuration>'''
    save(target / 'Configuration.xml', HEADER + config + '</MetaDataObject>')
    role = f'<Role uuid="{uid("WH_Integration")}"><Properties><Name>WH_Integration</Name><Synonym/><Comment/></Properties></Role>'
    save(target / 'Roles/WH_Integration.xml', HEADER + role + '</MetaDataObject>')
    rights = ''.join(f'<object><name>InformationRegister.{name}</name><right><name>Read</name><value>true</value></right><right><name>Update</name><value>true</value></right></object>' for name in REGISTERS)
    save(target / 'Roles/WH_Integration/Ext/Rights.xml', '<?xml version="1.0" encoding="UTF-8"?><Rights xmlns="http://v8.1c.ru/8.2/roles" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.20"><setForNewObjects>false</setForNewObjects><setForAttributesByDefault>false</setForAttributesByDefault><independentRightsOfChildObjects>true</independentRightsOfChildObjects>' + rights + '</Rights>')
    module = f'''<CommonModule uuid="{uid('WH_Exchange')}"><Properties>
<Name>WH_Exchange</Name><Synonym/><Comment/><Global>false</Global><ClientManagedApplication>false</ClientManagedApplication>
<Server>true</Server><ExternalConnection>true</ExternalConnection><ClientOrdinaryApplication>false</ClientOrdinaryApplication><ServerCall>false</ServerCall><Privileged>false</Privileged><ReturnValuesReuse>DontUse</ReturnValuesReuse>
</Properties></CommonModule>'''
    save(target / 'CommonModules/WH_Exchange.xml', HEADER + module + '</MetaDataObject>')
    source = ROOT / 'integrations/one-c/src/Exchange.bsl'
    save(target / 'CommonModules/WH_Exchange/Ext/Module.bsl', '\n'.join((ROOT / 'integrations/one-c/src' / name).read_text(encoding='utf-8-sig') for name in ['Exchange.bsl','Master.bsl','Demo.bsl','Acts.bsl']))
    for name, (dimensions, resources) in REGISTERS.items():
        generated = ''
        for category in ['Record', 'Manager', 'Selection', 'List', 'RecordSet', 'RecordKey', 'RecordManager']:
            generated += f'<xr:GeneratedType name="InformationRegister{category}.{name}" category="{category}"><xr:TypeId>{uid(name + category + "type")}</xr:TypeId><xr:ValueId>{uid(name + category + "value")}</xr:ValueId></xr:GeneratedType>'
        fields = ''.join(field('Dimension', key, value, name) for key, value in dimensions.items())
        fields += ''.join(field('Resource', key, value, name) for key, value in resources.items())
        register = f'''<InformationRegister uuid="{uid(name)}"><InternalInfo>{generated}</InternalInfo><Properties>
<Name>{name}</Name><Synonym/><Comment/><UseStandardCommands>true</UseStandardCommands><EditType>InDialog</EditType>
<InformationRegisterPeriodicity>Nonperiodical</InformationRegisterPeriodicity><WriteMode>Independent</WriteMode><MainFilterOnPeriod>false</MainFilterOnPeriod><DataLockControlMode>Managed</DataLockControlMode><EnableTotalsSliceFirst>false</EnableTotalsSliceFirst><EnableTotalsSliceLast>false</EnableTotalsSliceLast>
</Properties><ChildObjects>{fields}</ChildObjects></InformationRegister>'''
        save(target / f'InformationRegisters/{name}.xml', HEADER + register + '</MetaDataObject>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.local/one-c-build')
    parser.add_argument('--database', type=Path, help='Disposable build/test base, never the working accounting base')
    parser.add_argument('--platform', type=Path)
    parser.add_argument('--skip-check', action='store_true', help='Skip the whole-configuration checker; native runtime tests are still required')
    args = parser.parse_args()
    args.output = args.output.resolve()
    generate(args.output / 'extension-src')
    if not args.database:
        print('Generated extension metadata:', args.output / 'extension-src')
        return
    database = args.database.resolve()
    if '.local' not in database.parts or not (database / '1Cv8.1CD').is_file():
        parser.error('Compilation requires an existing disposable database under .local')
    if not args.platform or not args.platform.is_file():
        parser.error('--platform must point to installed 1cv8.exe')
    common = [str(args.platform), 'DESIGNER', '/F', str(database), '/DisableStartupDialogs', '/DisableStartupMessages']
    steps = [
        ('load', ['/LoadConfigFromFiles', str(args.output / 'extension-src'), '-Extension', 'WirehouseExchange']),
        ('update', ['/UpdateDBCfg', '-Extension', 'WirehouseExchange']),
        ('check', ['/CheckConfig', '-Extension', 'WirehouseExchange', '-ExternalConnection', '-Server']),
        ('dump', ['/DumpCfg', str(args.output / f'WirehouseExchange-{VERSION}.cfe'), '-Extension', 'WirehouseExchange']),
    ]
    for step, flags in steps:
        if step == 'check' and args.skip_check:
            continue
        log = args.output / f'{step}.log'
        run = subprocess.run(common + flags + ['/Out', str(log)], creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=300)
        if run.returncode:
            print(log.read_text(encoding='utf-8-sig') if log.exists() else 'No diagnostic log')
            parser.exit(run.returncode, f'1C {step} failed; see {log}\n')
        print(f'1C {step}: OK')
    print('Built:', args.output / f'WirehouseExchange-{VERSION}.cfe')


if __name__ == '__main__':
    main()
