import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const root=process.cwd();
const env={};
for(const line of fs.readFileSync(path.join(root,'.env.test.local'),'utf8').split(/\r?\n/)){if(!line||line.trim().startsWith('#')||!line.includes('='))continue;const i=line.indexOf('=');env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}
const base=process.env.VERIBRAND_URL||'http://localhost:3000';
const db=new DatabaseSync(path.join(root,'data','veribrand.db'));
const suffix=Date.now().toString(36);
let ruleId=null;
let evidenceId=null;
let evidencePath=null;
async function login(email,password){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});if(!r.ok)throw new Error('Login failed: '+r.status);const cookie=(r.headers.get('set-cookie')||'').match(/veribrand_session=([^;]+)/)?.[1];if(!cookie)throw new Error('Missing session cookie');return 'veribrand_session='+cookie;}
try{
 const admin=await login(env.VERIBRAND_TEST_ADMIN_EMAIL,env.VERIBRAND_TEST_ADMIN_PASSWORD);
 const creator=await login(env.VERIBRAND_TEST_CREATOR_EMAIL,env.VERIBRAND_TEST_CREATOR_PASSWORD);
 const reviewer=await login(env.VERIBRAND_TEST_REVIEWER_EMAIL,env.VERIBRAND_TEST_REVIEWER_PASSWORD);
 const created=await fetch(base+'/api/vault',{method:'POST',headers:{Cookie:admin,'Content-Type':'application/json'},body:JSON.stringify({title:'Temporary test rule '+suffix,description:'Temporary integration test rule.',category:'terminology',severity:'warning',authorityLevel:2,forbiddenPatterns:['guaranteed forever '+suffix],approvedAlternative:'supported with documented evidence',citation:'Automated test fixture'})});
 const payload=await created.json();if(created.status!==201)throw new Error('Admin rule creation failed: '+created.status+' '+JSON.stringify(payload));ruleId=payload.rule.id;
 const audit=await fetch(base+'/api/audit',{method:'POST',headers:{Cookie:creator,'Content-Type':'application/json'},body:JSON.stringify({text:'Our product is guaranteed forever '+suffix+'.',channel:'enterprise_web'})});
 const result=await audit.json();if(!audit.ok||!result.findings.some(f=>f.ruleId===ruleId&&f.verdict==='SUGGESTION'))throw new Error('Persisted custom rule did not affect authoritative audit.');
 const evidenceDir = fs.existsSync(path.join(root, 'data', 'evidence', 'ORG-DEFAULT'))
   ? path.join(root, 'data', 'evidence', 'ORG-DEFAULT')
   : path.join(root, 'data', 'evidence');
 const existingFiles = new Set(fs.readdirSync(evidenceDir));
 const form=new FormData();form.set('file',new File(['Monthly active users: 1,200.'], 'monthly-active-users.txt',{type:'text/plain'}));form.set('metricId','monthly active users');form.set('sectionCitation','Monthly KPI report, page 2');
 const upload=await fetch(base+'/api/evidence',{method:'POST',headers:{Cookie:creator},body:form});const uploaded=await upload.json();if(upload.status!==201)throw new Error('Evidence upload failed: '+upload.status);evidenceId=uploaded.evidence.id;
 evidencePath=fs.readdirSync(evidenceDir).filter(name=>!existingFiles.has(name)).map(name=>path.join(evidenceDir,name))[0]||null;
 if(!evidencePath)throw new Error('Uploaded evidence fixture file could not be located for integrity test.');
 const review=await fetch(base+'/api/evidence/'+encodeURIComponent(evidenceId),{method:'PATCH',headers:{Cookie:reviewer,'Content-Type':'application/json'},body:JSON.stringify({status:'verified',approvedValue:'1,200 users',notes:'Temporary fixture reviewed against source.'})});if(!review.ok)throw new Error('Evidence fact approval failed: '+review.status);
 const good=await fetch(base+'/api/audit',{method:'POST',headers:{Cookie:creator,'Content-Type':'application/json'},body:JSON.stringify({text:'Our monthly active users reached 1,200 users.',channel:'enterprise_web'})});const goodResult=await good.json();if(!good.ok||!goodResult.findings.some(f=>f.category==='claim_verification'&&f.verdict==='VERIFIED'&&f.evidence?.metricId==='monthly active users')||goodResult.findings.some(f=>f.category==='claim_verification'&&f.verdict==='UNVERIFIED'&&f.matchedText.includes('1,200')))throw new Error('Custom evidence-backed fact did not verify cleanly.');
 const bad=await fetch(base+'/api/audit',{method:'POST',headers:{Cookie:creator,'Content-Type':'application/json'},body:JSON.stringify({text:'Our monthly active users reached 1,500 users.',channel:'enterprise_web'})});const badResult=await bad.json();if(!bad.ok||!badResult.findings.some(f=>f.category==='claim_verification'&&f.verdict==='CONFLICT'))throw new Error('Custom fact mismatch did not conflict.');
 const analytics=await fetch(base+'/api/analytics/ambiguity',{headers:{Cookie:reviewer}});
 const stats=await analytics.json();if(!analytics.ok||!Array.isArray(stats.metrics)||typeof stats.sampleSize!=='number')throw new Error('Persisted review analytics endpoint failed.');
 console.log('PASS: admin-configured rule persisted and affected server-authoritative audit.');
 console.log('PASS: manually approved custom evidence fact verified matching claims and conflicted mismatches.');
 console.log('PASS: reviewer analytics returned database-derived metrics and sample size.');
}finally{
 if(evidencePath&&fs.existsSync(evidencePath))fs.unlinkSync(evidencePath);
 if(evidenceId){db.prepare('DELETE FROM evidence_documents WHERE id = ?').run(evidenceId);db.prepare("DELETE FROM audit_trail WHERE details_json LIKE ?").run('%'+evidenceId+'%');}
 if(ruleId){db.prepare('DELETE FROM brand_rules WHERE id = ?').run(ruleId);db.prepare("DELETE FROM audit_trail WHERE details_json LIKE ?").run('%'+ruleId+'%');}
 db.close();console.log('PASS: temporary custom rule, evidence fact and audit rows cleaned.' );
}
