// Exercise the production restock/undo functions and SQL against disposable
// PostgreSQL-compatible PGlite. No hosted database connection is used.
require('ts-node').register({ transpileOnly: true, project: require('node:path').resolve(__dirname, '../tsconfig.json'), compilerOptions: { module: 'commonjs' } });
const { ProductsService } = require('../src/modules/products/products.service');
const { undoRestockBatch, latestRestockBatch } = require('../src/modules/products/restock-batches');
const { Prisma } = require('@prisma/client');
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const mapped = row => row && Object.fromEntries(Object.entries(row).map(([k,v]) => [camel(k),v]));
function adapter(db) {
  async function insert(table, data) {
    const row = { id: randomUUID(), ...data };
    const keys = Object.keys(row);
    const result = await db.query(`INSERT INTO ${table} (${keys.map(k => `"${snake(k)}"`).join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`, Object.values(row));
    return mapped(result.rows[0]);
  }
  return {
    $queryRaw: async (strings, ...values) => {
      const query = Array.isArray(strings) ? Prisma.sql(strings, ...values) : strings;
      return (await db.query(query.text, query.values)).rows;
    },
    $transaction: fn => db.transaction(tx => fn(adapter(tx))),
    product: { findMany: async () => (await db.query('SELECT id,name FROM products WHERE deleted_at IS NULL')).rows },
    branch: { findMany: async () => (await db.query('SELECT id,name FROM branches WHERE deleted_at IS NULL')).rows },
    restockBatch: {
      create: ({data}) => insert('restock_batches',data),
      findFirst: async ({select} = {}) => {
        const row=mapped((await db.query('SELECT * FROM restock_batches ORDER BY seq DESC LIMIT 1')).rows[0]);
        if(!row) return null;
        if(select) {
          const user=(await db.query('SELECT first_name,last_name FROM users WHERE id=$1',[row.createdById])).rows[0];
          return { id:row.id,createdAt:row.createdAt,undoneAt:row.undoneAt,entryCount:row.entryCount,productCount:row.productCount,branchCount:row.branchCount,totalQuantity:row.totalQuantity,createdBy:mapped(user)??null };
        }
        return row;
      },
      update: async ({where,data}) => db.query('UPDATE restock_batches SET undone_at=$1,undone_by_id=$2 WHERE id=$3',[data.undoneAt,data.undoneById,where.id]),
    },
    inventory: {
      createMany: async ({data}) => { for(const d of data) await db.query('INSERT INTO inventory(id,product_id,branch_id,quantity,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(product_id,branch_id) DO NOTHING',[randomUUID(),d.productId,d.branchId,d.quantity]); },
      updateMany: async ({where,data}) => {
        const result=await db.query('UPDATE inventory SET quantity=quantity-$1,updated_at=now() WHERE product_id=$2 AND branch_id=$3 AND quantity=$4 RETURNING id',[data.quantity.decrement,where.productId,where.branchId,where.quantity]);
        return {count:result.rows.length};
      },
    },
    stockMovement: {
      createManyAndReturn: async ({data}) => {const result=[]; for(const d of data) result.push(await insert('stock_movements',d)); return result;},
      createMany: async ({data}) => {for(const d of data)await insert('stock_movements',d);},
    },
    auditLog: { create: ({data}) => insert('audit_logs', {...data,newValues:JSON.stringify(data.newValues)}) },
  };
}
(async()=>{
 const db=new PGlite();
 try {
  const dir=resolve(__dirname,'../prisma/migrations');
  for(const name of readdirSync(dir).sort()) {
    if(name.includes('.') || !/^\d/.test(name) || name==='20261127000000_restock_batches')continue;
    await db.exec(readFileSync(resolve(dir,name,'migration.sql'),'utf8'));
  }
  const owner=randomUUID(),admin=randomUUID(),role=randomUUID(),brand=randomUUID(),branch=randomUUID(),branch2=randomUUID(),p1=randomUUID(),p2=randomUUID();
  await db.query('INSERT INTO roles(id,name,updated_at) VALUES($1,$2,now())',[role,'Owner']);
  for(const id of [owner,admin])await db.query('INSERT INTO users(id,email,password_hash,first_name,last_name,role_id,updated_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,id+'@example.invalid','fixture','Test','User',role]);
  await db.query('INSERT INTO brands(id,name,slug,updated_at) VALUES($1,$2,$3,now())',[brand,'Brand','brand']);
  await db.query('INSERT INTO branches(id,name,updated_at) VALUES($1,$2,now())',[branch,'Branch']);
  await db.query('INSERT INTO branches(id,name,updated_at) VALUES($1,$2,now())',[branch2,'Branch Two']);
  for(const [id,name] of [[p1,'Device'],[p2,'Battery']])await db.query('INSERT INTO products(id,name,slug,brand_id,selling_price,cost_price,updated_at) VALUES($1,$2,$2,$3,250,100,now())',[id,name,brand]);
  // Older restocks remain in history and cannot be mistaken for a tracked batch.
  await db.query('INSERT INTO inventory(id,product_id,branch_id,quantity,updated_at) VALUES($1,$2,$3,10,now())',[randomUUID(),p1,branch]);
  const oldMovement=randomUUID();
  await db.query('INSERT INTO stock_movements(id,product_id,branch_id,user_id,type,quantity_change,quantity_after) VALUES($1,$2,$3,$4,$5,10,10)',[oldMovement,p1,branch,owner,'RESTOCK']);
  // Upgrade an existing database: quantities and old ledger rows must survive.
  await db.exec(readFileSync(resolve(dir,'20261127000000_restock_batches/migration.sql'),'utf8'));
  assert.equal((await db.query('SELECT quantity FROM inventory WHERE product_id=$1 AND branch_id=$2',[p1,branch])).rows[0].quantity,10);
  assert.equal((await db.query('SELECT restock_batch_id FROM stock_movements WHERE id=$1',[oldMovement])).rows[0].restock_batch_id,null);
  const prisma=adapter(db),service=new ProductsService(prisma,{uploadDataUrl:async v=>v});
  const items=[{productId:p1,branchId:branch,quantity:2},{productId:p1,branchId:branch,quantity:3},{productId:p2,branchId:branch,quantity:7},{productId:p1,branchId:branch2,quantity:3}];
  const quantities=async()=> (await db.query('SELECT product_id,branch_id,quantity FROM inventory ORDER BY product_id,branch_id')).rows;
  const snapshot=async()=>JSON.stringify({stock:await quantities(),movements:(await db.query('SELECT * FROM stock_movements ORDER BY seq')).rows,batches:(await db.query('SELECT * FROM restock_batches ORDER BY seq')).rows});
  assert.equal(await latestRestockBatch(prisma),null);
  const first=await service.restock(items,owner);
  const meta=await latestRestockBatch(prisma);
  assert.equal(meta.id,first.batchId); assert.equal(meta.entryCount,3); assert.equal(meta.branchCount,2); assert.equal(meta.totalQuantity,15);
  assert.ok(!JSON.stringify(meta).includes('cost'));
  await undoRestockBatch(prisma,first.batchId,admin);
  assert.deepEqual((await quantities()).map(r=>r.quantity).sort((a,b)=>a-b),[0,0,10]);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM stock_movements WHERE id=$1',[oldMovement])).rows[0].count,1);
  const undoneState=await snapshot();
  await assert.rejects(undoRestockBatch(prisma,first.batchId,owner),/already been undone/);
  assert.equal(await snapshot(),undoneState);
  const second=await service.restock(items,owner);
  // One later sale blocks undo of BOTH entries.
  await db.query('UPDATE inventory SET quantity=quantity-1 WHERE product_id=$1',[p2]);
  await db.query('INSERT INTO stock_movements(id,product_id,branch_id,user_id,type,quantity_change,quantity_after) VALUES($1,$2,$3,$4,$5,-1,6)',[randomUUID(),p2,branch,owner,'SALE']);
  let before=await snapshot();
  await assert.rejects(undoRestockBatch(prisma,second.batchId,admin),/Nothing was undone/);
  assert.equal(await snapshot(),before);
  // Matching numeric stock after a return still has later activity.
  await db.query('UPDATE inventory SET quantity=quantity+1 WHERE product_id=$1',[p2]);
  await db.query('INSERT INTO stock_movements(id,product_id,branch_id,user_id,type,quantity_change,quantity_after) VALUES($1,$2,$3,$4,$5,1,7)',[randomUUID(),p2,branch,owner,'RETURN']);
  before=await snapshot();
  await assert.rejects(undoRestockBatch(prisma,second.batchId,owner),/Nothing was undone/);
  assert.equal(await snapshot(),before);
  const third=await service.restock(items,owner);
  await assert.rejects(undoRestockBatch(prisma,second.batchId,owner),/latest restock changed/);
  await db.query('UPDATE products SET deleted_at=now() WHERE id=$1',[p2]);
  before=await snapshot();
  await assert.rejects(undoRestockBatch(prisma,third.batchId,owner),/archived/);
  assert.equal(await snapshot(),before);
  await db.query('UPDATE products SET deleted_at=NULL WHERE id=$1',[p2]);
  // Simulate a failure late in the transaction: all stock/history must roll back.
  const failing={...prisma,$transaction:fn=>db.transaction(tx=>{
    const a=adapter(tx);a.auditLog.create=async()=>{throw Error('injected audit failure');};return fn(a);
  })};
  before=await snapshot();
  await assert.rejects(undoRestockBatch(failing,third.batchId,admin),/injected/);
  assert.equal(await snapshot(),before);
  const attempts=await Promise.allSettled([
    undoRestockBatch(prisma,third.batchId,admin), undoRestockBatch(prisma,third.batchId,owner),
  ]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
  assert.equal((await latestRestockBatch(prisma)).undoneAt!==null,true);
  assert.deepEqual((await quantities()).map(r=>r.quantity).sort((a,b)=>a-b),[3,7,15]);
  console.log('PASS: production restock/undo SQL, full migrations, persistent metadata, exact stock, latest-only, duplicate refusal, sale/return conflict, archive conflict and full rollback after late failure.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
