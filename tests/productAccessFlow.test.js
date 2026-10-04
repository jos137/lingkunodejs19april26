const {test} = require('node:test');
const assert = require('node:assert/strict');
const db = {execute:async()=>[[]]};
require.cache[require.resolve('../config/db')]={id:require.resolve('../config/db'),filename:require.resolve('../config/db'),loaded:true,exports:db};
const admin = require('../controllers/adminController');
const builder = require('../controllers/builderController');
const {getAccessLinks} = require('../utils/productAccess');
const body={access_links_present:'1',access_link_name:['Group','Materials'],access_link_url:['https://example.com/group','https://example.com/materials']};
function response(){return {code:200,status(code){this.code=code;return this;},send(value){this.sent=value;},redirect(url){this.url=url;},render(view,data){this.view=view;this.data=data;}};}
test('create and update persist every access link, including missing-column migration',async()=>{
 for(const operation of ['createProductPost','updateProduct']){
  const calls=[];let missing=true;
  db.execute=async(sql,params)=>{calls.push({sql,params});if(/^(UPDATE products SET|INSERT INTO products)/.test(sql)&&missing){missing=false;throw new Error("Unknown column 'access_links'");}return [[]];};
  const res=response();
  await admin[operation]({body,params:{id:97},session:{userId:1}},res);
  assert.equal(res.url,'/admin/products');
  const writes=calls.filter(call=>/^(UPDATE products SET|INSERT INTO products)/.test(call.sql));
  assert.equal(writes.length,2);
  assert(writes[1].sql.includes('access_links'));
  const saved=writes[1].params.find(value=>typeof value==='string'&&value.startsWith('[{'));
  assert.equal(getAccessLinks({access_links:saved}).length,2);
  assert(calls.some(call=>call.sql==='ALTER TABLE products ADD access_links TEXT'));
 }
});
test('paid multi-link access renders choices; single legacy link redirects; unpaid is blocked',async()=>{
 for(const product of [
  {order_status:'completed',access_links:JSON.stringify([{name:'Group',url:body.access_link_url[0]},{name:'Materials',url:body.access_link_url[1]}])},
  {order_status:'completed',download_url:body.access_link_url[0]},
  {order_status:'pending',download_url:body.access_link_url[0]}
 ]){
  db.execute=async(sql)=>sql.includes('SELECT p.*')?[[product]]:[[]];
  const res=response();await builder.handleAccessLink({params:{orderId:123}},res);
  if(product.order_status==='pending'){assert.equal(res.code,403);assert.equal(res.url,undefined);}
  else if(product.access_links){assert.equal(res.view,'product-access');assert.equal(res.data.links.length,2);}
  else assert.equal(res.url,body.access_link_url[0]);
 }
});
