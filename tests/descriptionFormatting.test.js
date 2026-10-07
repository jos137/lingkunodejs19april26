const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cleanHtml}=require('../utils/sanitize');
test('published descriptions retain formatting on bold, paragraph and nested text',()=>{
 for(const tag of ['b','strong','i','em','u','p','div','span','li']) {
  const html=cleanHtml(`<${tag} style="color: rgb(255, 38, 0);font-family: Georgia;font-size: 24px">BONUS</${tag}>`);
  assert(html.includes('color:rgb(255, 38, 0)'));
  assert(html.includes('font-family:Georgia'));
  assert(html.includes('font-size:24px'));
 }
 assert(cleanHtml('<b style="color:#ff2600"><span>Bonus 1</span></b>').includes('color:#ff2600'));
});
test('formatting support still strips executable HTML and layout injection',()=>{
 const html=cleanHtml('<b onclick="alert(1)" style="color:#ff2600;position:fixed;background-image:url(https://example.com/x)">Bonus</b><script>alert(1)</script><a href="javascript:alert(1)">Link</a>');
 assert(html.includes('color:#ff2600'));
 for(const forbidden of ['onclick','<script','javascript:','position','background-image']) assert(!html.includes(forbidden));
});

test('horizontal divider survives publication without unsafe attributes',()=>{
 assert.equal(cleanHtml('<p>Bagian satu</p><hr onclick="alert(1)"><p>Bagian dua</p>'),'<p>Bagian satu</p><hr /><p>Bagian dua</p>');
});
