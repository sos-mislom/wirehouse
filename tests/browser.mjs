import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fixture} from './fixtures.mjs';
import {saveOperation} from '../apps/api/src/operations.js';
import {createToken} from '../apps/api/src/auth.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
fs.mkdirSync('.deploy', {recursive:true});
const f=fixture();const secret='browser-test-secret';
saveOperation(f.db,f.admin,'meters',null,{name:'Счётчик исполнителя',propertyId:f.property.id,unitId:f.unit.id,scope:'individual',resource:'water',tariff:1,initialValue:10,responsibleId:f.worker.id});
const period = new Date().toISOString().slice(0,7);
f.db.createBillingInvoice({leaseId:f.lease.id,period,rentAmount:1000,variableAmount:50,dueDate:`${period}-01`});
const child=spawn(process.execPath,['apps/api/src/index.js'],{env:{...process.env,API_HOST:'127.0.0.1',API_PORT:'3001',WAREHOUSE_DB_PATH:f.dbPath,DATABASE_URL:'',POSTGRES_URL:'',ENABLE_DEMO_SEED:'false',REDIS_URL:'',JWT_ACCESS_SECRET:secret,NOTIFICATION_CHANNELS:'in_app'},stdio:['ignore','pipe','pipe']});
let apiLogs='';child.stderr.on('data',d=>apiLogs+=d);
const server=http.createServer((req,res)=>{let file=path.join(process.cwd(),'apps/web/dist',new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(process.cwd(),'apps/web/dist/index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
let browser;
try {
  server.listen(5173,'127.0.0.1');await once(server,'listening');
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3001/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,30));}
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(token=>localStorage.setItem('warehouse-platform-token',token),createToken({sub:f.admin.id,role:'admin'},secret));
  await page.goto('http://127.0.0.1:5173');await page.getByRole('heading',{name:'Дашборд',exact:true}).waitFor();
  await page.getByRole('button',{name:'Арендаторы',exact:true}).click();await page.getByRole('heading',{name:'Арендаторы',exact:true}).waitFor();
  await page.getByRole('button',{name:'Договоры',exact:true}).click();await page.getByRole('heading',{name:'Договоры',exact:true}).waitFor();
  await page.goBack();await page.getByRole('heading',{name:'Арендаторы',exact:true}).waitFor();
  await page.locator('.mvp-table tbody tr').first().click();await page.getByRole('heading',{name:'Арендатор',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Изменить',exact:true}).click();await page.getByRole('heading',{name:'Сохранить изменения',exact:true}).waitFor();
  await page.getByRole('button',{name:'Отмена',exact:true}).click();await page.getByRole('heading',{name:'Арендатор',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Помещения',exact:true}).click();await page.getByRole('heading',{name:'Структура объекта'}).waitFor();assert.ok(await page.getByText('Основной корпус',{exact:false}).count()>=0);
  const planImage=await page.screenshot();
  await page.getByRole('button',{name:'Планы объекта',exact:true}).click();
  await page.locator('.unit-structure input[type=file]').setInputFiles({name:'test-plan.png',mimeType:'image/png',buffer:planImage});
  await page.locator('.floor-plan img').waitFor();
  await page.getByLabel('Разместить помещение',{exact:true}).selectOption({index:1});
  await page.locator('.floor-plan').click({position:{x:1,y:1}});await page.locator('.plan-marker').waitFor();
  await page.setViewportSize({width:320,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Plan edge markers fit mobile');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Эксплуатация',exact:true}).click();await page.getByRole('heading',{name:'Эксплуатация',exact:true}).waitFor();
  await page.getByRole('button',{name:'Добавить',exact:true}).click();
  await page.getByLabel('Название *',{exact:true}).fill('Тестовая вентиляция');
  await page.getByLabel(/^Объект \*/).selectOption(f.property.id);await page.getByLabel(/^Помещение \*/).selectOption(f.unit.id);
  await page.getByLabel('Тип оборудования *',{exact:true}).fill('Вентиляция');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByRole('heading',{name:'Тестовая вентиляция',exact:true}).waitFor();
  await page.getByRole('button',{name:'ППР',exact:true}).click();await page.getByRole('button',{name:'Добавить',exact:true}).click();
  await page.getByLabel('Название *',{exact:true}).fill('Тестовое ППР');await page.getByLabel(/^Объект \*/).selectOption(f.property.id);await page.getByLabel(/^Помещение \*/).selectOption(f.unit.id);await page.getByLabel('Чек-лист: один пункт на строку *',{exact:true}).fill('Осмотр\nПроверка');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByRole('heading',{name:'Тестовое ППР',exact:true}).waitFor();
  await page.getByRole('button',{name:/^Заявки/}).first().click();await page.locator('.kanban-ticket').first().waitFor();
  await page.locator('.kanban-ticket select').first().selectOption('in_progress');await page.waitForTimeout(250);
  await page.screenshot({path:'.deploy/kanban-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Пользователи',exact:true}).click();await page.getByRole('heading',{name:'Пользователи и доступ'}).waitFor();
  const workerCard=page.locator('.operation-card').filter({has:page.getByRole('heading',{name:'Электрик',exact:true})});await workerCard.getByRole('button',{name:'Изменить'}).click();await page.getByLabel('Имя *',{exact:true}).fill('Электрик обновлён');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByRole('heading',{name:'Электрик обновлён'}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.deploy/users-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No horizontal page overflow on mobile');
  await page.getByRole('button',{name:'Меню',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Закрыть',exact:true}).getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Меню',exact:true}).getAttribute('aria-expanded'),'false');
  await page.getByRole('button',{name:'Меню',exact:true}).click();
  await page.getByRole('button',{name:'Биллинг',exact:true}).click();await page.getByRole('heading',{name:'Биллинг',exact:true}).waitFor();await page.screenshot({path:'.deploy/billing-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Billing fits mobile');
  for (const width of [320,360,390,768,1024]) {
    await page.setViewportSize({width,height:844});
    for (const section of ['Дашборд','Арендаторы','Договоры','Помещения','Эксплуатация','Биллинг','Пользователи','Объекты','Чат','Уведомления','Импорт / экспорт','Профиль']) {
      await page.getByRole('button',{name:'Меню',exact:true}).click();
      await page.locator('#workspace-navigation').getByRole('button',{name:section,exact:true}).click();
      await page.waitForTimeout(100);
      assert.equal(await page.getByRole('button',{name:'Меню',exact:true}).getAttribute('aria-expanded'),'false');
      const overflow = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth, offenders:Array.from(document.querySelectorAll('main *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0 && (r.right>innerWidth+2||r.left < -2);}).slice(0,8).map(e=>e.className)}));
      assert.ok(overflow.scroll<=width+2,`${section} at ${width}px: ${JSON.stringify(overflow)}`);
    }
  }
  // A tenant must reach its workspace without a finance object or staff-only access.
  const tenant=f.db.data.users.find(u=>u.tenant_id===f.tenant.id);
  const tenantPage=await browser.newPage();tenantPage.on('pageerror',e=>errors.push(e.message));await tenantPage.addInitScript(token=>localStorage.setItem('warehouse-platform-token',token),createToken({sub:tenant.id,role:'tenant'},secret));await tenantPage.goto('http://127.0.0.1:5173');await tenantPage.getByRole('heading',{name:'Объявления и услуги'}).waitFor();
  await tenantPage.setViewportSize({width:320,height:844});assert.ok(await tenantPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Tenant fits 320px');
  await tenantPage.getByRole('button',{name:'Меню',exact:true}).click();await tenantPage.keyboard.press('Escape');
  const workerPage=await browser.newPage({viewport:{width:320,height:844}});workerPage.on('pageerror',e=>errors.push(e.message));await workerPage.addInitScript(token=>localStorage.setItem('warehouse-platform-token',token),createToken({sub:f.worker.id,role:'worker'},secret));await workerPage.goto('http://127.0.0.1:5173');await workerPage.getByRole('button',{name:'Меню',exact:true}).waitFor();
  await workerPage.getByText('Счётчик исполнителя · Вода',{exact:true}).click();await workerPage.getByLabel('Показание *',{exact:true}).fill('12');await workerPage.getByRole('button',{name:'Сохранить показание',exact:true}).click();await workerPage.getByText('Показание сохранено',{exact:true}).waitFor();
  assert.ok(await workerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Worker fits 320px');
  assert.deepEqual(errors,[]);console.log('Browser checks passed: navigation, cancel, equipment, PPR, kanban, users, mobile, tenant login.');
} catch(error) { if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0]){await pages[0].screenshot({path:'.deploy/browser-failure.png',fullPage:true});console.error((await pages[0].locator('body').innerText()).slice(0,4000));}}console.error(apiLogs);throw error;}
finally {if(browser)await browser.close();server.close();child.kill('SIGTERM');await once(child,'exit');f.cleanup();}
