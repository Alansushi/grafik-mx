// Ejecutar sólo contra `supabase start` en /private/tmp/grafik-admin-test y `next dev -p 3001`.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const status = spawnSync('supabase',['status','--workdir','/private/tmp/grafik-admin-test','--output','json'],{encoding:'utf8'});
if (status.status !== 0) throw new Error('Local Supabase is not running');
const config = JSON.parse(status.stdout);
const base = 'http://localhost:3001';
const sb = createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon = createClient(config.API_URL,config.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const suffix = randomUUID().slice(0,8);
const email = `owner-${suffix}@example.test`;
const outsiderEmail = `outsider-${suffix}@example.test`;
const password = `LocalTest!${randomUUID()}`;
function db(sql) {
  const result=spawnSync('supabase',['db','query','--local','--workdir','/private/tmp/grafik-admin-test',sql],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr || result.stdout);
}

function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits=0,value=0,bytes=[];
  for(const char of secret.replace(/=+$/,'').toUpperCase()) {
    value=(value<<5)|alphabet.indexOf(char);bits+=5;
    if(bits>=8){bits-=8;bytes.push((value>>bits)&255);}
  }
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
  const offset=digest[19]&15;
  return (((digest.readUInt32BE(offset)&0x7fffffff)%1000000)).toString().padStart(6,'0');
}

function staleCookie(raw) {
  const line=readFileSync('.env.local','utf8').split('\n').findLast(x=>x.startsWith('ADMIN_SESSION_SECRET='));
  const key=Buffer.from(line.slice('ADMIN_SESSION_SECRET='.length),'hex');
  const buf=Buffer.from(raw,'base64url');
  const decipher=createDecipheriv('aes-256-gcm',key,buf.subarray(0,12));
  decipher.setAuthTag(buf.subarray(12,28));
  const payload=JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)),decipher.final()]).toString());
  payload.touched=Date.now()-31*60*1000;
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}

async function loginAndMfa(page, userEmail) {
  await page.goto(base+'/');
  await page.waitForURL('**/login');
  assert.equal(await page.getByText('Resumen de ventas').count(),0);
  await page.getByLabel('Correo').fill(userEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button',{name:'Continuar'}).click();
  await page.waitForURL('**/mfa');
  assert.equal(await page.getByText('Resumen de ventas').count(),0);
  const secret=await page.locator('.secret code').textContent();
  assert.ok(secret);
  const qr=page.locator('img.qr');
  await qr.waitFor({state:'visible'});
  assert.ok(await qr.evaluate(img=>img.complete && img.naturalWidth>0),'TOTP QR did not render');
  await page.getByLabel('Código de 6 dígitos').fill(totp(secret));
  await page.getByRole('button',{name:'Verificar y entrar'}).click();
}

let browser;
const users=[];
try {
  for(const userEmail of [email,outsiderEmail]) {
    const result=await sb.auth.admin.createUser({email:userEmail,password,email_confirm:true});
    if(result.error)throw result.error;
    users.push(result.data.user.id);
  }
  db(`insert into public.admin_users(user_id,email) values ('${users[0]}','${email}')`);
  const key=randomUUID();
  const folio='GQ-'+key.replaceAll('-','').slice(0,16).toUpperCase();
  const quote=await sb.from('quote_intents').insert({client_key:key,channel:'contacto',status:'completed',
    email:'buyer@example.test',name:'Comprador Prueba',utm_source:'google',utm_campaign:'noviembre',completed_at:new Date().toISOString()});
  if(quote.error)throw quote.error;

  const noAuth=await anon.from('quote_intents').select('id');
  assert.ok(noAuth.error || noAuth.data.length===0,'anonymous user read PII');
  browser=await chromium.launch({headless:true});
  const owner=await browser.newContext();
  const page=await owner.newPage();
  await loginAndMfa(page,email);
  await page.waitForURL(base+'/');
  assert.ok(await page.getByText('Resumen de ventas').isVisible());
  await page.getByRole('link',{name:'Oportunidades'}).click();
  await page.getByRole('link',{name:folio}).click();
  await page.getByText('Comprador Prueba').waitFor({state:'visible'});
  await page.getByLabel('Estado').selectOption('ganada');
  await page.getByLabel('Importe cobrado (MXN, sólo para ganada)').fill('1500');
  await page.getByRole('button',{name:'Guardar cambios'}).click();
  await page.getByRole('link',{name:'Campañas'}).click();
  await page.getByLabel('Mes').fill('2026-11');
  await page.getByLabel('Origen UTM').fill('google');
  await page.getByLabel('Campaña UTM').fill('noviembre');
  await page.getByLabel('Gasto MXN').fill('500');
  await page.getByRole('button',{name:'Guardar gasto'}).click();
  await page.getByText('$500.00').first().waitFor({state:'visible'});
  await page.getByRole('link',{name:'Resumen'}).click();
  await page.getByText('$1,500.00').first().waitFor({state:'visible'});
  await page.getByText('3.00×').waitFor({state:'visible'});

  const outsider=await browser.newContext();
  const outsiderPage=await outsider.newPage();
  await loginAndMfa(outsiderPage,outsiderEmail);
  await outsiderPage.waitForURL('**/sin-acceso');
  assert.equal(await outsiderPage.getByText('Comprador Prueba').count(),0);

  db(`delete from public.admin_users where user_id='${users[0]}'`);
  await page.goto(base+'/');
  await page.waitForURL('**/sin-acceso');
  const cookie=(await owner.cookies()).find(x=>x.name==='grafik_admin_session');
  assert.ok(cookie);
  await owner.addCookies([{...cookie,value:staleCookie(cookie.value)}]);
  await page.goto(base+'/');
  await page.waitForURL('**/login');
  console.log('Local E2E passed: anonymous, AAL1, admin AAL2, sales, campaigns, outsider, revocation, idle expiry');
} finally {
  await browser?.close();
  for(const id of users)await sb.auth.admin.deleteUser(id).catch(()=>{});
}
