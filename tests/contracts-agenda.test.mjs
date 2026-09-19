import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './fixtures.mjs';
import {getAgenda,updateRenewal,agendaIcs} from '../apps/api/src/agenda.js';
import {parseDto,parseJsonBody} from '../apps/api/src/http/body.js';
import {propertyCreate,operationSchemas,renewalUpdate} from '../packages/contracts/src/requests.ts';
import {RedisTtlStore} from '../apps/api/src/infrastructure/ttl-store.js';
import {WarehouseDatabase} from '../apps/api/src/database.js';
import {Readable} from 'node:stream';

test('DTOs reject coercion, unknown properties and malformed JSON without silently losing input',async()=>{
 const good={name:'A',address:'Москва',totalArea:100,rentableArea:80,warehouseClass:'A'};
 assert.deepEqual(parseDto(propertyCreate,good),good);
 for(const patch of [{totalArea:'100'},{totalArea:true},{totalArea:null},{extra:'ignored before'}])assert.throws(()=>parseDto(propertyCreate,{...good,...patch}),e=>e.status===400&&e.code==='VALIDATION_ERROR'&&e.fields.length>0);
 assert.throws(()=>parseDto(operationSchemas.plans,{propertyId:'p',name:'Осмотр',unitId:'u',nextDate:'2026-02-30',intervalDays:30,checklist:['Проверить']}));
 assert.throws(()=>parseDto(renewalUpdate,{status:'renewing',note:'',version:'1'}));
 for(const payload of ['null','[]','{"name":']){const req=Readable.from([Buffer.from(payload)]);req.url='/api/properties';req.method='POST';req.headers={'content-type':'application/json'};await assert.rejects(parseJsonBody(req),e=>e.status===400);}
 const req=Readable.from([Buffer.from('{}')]);req.url='/api/properties';req.method='POST';req.headers={'content-type':'text/plain'};await assert.rejects(parseJsonBody(req),e=>e.status===415);
});

test('Agenda uses real outstanding sums and scoped dates; renewal decisions persist with optimistic locking',t=>{
 const f=fixture();t.after(f.cleanup);const now=new Date(`${new Date().getFullYear()}-12-15T12:00:00Z`);
 const invoice=f.db.createBillingInvoice({leaseId:f.lease.id,period:now.toISOString().slice(0,7),rentAmount:1000,variableAmount:0,dueDate:now.toISOString().slice(0,7)+'-01'});
 f.db.createBillingPayment({invoiceId:invoice.id,amount:250,paidAt:now.toISOString().slice(0,7)+'-02',method:'bank_transfer'});
 let agenda=getAgenda(f.db,f.manager,{days:30},now);assert.ok(agenda.items.every(x=>x.propertyId===f.property.id));assert.equal(agenda.items.find(x=>x.kind==='payment').amount,750);assert.equal(agenda.items.find(x=>x.kind==='payment').overdue,true);assert.equal(agenda.counts.lease,1);
 assert.throws(()=>getAgenda(f.db,f.worker,{},now),e=>e.status===403);assert.throws(()=>getAgenda(f.db,f.manager,{propertyId:f.other.id},now),e=>e.status===403);
 assert.equal(getAgenda(f.db,{...f.manager,property_id:null},{},now).items.length,0);
 const dto={status:'contacted',note:'Обсудить новый срок',version:0};const result=updateRenewal(f.db,f.manager,f.lease.id,dto);assert.equal(result.version,1);assert.throws(()=>updateRenewal(f.db,f.manager,f.lease.id,dto),e=>e.status===409);assert.throws(()=>updateRenewal(f.db,f.manager,f.otherLease.id,dto),e=>e.status===403);
 assert.equal(getAgenda(f.db,f.manager,{days:30},now).items.find(x=>x.kind==='lease').renewal.note,dto.note);assert.ok(f.db.data.audit_log.some(x=>x.action==='lease_renewal_updated'));
 const reloaded=new WarehouseDatabase(f.db.data);assert.equal(reloaded.data.lease_followups[0].version,1);
 f.db.createBillingPayment({invoiceId:invoice.id,amount:750,paidAt:now.toISOString().slice(0,7)+'-03',method:'bank_transfer'});assert.equal(getAgenda(f.db,f.manager,{days:30},now).counts.payment,0);
 const ics=agendaIcs({...agenda,items:[{...agenda.items[0],title:'Осмотр, этаж; 1\nНе событие\r\nBEGIN:VEVENT '+('Я'.repeat(100))}]},now);
 assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));assert.equal(ics.match(/\r\nBEGIN:VEVENT\r\n/g).length,1);assert.ok(ics.split('\r\n').every(line=>Buffer.byteLength(line)<=75));assert.ok(ics.includes('SUMMARY:Осмотр\\, этаж\\; 1\\n'));
});

test('Configured Redis must be reachable',()=>{
 assert.throws(()=>new RedisTtlStore('test','redis://invalid','/does-not-exist'));
 assert.throws(()=>new RedisTtlStore('test','','redis-cli'),/required/);
});
