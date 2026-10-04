const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const fs = require('fs');
const {accessUpdates,getAccessLinks} = require('../utils/productAccess');
const fields = {access_links_present:'1',access_link_name:['Telegram','Materi'],access_link_url:['https://t.me/example','https://example.com/material']};
test('multiple links round trip and keep legacy URL fields synchronized',()=>{
 const saved = accessUpdates(fields);
 assert.equal(getAccessLinks(saved).length,2);
 assert.equal(saved.download_url,'https://t.me/example');
 assert.equal(saved.access_link,saved.download_url);
 assert.equal(getAccessLinks(saved)[1].name,'Materi');
});
test('legacy link, empty rows, removal and unnamed link',()=>{
 assert.deepEqual(getAccessLinks(accessUpdates({access_links_present:'1'})),[]);
 assert.deepEqual(getAccessLinks(accessUpdates({access_links_present:'1',access_link_name:'',access_link_url:''})),[]);
 assert.equal(getAccessLinks({download_url:'https://example.com/old'})[0].url,'https://example.com/old');
 assert.equal(getAccessLinks(accessUpdates({access_links_present:'1',access_link_url:'https://example.com'}))[0].name,'Akses Produk');
});
test('invalid URLs, incomplete rows and excessive link counts are rejected',()=>{
 for (const url of ['javascript:alert(1)','data:text/html,x','invalid','']) assert.throws(()=>accessUpdates({access_links_present:'1',access_link_name:'Materi',access_link_url:url}));
 assert.throws(()=>accessUpdates({...fields,access_link_url:Array(21).fill('https://example.com')}));
});
test('editor and buyer templates render and escape values',()=>{
 const saved=accessUpdates(fields);
 const html=ejs.render(fs.readFileSync('views/admin/product-edit.ejs','utf8'),{product:saved,getAccessLinks});
 assert(html.includes('Tambah Link Akses'));
 for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Function(script[1]);
 const access=ejs.render(fs.readFileSync('views/product-access.ejs','utf8'),{product:{name:'<script>'},links:getAccessLinks(saved)});
 assert(access.includes('&lt;script&gt;'));
 assert(access.includes('https://example.com/material'));
});
