import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WarehouseDatabase } from '../apps/api/src/database.js';
export function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirehouse-test-'));
  const dbPath = path.join(dir, 'db.json');
  const db = new WarehouseDatabase(dbPath);
  const property = db.createProperty({name:'Объект А',address:'Москва',warehouseClass:'A',totalArea:1000,rentableArea:900});
  const other = db.createProperty({name:'Объект Б',address:'Москва',warehouseClass:'B',totalArea:1000,rentableArea:900});
  const unit = db.createUnit({propertyId:property.id,number:'101',floor:1,area:100,type:'office',status:'vacant',building:'А',entrance:'1'});
  const otherUnit = db.createUnit({propertyId:other.id,number:'201',floor:2,area:200,type:'office',status:'vacant'});
  const admin = db.createUser({fullName:'Администратор',email:'admin@test.local',password:'test-password-123',role:'admin'});
  const manager = db.createUser({fullName:'Менеджер',email:'manager@test.local',password:'test-password-123',role:'manager',propertyId:property.id});
  const worker = db.createUser({fullName:'Электрик',email:'worker@test.local',password:'test-password-123',role:'worker',propertyId:property.id});
  const tenant = db.createTenant({name:'Арендатор',inn:'1234567890',contactName:'Иван',phone:'+79990000101',email:'tenant@test.local',riskLevel:'low'});
  const year = new Date().getFullYear();
  const lease = db.createLease({tenantId:tenant.id,unitId:unit.id,contractNumber:'A-1',stage:'active',startDate:`${year}-01-01`,endDate:`${year}-12-31`,ratePerSqm:100,deposit:0,indexationPct:0});
  const otherLease = db.createLease({tenantId:tenant.id,unitId:otherUnit.id,contractNumber:'B-1',stage:'active',startDate:`${year}-01-01`,endDate:`${year}-12-31`,ratePerSqm:100,deposit:0,indexationPct:0});
  return {db, dbPath, dir, property, other, unit, otherUnit, admin, manager, worker, tenant, lease, otherLease, cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
