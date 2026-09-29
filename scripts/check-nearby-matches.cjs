// Offline checks: no production Firebase writes, push messages or geocoder calls.
// Run from the website root: node scripts/check-nearby-matches.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, parent, ...rest);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

let checks = 0;
function check(condition, name) { assert.ok(condition, name); checks++; }
const policy = require('../src/lib/nearby-match-policy.ts');
const { getCatalogFormCategories, CATALOG_FORM_SECTIONS } = require('../src/data/catalogForm.ts');
const { exactPointFromGeocoder } = require('../src/lib/nearby-geocode-server.ts');
const group = getCatalogFormCategories('services').find(x => x.id === 'plumbing');
const publication = {
  title: 'Нужна сантехника', city: 'Город', address: 'Улица, 1',
  catalogSection: 'services', catalogCategoryId: group.id,
  category: group.category, subcategory: group.subcategories[0], moderationStatus: 'approved',
};
const request = { ...publication, customerId: 'customer', status: 'active' };
const listing = { ...publication, authorId: 'executor', address: 'Улица, 2' };
check(policy.matchingPair(request, listing), 'Same category path is eligible');
check(!policy.matchingPair(request, { ...listing, subcategory: group.subcategories[1] }), 'Different subcategory excluded even for services');
check(!policy.matchingPair(request, { ...listing, catalogCategoryId: 'electric' }), 'Conflicting explicit category is not silently reinterpreted');
check(!policy.matchingPair(request, { ...listing, catalogGroupId: 'wrong-group' }), 'Conflicting explicit group is not silently reinterpreted');
check(policy.matchingPair(request, { ...listing, catalogCategoryId: 'old-text-category-id' }), 'Legacy textual category IDs resolve via real catalog');
check(!policy.matchingPair({ ...request, status: 'closed' }, listing), 'Closed request excluded');
for (const moderationStatus of ['pending', 'manual_review', 'rejected', 'blocked']) {
  check(!policy.matchingPair({ ...request, moderationStatus }, listing), `Request ${moderationStatus} excluded`);
  check(!policy.matchingPair(request, { ...listing, moderationStatus }), `Listing ${moderationStatus} excluded`);
}
for (const status of ['draft', 'archived', 'deleted', 'inactive', 'closed']) {
  check(!policy.matchingPair(request, { ...listing, status }), `Listing status ${status} excluded`);
}
check(!policy.matchingPair(request, { ...listing, authorId: 'customer' }), 'Self matches excluded');
check(!policy.matchingPair(request, { ...listing, hidden: true }), 'Hidden listing excluded');
check(policy.publicationAddress({ ...request, address: '' }) === '', 'City-only address excluded');
check(policy.publicationAddress({ ...request, address: 'Город' }) === '', 'City repeated as address excluded');
check(policy.distanceKm({lat:0,lng:0}, {lat:0,lng:0}) === 0, 'Zero coordinates are valid');
check(policy.distanceKm({lat:NaN,lng:0}, {lat:0,lng:0}) === Infinity, 'NaN coordinates rejected');
check(policy.distanceKm({lat:91,lng:0}, {lat:0,lng:0}) === Infinity, 'Out-of-range coordinates rejected');
const degrees = km => km / 6371.0088 * 180 / Math.PI;
check(policy.distanceKm({lat:0,lng:0}, {lat:0,lng:degrees(9.999)}) < 10, '9.999 km eligible');
check(policy.distanceKm({lat:0,lng:0}, {lat:0,lng:degrees(10.001)}) > 10, '10.001 km excluded before rounding');
for (const section of CATALOG_FORM_SECTIONS) {
  for (const catalog of getCatalogFormCategories(section.id)) {
    const data = { ...publication, catalogSection: section.id, catalogCategoryId: catalog.id,
      catalogGroupId: catalog.groupId, category: catalog.category, subcategory: catalog.subcategories[0] };
    check(policy.sameCatalogPath(data, data), `Catalog ${section.id}/${catalog.id}`);
  }
}

const geo = (lng, kind = 'house', precision = 'exact') => ({response:{GeoObjectCollection:{featureMember:[{GeoObject:{
  Point:{pos:`${lng} 0`}, metaDataProperty:{GeocoderMetaData:{kind,precision}},
}}]}}});
check(exactPointFromGeocoder(geo(0))?.lat === 0, 'Exact house accepted');
for (const precision of ['near','number','range','street','other']) {
  check(exactPointFromGeocoder(geo(0,'house',precision)) === null, `Imprecise ${precision} rejected`);
}
check(exactPointFromGeocoder(geo(0,'locality','exact')) === null, 'City centroid rejected even with exact label');
check(exactPointFromGeocoder({}) === null, 'Empty geocoder result rejected');

// Small transactional Firestore double; callbacks are serialized as Firestore
// would retry concurrent transactions contending for the same delivery receipt.
let store, lock, pushes, beforeGuard;
function reset() {
  store = new Map(); lock = Promise.resolve(); pushes = 0; beforeGuard = null;
  store.set('users/customer', {}); store.set('users/executor', {});
  store.set('users/executor/pushTokens/device', { enabled: true, token: 'ExpoPushToken[test]' });
  store.set('customerRequests/r1', { ...request }); store.set('listings/l1', { ...listing });
}
function ref(key) {
  return { path:key, id:key.split('/').at(-1), get:async()=>snap(key),
    set:async(data, options)=>store.set(key,options?.merge?{...store.get(key),...data}:data) };
}
function snap(key) {
  const value = store.get(key);
  return { id:key.split('/').at(-1), ref:ref(key), exists:value!==undefined,
    data:()=>value===undefined?undefined:{...value} };
}
function query(prefix, predicates=[], cursor='', maximum=Infinity) {
  return { where:(field, op, value)=>query(prefix,[...predicates,[field,value]],cursor,maximum),
    orderBy:()=>query(prefix,predicates,cursor,maximum),
    limit:n=>query(prefix,predicates,cursor,n), startAfter:id=>query(prefix,predicates,id,maximum),
    doc:id=>ref(`${prefix}/${id || 'generated'}`),
    get:async()=>{
      const docs = [...store.keys()].filter(key=>key.startsWith(prefix+'/') && key.split('/').length===prefix.split('/').length+1)
        .sort().map(snap).filter(doc=>doc.id>cursor && predicates.every(([field,value])=>doc.data()[field]===value)).slice(0,maximum);
      return {docs,size:docs.length,empty:!docs.length};
    } };
}
const db = {
  doc:ref, collection:query, getAll:async(...refs)=>refs.map(r=>snap(r.path)),
  runTransaction:fn=>{
    const work = lock.then(async()=>{
      if (beforeGuard) { const hook=beforeGuard; beforeGuard=null; hook(); }
      const writes=[];
      const result = await fn({get:async r=>snap(r.path), create:(r,data)=>writes.push([r.path,data,true])});
      for(const [key,data,create] of writes) { if(create) assert.ok(!store.has(key)); store.set(key,data); }
      return result;
    });
    lock=work.catch(()=>{}); return work;
  },
};
const adminPath = require.resolve('../src/lib/firebase-admin.ts');
require.cache[adminPath] = { id:adminPath, filename:adminPath, loaded:true, exports:{getAdminDb:()=>db} };
process.env.YANDEX_GEOCODER_API_KEY = 'offline-test-key';
delete process.env.NEARBY_MATCH_NOTIFICATIONS_ENABLED;
global.fetch = async (input) => {
  const url = new URL(input);
  if (url.hostname==='exp.host') { pushes++; return {ok:true,json:async()=>({data:[{status:'ok'}]})}; }
  assert.equal(url.hostname,'geocode-maps.yandex.ru');
  const address = url.searchParams.get('geocode');
  if (address.includes('Сбой')) return {ok:false,status:503};
  if (address.includes('Нет дома')) return {ok:true,json:async()=>geo(0,'locality','other')};
  const lng = address.includes('Далеко') ? degrees(10.01) : address.includes('Улица, 2') ? degrees(5) : 0;
  return {ok:true,json:async()=>geo(lng)};
};
const {notifyNearbyRequestMatches:run} = require('../src/lib/nearby-request-matches-server.ts');
function notifications() { return [...store.entries()].filter(([key])=>key.includes('/notifications/')); }

(async()=>{
  reset();
  let result=await run('request','r1',request);
  check(result.matched===1 && pushes===1, 'Request publication sends one executor push');
  let [key,value]=notifications()[0];
  check(key.startsWith('users/executor/'), 'Executor, not customer, receives notification');
  check(value.url==='/requests/r1' && value.type==='nearby_request', 'Deep link points to customer request');
  check(value.match.distanceKm===5, 'Distance stored in notification');
  check((await run('request','r1',request)).matched===0 && pushes===1, 'Worker retry deduplicated');
  store.delete(key);
  check((await run('request','r1',request)).matched===0 && notifications().length===0, 'Deleting notification does not reset durable dedupe');
  reset();
  await Promise.all([run('request','r1',request),run('request','r1',request),run('listing','l1',listing)]);
  check(notifications().length===1 && pushes===1, 'Concurrent workers and reverse creation order deduplicated');
  reset();
  await run('listing','l1',listing);
  check(notifications()[0][1].url==='/requests/r1' && notifications()[0][0].startsWith('users/executor/'), 'New listing still notifies executor about existing request');
  reset();
  for(let i=0;i<35;i++) store.set(`listings/l${String(i+2).padStart(3,'0')}`,{...listing});
  let cursor=''; let done=false; let pages=0;
  while(!done) { result=await run('request','r1',request,cursor); cursor=result.cursor; done=result.done; pages++; assert.ok(pages<5); }
  check(pages===2 && notifications().length===1 && pushes===1, 'Multiple listings across pages produce one notification');
  reset(); store.set('listings/l1',{...listing,address:'Далеко, 1'});
  check((await run('request','r1',request)).matched===0, 'Over 10 km does not deliver');
  reset(); store.set('listings/l1',{...listing,city:'Другой город'});
  check((await run('request','r1',request)).matched===1, 'Nearby settlement boundary does not block match');
  reset(); store.set('users/executor',{matchNotificationsEnabled:false});
  check((await run('request','r1',request)).matched===0, 'User opt-out respected');
  reset(); store.set('users/executor',{moderationStatus:'blocked'});
  check((await run('request','r1',request)).matched===0, 'Blocked executor excluded');
  reset(); store.set('users/customer',{moderationStatus:'blocked'});
  check((await run('request','r1',request)).matched===0, 'Blocked customer excluded');
  reset(); store.set('users/executor/blocked/customer',{});
  check((await run('request','r1',request)).matched===0 && pushes===0, 'Personal block respected');
  reset(); store.set('listings/l1',{...listing,address:''});
  check((await run('request','r1',request)).matched===0, 'Legacy city-only listing not treated as nearby');
  reset(); store.set('listings/l1',{...listing,address:'Нет дома, 1'});
  check((await run('request','r1',request)).matched===0, 'Unresolved street skips notification');
  reset(); beforeGuard=()=>store.set('customerRequests/r1',{...request,status:'closed'});
  check((await run('request','r1',request)).matched===0, 'Request closed during matching rejected inside transaction');
  reset(); beforeGuard=()=>store.set('listings/l1',{...listing,address:'Далеко, 1'});
  check((await run('request','r1',request)).matched===0, 'Address changed during matching rejected');
  reset(); store.set('listings/l1',{...listing,address:'Сбой, 1'});
  await assert.rejects(run('request','r1',request), /geocoder unavailable/); checks++;
  check(notifications().length===0, 'Geocoder outage does not create false match');
  store.set('listings/l1',{...listing});
  check((await run('request','r1',request)).matched===1, 'Failed job can retry successfully');
  reset(); process.env.NEARBY_MATCH_NOTIFICATIONS_ENABLED='false';
  check((await run('request','r1',request)).done && notifications().length===0, 'Server feature switch disables new delivery');
  console.log(`PASS: ${checks} nearby policy, geocoder, pagination, transaction and push checks (offline)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
