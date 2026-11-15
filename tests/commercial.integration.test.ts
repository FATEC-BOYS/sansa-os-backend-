import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {PrismaClient} from '@prisma/client';
import {registerCommercialRoutes} from '../src/routes/commercial.js';
import {registerSalesRoutes} from '../src/routes/sales.js';

test('saved briefing -> estimates -> immutable proposal versions with real PostgreSQL', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
  const db=new PrismaClient({datasourceUrl:process.env.TEST_DATABASE_URL});
  const app=Fastify();registerCommercialRoutes(app,db);registerSalesRoutes(app,db);
  let id='';
  const call=async(method:'POST'|'PUT'|'GET'|'PATCH',url:string,payload?:unknown)=>app.inject({method,url,...(payload===undefined?{}:{payload:payload as object})});
  try{
    const created=await call('POST','/api/commercial/briefings',{data:{company:'Fictitious integration client'}});
    assert.equal(created.statusCode,201);id=created.json().id;
    let saved=(await call('GET','/api/commercial/briefings/'+id)).json();
    assert.ok(saved.missing.includes('objective'));assert.equal(saved.data.budget,'');
    const complete={...saved.data,objective:'Apresentar serviços',audience:'Comércios locais',deliverables:'Uma landing page responsiva',constraints:'Premissa '.repeat(100),objectiveConfirmed:true};
    const edited=await call('PUT','/api/commercial/briefings/'+id,{data:complete,expectedRevision:1});
    assert.equal(edited.statusCode,200);assert.equal(edited.json().revision,2);
    assert.equal((await call('PUT','/api/commercial/briefings/'+id,{data:complete,expectedRevision:1})).statusCode,409);
    const parameters={name:'Escopo original',parametersConfirmed:true,lines:[{discipline:'Design',minutes:120,hourlyCostCents:5000}],fixedCostCents:0,toolsCents:0,taxBps:0,riskBps:0,marginBps:2000};
    assert.equal((await call('POST',`/api/commercial/briefings/${id}/estimates`,{expectedRevision:2,parameters:{...parameters,parametersConfirmed:false}})).statusCode,400);
    const estimate=(await call('POST',`/api/commercial/briefings/${id}/estimates`,{expectedRevision:2,parameters})).json();
    assert.equal(estimate.calculation.recommendedCents,12500);
    const versionInput={estimateId:estimate.id,expectedRevision:2,priceCents:12000,commercialConfirmed:true,validity:'15 dias',timeline:'30 dias',paymentTerms:'50% no início e 50% na entrega',exclusions:'Exclusão '.repeat(100)};
    assert.equal((await call('POST',`/api/commercial/briefings/${id}/versions`,versionInput)).statusCode,400); // explicit discount approval
    assert.equal((await call('POST',`/api/commercial/briefings/${id}/versions`,{...versionInput,priceCents:9999,discountApproved:true})).statusCode,400); // below net cost
    const v1response=await call('POST',`/api/commercial/briefings/${id}/versions`,{...versionInput,discountApproved:true});
    assert.equal(v1response.statusCode,201);const v1=v1response.json();assert.equal(v1.number,1);
    assert.ok(v1.content.includes(complete.constraints.trim()));assert.ok(v1.content.includes(versionInput.exclusions.trim()));
    assert.equal((await call('PATCH','/api/sales/drafts/'+v1.approval.id,{content:'attempt to overwrite an immutable version'})).statusCode,409);
    const pdf=await call('GET','/api/commercial/versions/'+v1.id+'/pdf');
    assert.equal(pdf.statusCode,200);assert.ok(pdf.headers['content-type']?.includes('application/pdf'));assert.equal(pdf.rawPayload.subarray(0,4).toString(),'%PDF');
    const [a,b]=await Promise.all([call('POST',`/api/commercial/briefings/${id}/versions`,{...versionInput,priceCents:12500}),call('POST',`/api/commercial/briefings/${id}/versions`,{...versionInput,priceCents:13000})]);
    assert.equal(a.statusCode,201);assert.equal(b.statusCode,201);assert.deepEqual([a.json().number,b.json().number].sort(),[2,3]);
    await call('PUT','/api/commercial/briefings/'+id,{data:{...complete,deliverables:'Duas páginas responsivas'},expectedRevision:2});
    assert.equal((await call('POST',`/api/commercial/briefings/${id}/versions`,{...versionInput,expectedRevision:3,priceCents:12500})).statusCode,409);
    saved=(await call('GET','/api/commercial/briefings/'+id)).json();
    assert.equal(saved.proposals.length,3);assert.equal(saved.proposals.find((v:{id:string})=>v.id===v1.id).content,v1.content);
    assert.equal((await call('GET','/api/commercial/versions/not-found/pdf')).statusCode,404);
    // An estimate from another client's dossier must never be usable here.
    const other=await db.briefing.create({data:{data:complete}});
    try{assert.equal((await call('POST',`/api/commercial/briefings/${other.id}/versions`,{...versionInput,expectedRevision:1,priceCents:12500})).statusCode,409);}finally{await db.briefing.delete({where:{id:other.id}});}
  }finally{
    if(id){await db.approval.deleteMany({where:{proposalVersion:{briefingId:id}}});await db.proposalVersion.deleteMany({where:{briefingId:id}});await db.estimate.deleteMany({where:{briefingId:id}});await db.briefing.delete({where:{id}});}
    await app.close();await db.$disconnect();
  }
});
