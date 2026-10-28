"""Explicit, idempotent native BP demonstration. Never invoked by the automatic agent."""
import argparse
import json
from pathlib import Path
import sys
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'integrations/one-c'))
from wirehouse_bridge import Config, Native, load_env


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['seed','financial','state','act','post-demo-act','correct-charge','test-native'])
    parser.add_argument('--env-file',type=Path)
    parser.add_argument('--database',type=Path)
    parser.add_argument('--source-id')
    parser.add_argument('--environment',choices=['test','production'],default='test')
    parser.add_argument('--key',default='WH-DEMO-20261028')
    parser.add_argument('--account-id')
    parser.add_argument('--act-id')
    parser.add_argument('--amount',type=float)
    parser.add_argument('--working-demo',action='store_true',help='Explicitly authorize marked demo records in the selected working BP')
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.env_file:
        load_env(args.env_file); config=Config.from_env()
        database=Path(config.database).resolve() if config.database else None
        source,environment=config.source_id,config.environment
        native=Native(config)
        call=native.call
    else:
        if not args.database: parser.error('--database or --env-file is required')
        database=args.database.resolve()
        if not (database/'1Cv8.1CD').is_file(): parser.error('An existing file BP is required')
        import win32com.client
        connector=win32com.client.dynamic.Dispatch('V83.COMConnector')
        db=connector.Connect('File="'+str(database).replace('"','""')+'";')
        module=db.WH_Exchange
        call=lambda name,*values:getattr(module,name)(*values)
        source,environment=args.source_id or str(uuid.uuid4()),args.environment
    disposable=database is not None and '.local' in database.parts
    mutation=args.action in ['seed','post-demo-act','correct-charge','test-native']
    if mutation and not disposable and not args.working_demo:
        parser.error('Working BP demo mutations require --working-demo; data are explicitly marked TEST')
    if args.action=='test-native' and (not disposable or environment!='test'):
        parser.error('Native regression requires a disposable .local test BP')
    if args.action=='seed':
        fixture=json.loads(call('CreateDemo',source,environment,args.key,'CREATE_MARKED_TEST_DATA'))
        result={'sourceId':source,'environment':environment,'fixture':fixture,'adapter':json.loads(call('AdapterInfo'))}
    elif args.action=='financial':
        if not args.account_id: parser.error('--account-id required')
        result=json.loads(call('GetFinancialSnapshot',source,environment,args.account_id))
    elif args.action=='state': result=json.loads(call('InspectState',source,environment))
    elif args.action=='act': result=json.loads(call('GetServiceActDocument',source,environment,args.act_id))
    elif args.action=='post-demo-act':
        result={'ledgerId':call('PostDemoAct',source,environment,args.act_id,'POST_MARKED_DEMO_OPERATION')}
    elif args.action=='correct-charge':
        if args.amount is None: parser.error('--amount required')
        call('CorrectDemoCharge',source,environment,args.key,args.amount,'CORRECT_MARKED_DEMO_OPERATION')
        result={'status':'corrected'}
    else:
        fixture=json.loads(call('CreateDemo',source,environment,'WH-DEMO-'+uuid.uuid4().hex[:10],'CREATE_MARKED_TEST_DATA'))
        passed=[]
        def check(name,condition):
            if not condition: raise AssertionError(name)
            passed.append(name)
        snapshot=lambda:json.loads(call('GetFinancialSnapshot',source,environment,fixture['accountId']))
        first=snapshot()
        check('Real native ledger reconciles opening/charge/payment/closing',[first[k] for k in ['opening','charged','paid','closing']]==[1000,10000,6000,5000])
        check('Unchanged financial snapshot preserves its version',snapshot()==first)
        check('Demo creation is idempotent',json.loads(call('CreateDemo',source,environment,fixture['demoKey'],'CREATE_MARKED_TEST_DATA'))==fixture)
        queued=json.loads(call('QueueAll',source,environment))
        check('All seven source kinds queued',len(queued)==7)
        check('Unchanged queue is not duplicated',json.loads(call('QueueAll',source,environment))==[])
        kinds=[]
        for _ in range(7):
            claimed=json.loads(call('ClaimOutgoing',source,environment));kinds.append(claimed['packet']['kind'])
            check('Outgoing lease excludes parallel claims '+kinds[-1],json.loads(call('ClaimOutgoing',source,environment)) is None)
            call('ConfirmOutgoing',source,environment,claimed['messageId'],True)
        check('Dependency order is explicit',kinds==['properties','units','tenants','leases','meters','accounts','statements'])
        act_id=str(uuid.uuid4());ticket_id=str(uuid.uuid4())
        act={'schemaVersion':1,'actId':act_id,'number':'WH-DEMO-ACT','date':'2026-10-28','ticketId':ticket_id,'accountExternalId':fixture['accountId'],'total':122,
             'lines':[{'kind':'labor','catalogId':None,'description':'ТЕСТ Работа','unit':'hour','quantity':2,'unitPrice':50,'vatRate':'22','net':100,'vat':22,'total':122}]}
        message={'messageId':str(uuid.uuid4()),'kind':'service_acts','payload':act}
        apply=lambda:json.loads(call('ApplyMessage',source,environment,json.dumps(message,ensure_ascii=False)))
        check('Act is received atomically',apply()=={'accepted':True,'duplicate':False})
        document=json.loads(call('GetServiceActDocument',source,environment,act_id))
        check('Actual BP sales draft exists',document['total']==122 and not document['posted'])
        check('Transport replay does not duplicate the sales draft',apply()['duplicate'] and json.loads(call('GetServiceActDocument',source,environment,act_id))['documentId']==document['documentId'])
        ledger=call('PostDemoAct',source,environment,act_id,'POST_MARKED_DEMO_OPERATION')
        check('Demo native posting is idempotent',call('PostDemoAct',source,environment,act_id,'POST_MARKED_DEMO_OPERATION')==ledger)
        after=snapshot()
        check('Native act operation returns through accounting ledger',[after[k] for k in ['charged','paid','closing']]==[10122,6000,5122])
        call('CorrectDemoCharge',source,environment,fixture['demoKey'],12000,'CORRECT_MARKED_DEMO_OPERATION')
        corrected=snapshot()
        check('Native correction increments version and reconciles',corrected['version']>after['version'] and corrected['charged']==12122 and corrected['closing']==7122)
        second_account=str(uuid.uuid4())
        call('PutAccount',source,environment,json.dumps({'externalId':second_account,'leaseExternalId':fixture['contractId'],'number':'WH-DEMO-NEXT','validFrom':'2026-11-01','validTo':'2027-12-31','status':'active','version':1}))
        call('SetMeterAccount',source,environment,fixture['meterId'],second_account,'2026-11-01')
        call('SetMeterAccount',source,environment,fixture['meterId'],second_account,'2026-11-01')
        def reading(period,account,value,previous):
            packet={'messageId':str(uuid.uuid4()),'kind':'readings','payload':{'schemaVersion':1,'submissionId':str(uuid.uuid4()),'period':period,'meterExternalId':fixture['meterId'],'accountExternalId':account,'value':value,'previous':previous,'photoDocumentId':None}}
            return json.loads(call('ApplyMessage',source,environment,json.dumps(packet)))
        check('Future handover preserves the old billing month',reading('2026-10',fixture['accountId'],120,100)['accepted'])
        check('Next billing month uses the new account',reading('2026-11',second_account,130,120)['accepted'])
        try:
            call('SetMeterAccount',source,environment,fixture['meterId'],fixture['accountId'],'2026-10-01')
        except Exception as error:
            check('Accepted reading month cannot be reassigned','METER_BINDING_HAS_READINGS' in str(error))
        else:raise AssertionError('Historical binding was changed')
        result={'status':'passed','sourceId':source,'fixture':fixture,'passed':passed,'salesDraft':document,'ledgerId':ledger,'financial':corrected,'state':json.loads(call('InspectState',source,environment)),
                'boundary':'Native tests acknowledge an isolated outbox directly. HTTP delivery is verified separately; demo manual operation does not post sales VAT registers.'}
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=True))


if __name__=='__main__': main()
