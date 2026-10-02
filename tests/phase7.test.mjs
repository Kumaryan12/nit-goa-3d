import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { classifyTurn, headingChange, routeDirections, simplifyHeadings, pathDistance } from '../src/lib/directions.ts'
import { cumulativeDistances, positionAtDistance, routePoints } from '../src/lib/traversal.ts'
import { routeCameraView } from '../src/lib/camera.ts'
import { parseURLState, serializeURLState } from '../src/lib/urlState.ts'
import { validateImage, resizeDimensions, imageDimensions, MAX_INPUT_BYTES } from '../src/lib/images.ts'
import { validatePublicConfig } from '../src/lib/supabase.ts'
import { DemoGalleryRepository } from '../src/repositories/DemoGalleryRepository.ts'
import { SupabaseGalleryRepository, photoFromRow } from '../src/repositories/SupabaseGalleryRepository.ts'
import { optimisticLike, toggleLikeWithRollback } from '../src/lib/gallery.ts'
import { shouldRetry, retryDelay, fetchWithRetry } from '../src/lib/fetchStrategy.ts'
import { readMapCache, writeMapCache, loadMapWithCache, MAP_FRESHNESS_MS, validMapPayload } from '../src/lib/osmCache.ts'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { createRoadGraph, planWalkingRoute } from '../src/lib/pathfinding.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
const p = (x, z) => ({x,z})
const straight = [p(0,0),p(0,-30),p(0,-80)]
for (const [angle, expected] of [[0,'continue'],[17,'continue'],[25,'slight-right'],[-25,'slight-left'],[90,'right'],[-90,'left'],[160,'sharp-right'],[-160,'sharp-left']]) test(`heading ${angle} classifies ${expected}`, () => assert.equal(classifyTurn(angle),expected))
test('north to east is right with +X east and -Z north',()=>assert.equal(headingChange(p(0,0),p(0,-20),p(20,-20)),90))
test('instructions collapse noisy centerline bends without changing the underlying path',()=>{const path=[p(0,0),p(.3,-10),p(-.2,-20),p(.2,-30),p(0,-50)];const before=JSON.stringify(path);assert.equal(simplifyHeadings(path).length,2);assert.equal(routeDirections(path,'Hostel').length,2);assert.equal(JSON.stringify(path),before)})
test('instructions retain a genuine 90 degree turn and measured total distance',()=>{const path=[p(0,0),p(0,-50),p(50,-50)];const steps=routeDirections(path,'Academic');assert.equal(steps[1].turn,'right');assert.equal(steps.at(-1).turn,'arrive');assert.equal(steps.reduce((sum,s)=>sum+s.distance,0),pathDistance(path))})
test('duplicate or zero-length paths still produce a destination instruction',()=>{assert.deepEqual(routeDirections([],'Entrance'),[{turn:'arrive',distance:0,instruction:'Entrance anchor is ahead'}]);assert.equal(routeDirections([p(0,0),p(0,0)],'Entrance').length,1)})
test('arc-length traveler moves equal meters over unequal segments and clamps endpoints',()=>{const path=[p(0,0),p(0,-10),p(0,-110)],lengths=cumulativeDistances(path);assert.deepEqual(lengths,[0,10,110]);assert.deepEqual(positionAtDistance(path,lengths,5),p(0,-5));assert.deepEqual(positionAtDistance(path,lengths,55),p(0,-55));assert.deepEqual(positionAtDistance(path,lengths,1000),path.at(-1));assert.deepEqual(positionAtDistance(path,lengths,-1),path[0])})
test('route presentation includes unverified connectors without duplicating snapped points',()=>assert.deepEqual(routePoints({start:p(0,0),end:p(20,0),route:{path:[p(0,0),p(10,0)]}}),[p(0,0),p(10,0),p(20,0)]))
for (const [name,path] of [['short',[p(1,1),p(1.1,1.1)]],['vertical',[p(0,-500),p(0,500)]],['horizontal',[p(-500,0),p(500,0)]]]) test(`route framing handles ${name} routes and portrait screens`,()=>{const desktop=routeCameraView(path,1.6),mobile=routeCameraView(path,.46);assert.ok([...mobile.position,...mobile.target].every(Number.isFinite));assert.ok(mobile.position[1]>desktop.position[1]);assert.ok(mobile.position[1]>20)})
const ids=['boys-hostel','academic-block','main-entrance']
test('location deep link restores stable selection and night mode',()=>assert.deepEqual(parseURLState('/?location=boys-hostel&mode=night',ids),{location:'boys-hostel',from:null,to:null,night:true,photo:null}))
test('route URL validates both anchors and optional photo ID',()=>{const state=parseURLState('/?from=main-entrance&to=academic-block&photo=academic-evening-demo',ids);assert.equal(state.from,'main-entrance');assert.equal(state.to,'academic-block');assert.equal(state.photo,'academic-evening-demo')})
test('invalid, injected and duplicate unknown URL IDs fail gracefully',()=>{const state=parseURLState('/?location=unknown&from=../x&to=%3Cscript%3E&photo=%3Cimg%3E&mode=no',ids);assert.deepEqual(state,{location:null,from:null,to:null,night:false,photo:null})})
test('URL serialization preserves unrelated query state and base deployment paths',()=>{const state={location:'boys-hostel',from:'main-entrance',to:'boys-hostel',night:true,photo:null};const url=serializeURLState(state,'https://example.com/explorer/?utm=test&photo=old#campus');assert.ok(url.startsWith('/explorer/?utm=test'));assert.ok(!url.includes('photo='));assert.deepEqual(parseURLState(url,ids),state)})
for(const type of ['image/jpeg','image/png','image/webp'])test(`input accepts bounded ${type}`,()=>assert.doesNotThrow(()=>validateImage({type,size:MAX_INPUT_BYTES})))
test('images reject unsupported MIME, empty and oversized files',()=>{for(const file of [{type:'image/svg+xml',size:10},{type:'image/png',size:0},{type:'image/png',size:MAX_INPUT_BYTES+1}])assert.throws(()=>validateImage(file))})
test('resize preserves aspect ratio in landscape and portrait without upscaling',()=>{assert.deepEqual(resizeDimensions(4000,2000),{width:2048,height:1024});assert.deepEqual(resizeDimensions(2000,4000,480),{width:240,height:480});assert.deepEqual(resizeDimensions(200,100),{width:200,height:100})})
test('dimension limits reject decompression bombs and nonfinite sizes',()=>{for(const [w,h] of [[100000,100000],[0,20],[Infinity,20],[-1,10]])assert.throws(()=>resizeDimensions(w,h))})
test('header inspection rejects MIME spoofing before bitmap decode',()=>assert.throws(()=>imageDimensions(new Uint8Array([1,2,3]),'image/png')))
test('PNG header exposes dimensions before decompression',()=>{const bytes=new Uint8Array(24),v=new DataView(bytes.buffer);v.setUint32(0,0x89504e47);v.setUint32(4,0x0d0a1a0a);v.setUint32(16,3000);v.setUint32(20,2000);assert.deepEqual(imageDimensions(bytes,'image/png'),{width:3000,height:2000})})
test('public backend config rejects privileged and malformed keys',()=>{for(const key of ['service_role','sb_secret_abcdefg','bad',`x.${btoa(JSON.stringify({role:'service_role'}))}.y`])assert.equal(validatePublicConfig('https://test.supabase.co',key),null);assert.equal(validatePublicConfig('javascript:alert(1)','sb_publishable_abcdefghijklmnop'),null)})
test('public anon JWT and publishable keys are valid public configuration',()=>{assert.ok(validatePublicConfig('https://test.supabase.co',`x.${btoa(JSON.stringify({role:'anon'}))}.y`));assert.ok(validatePublicConfig('https://test.supabase.co','sb_publishable_abcdefghijklmnop'))})
const demo=new DemoGalleryRepository()
test('demo repository filters locations and never exposes unapproved content',async()=>{const photos=await demo.getByLocation('academic-block');assert.equal(photos.length,2);assert.ok(photos.every(p=>p.placeholder&&p.locationId==='academic-block'&&p.status==='approved'));assert.deepEqual(await demo.getByLocation('missing'),[])})
test('demo latest/popular/id methods preserve honest demo metadata',async()=>{const photos=await demo.getRecent();assert.equal(photos.length,8);assert.ok(photos[0].createdAt>=photos[1].createdAt);assert.equal((await demo.getPopular('boys-hostel')).length,1);assert.equal((await demo.getById(photos[0].id)).id,photos[0].id);assert.equal(await demo.getById('missing'),null)})
for(const method of ['create','like','unlike','deleteOwnPhoto','report'])test(`demo ${method} does not pretend community persistence is available`,async()=>assert.rejects(()=>demo[method]('id')))
test('adapter maps snake_case DB fields and signed URLs into the public domain',()=>{const row={id:'1',location_id:'boys-hostel',storage_path:'a/b/original.webp',caption:'A view',author_id:'user',author_display_name:'Member',created_at:'2026-01-01',updated_at:'2026-01-01',width:800,height:600,status:'approved',like_count:3};const photo=photoFromRow(row,'signed-image','signed-thumb',true);assert.equal(photo.thumbnailUrl,'signed-thumb');assert.equal(photo.authorId,'user');assert.equal(photo.likeCount,3);assert.equal(photo.placeholder,false);assert.equal(photo.liked,true)})
for(const method of ['like','unlike','deleteOwnPhoto'])test(`Supabase ${method} verifies identity before any mutation`,async()=>{const repository=new SupabaseGalleryRepository(async()=>({auth:{getUser:async()=>({data:{user:null},error:new Error('expired')})}}));await assert.rejects(()=>repository[method]('photo'),/sign in again/)})
test('unlike always scopes operation to server-verified identity',async()=>{const filters=[];const repository=new SupabaseGalleryRepository(async()=>({auth:{getUser:async()=>({data:{user:{id:'verified-owner'}}})},from:()=>({delete:()=>({eq:(key,value)=>{filters.push([key,value]);return {eq:(k,v)=>{filters.push([k,v]);return Promise.resolve({error:null})}}}})})}));await repository.unlike('photo');assert.deepEqual(filters,[['photo_id','photo'],['user_id','verified-owner']])})
test('adapter rejects arbitrary location IDs and raw/non-WebP upload blobs',async()=>{const repository=new SupabaseGalleryRepository(async()=>{throw new Error('should not access backend')});await assert.rejects(()=>repository.create({id:'bad',locationId:'injected',caption:'x'}),/Invalid photo/);await assert.rejects(()=>repository.create({id:'00000000-0000-4000-8000-000000000000',locationId:'academic-block',caption:'x',width:100,height:100,image:new Blob(['x'],{type:'image/png'}),thumbnail:new Blob(['x'],{type:'image/webp'})}),/optimized WebP/)})
test('optimistic likes never create negative counts',()=>assert.equal(optimisticLike({likeCount:0,liked:true}).likeCount,0))
test('optimistic likes commit immediately and roll back exact prior state on failure',async()=>{const photo={id:'p',likeCount:2,liked:false},commits=[];await assert.rejects(()=>toggleLikeWithRollback(photo,p=>commits.push(p),async()=>{throw new Error('offline')}));assert.equal(commits[0].likeCount,3);assert.deepEqual(commits[1],photo)})
test('successful optimistic unlike retains its updated state',async()=>{const commits=[];await toggleLikeWithRollback({likeCount:2,liked:true},p=>commits.push(p),async(liked)=>assert.equal(liked,false));assert.equal(commits.length,1);assert.equal(commits[0].likeCount,1)})
const campus=JSON.parse(await readFile(new URL('./fixtures/nit-goa-campus.json',import.meta.url),'utf8')),roads=JSON.parse(await readFile(new URL('./fixtures/nit-goa-roads.json',import.meta.url),'utf8'))
const boundary=roads.elements.find(e=>e.id===1259742369).geometry
const map={buildings:extractBuildingFootprints(campus.elements),boundary,source:'campus-area',returnedBuildingCount:22}
const roadData={roads:extractCampusRoads(roads.elements,boundary),boundary,source:'campus-area',returnedRoadCount:20}
function storage(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}}
test('map cache round-trips real successful buildings and roads with timestamp/version',()=>{const s=storage();assert.equal(writeMapCache(s,'buildings',map,100000),true);assert.deepEqual(readMapCache(s,'buildings',100001).payload,map);assert.equal(writeMapCache(s,'roads',roadData,100000),true);assert.deepEqual(readMapCache(s,'roads',100001).payload,roadData)})
test('cache expiry marks 24-hour-old data stale but available for fallback',()=>{const s=storage();writeMapCache(s,'roads',roadData,100000);assert.equal(readMapCache(s,'roads',100001).stale,false);assert.equal(readMapCache(s,'roads',100000+MAP_FRESHNESS_MS+1).stale,true)})
test('cache version mismatch, corrupt JSON and future timestamps are rejected',()=>{for(const value of ['{bad',JSON.stringify({version:0,payload:map,timestamp:100}),JSON.stringify({version:1,payload:map,timestamp:999999999})]){const s=storage();s.setItem('nit-goa:osm:buildings',value);assert.equal(readMapCache(s,'buildings',100),null)}})
test('malformed geometry is never cached and quota failures do not crash the map',()=>{const s=storage();assert.equal(writeMapCache(s,'buildings',{...map,buildings:[{...map.buildings[0],outer:[]}]}),false);assert.equal(validMapPayload('roads',{...roadData,roads:[{...roadData.roads[0],paths:[[p(NaN,0),p(0,0)]]}]}),false);assert.equal(writeMapCache({setItem:()=>{throw new Error('quota')}},'buildings',map),false)})
test('live data is preferred over cache and successful data refreshes persistence',async()=>{const s=storage();writeMapCache(s,'buildings',map,100);const result=await loadMapWithCache('buildings',async()=>map,s,new AbortController().signal);assert.equal(result.cache,null);assert.ok(readMapCache(s,'buildings').timestamp>100)})
test('failed live request uses stored real map data with explicit cache metadata',async()=>{const s=storage();writeMapCache(s,'roads',roadData);const result=await loadMapWithCache('roads',async()=>{throw new Error('504')},s,new AbortController().signal);assert.ok(result.cache);assert.deepEqual(result.data,roadData)})
test('offline fallback avoids a network request and fails usefully without a cache',async()=>{const s=storage();writeMapCache(s,'roads',roadData);let calls=0;const live=async()=>{calls++;return roadData};assert.ok((await loadMapWithCache('roads',live,s,new AbortController().signal,true)).cache);assert.equal(calls,0);await assert.rejects(()=>loadMapWithCache('roads',live,storage(),new AbortController().signal,true),/Offline/)})
test('aborted loads never silently recover cache or update persistence',async()=>{const s=storage(),controller=new AbortController();writeMapCache(s,'roads',roadData);controller.abort();await assert.rejects(()=>loadMapWithCache('roads',async()=>roadData,s,controller.signal))})
test('retry strategy accepts 429 and 5xx but excludes ordinary client errors',()=>{for(const status of [429,500,502,503,504])assert.equal(shouldRetry(status),true);for(const status of [200,400,401,403,404,422])assert.equal(shouldRetry(status),false)})
test('retry backoff increases with bounded jitter and caps Retry-After',()=>{assert.ok(retryDelay(1,0)>retryDelay(0,0));assert.equal(retryDelay(0,1)-retryDelay(0,0),350);assert.equal(retryDelay(10,1,'999'),5000)})
test('retry strategy bounds failed requests and recovers transient throttling',async()=>{let calls=0;const sleeps=[];const result=await fetchWithRetry('https://example.com',{}, {fetcher:async()=>new Response('',{status:++calls===1?429:200}),sleep:async ms=>{sleeps.push(ms)}});assert.equal(result.status,200);assert.equal(calls,2);assert.equal(sleeps.length,1)})
test('permanent 403 is not retried and repeated 503 stops after three attempts',async()=>{for(const [status,expected] of [[403,1],[503,3]]){let calls=0;const result=await fetchWithRetry('https://example.com',{}, {fetcher:async()=>{calls++;return new Response('',{status})},sleep:async()=>{}});assert.equal(result.status,status);assert.equal(calls,expected)}})
test('network errors retry but lifecycle abort does not',async()=>{let calls=0;await assert.rejects(()=>fetchWithRetry('https://example.com',{}, {fetcher:async()=>{calls++;throw new Error('network')},sleep:async()=>{}}));assert.equal(calls,3);const controller=new AbortController();controller.abort();await assert.rejects(()=>fetchWithRetry('https://example.com',{signal:controller.signal},{fetcher:async()=>{throw new Error('must not call')}}))})
test('real QA route retains exact A* path, distance, trees and major heading instructions',()=>{const twin=createDigitalTwin(map,roadData),start=twin.locations.find(p=>p.id==='main-entrance'),end=twin.locations.find(p=>p.id==='boys-hostel');const route=planWalkingRoute(start.coordinates,end.coordinates,createRoadGraph(roadData.roads,{allowPrivate:true}));assert.ok(Math.abs(route.distance-952.8805488)<.01);assert.equal(twin.trees.length,640);assert.equal(routeDirections(route.path,end.name).at(-1).turn,'arrive');assert.ok(routeDirections(route.path,end.name).length<route.path.length)})
test('migration keeps pending uploads private and ordinary users cannot approve photos',async()=>{const sql=await readFile(new URL('../supabase/migrations/001_gallery.sql',import.meta.url),'utf8');assert.ok(sql.includes("status='pending'"));assert.ok(sql.includes("status='approved'"));assert.ok(sql.includes("false,4194304,array['image/webp']"));assert.ok(sql.includes('unique(photo_id,user_id)'));assert.ok(!/grant update.*on public.photos to authenticated/i.test(sql));assert.ok(sql.includes('alter table public.photos enable row level security'))})

function submissionBackend({ storageError = null, loseInsertResponse = false, existing = false } = {}) {
  const owner = '00000000-0000-4000-8000-000000000001', calls = [], rows = new Map()
  const input = { id: '00000000-0000-4000-8000-000000000002', locationId: 'boys-hostel', caption: '  A courtyard  ', width: 1200, height: 800, image: new Blob(['webp'], { type: 'image/webp' }), thumbnail: new Blob(['webp'], { type: 'image/webp' }) }
  if (existing) rows.set(input.id, { id: input.id, author_id: owner, status: 'pending' })
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    storage: { from: (bucket) => ({ upload: async (path, blob, options) => { calls.push({ bucket, path, blob, options }); return { error: storageError } } }) },
    from: (table) => {
      const filters = [], query = {
        select: () => query, eq: (key, value) => { filters.push([key, value]); return query },
        maybeSingle: async () => ({ data: [...rows.values()].find(row => filters.every(([key, value]) => row[key] === value)) ?? null, error: null }),
        insert: (data) => { calls.push({ table, insert: data }); rows.set(data.id, { ...data, like_count: 0, author_display_name: 'Campus member' }); return query },
        single: async () => ({ data: loseInsertResponse ? null : [...rows.values()].at(-1), error: loseInsertResponse ? { message: 'Lost response' } : null }),
      }; return query
    },
  }
  return { repository: new SupabaseGalleryRepository(async () => client), input, owner, calls, rows }
}
test('submission uploads two immutable owner-scoped WebPs and inserts pending metadata', async () => {
  const backend = submissionBackend(), stages = [], photo = await backend.repository.create(backend.input, stage => stages.push(stage))
  assert.equal(photo.status, 'pending'); assert.equal(photo.authorId, backend.owner)
  assert.equal(photo.caption, 'A courtyard'); assert.equal(photo.locationId, 'boys-hostel')
  assert.deepEqual(stages, ['uploading', 'submitting', 'complete'])
  assert.deepEqual(backend.calls.slice(0, 2).map(call => call.path), [`${backend.owner}/${backend.input.id}/original.webp`, `${backend.owner}/${backend.input.id}/thumbnail.webp`])
  assert.ok(backend.calls.slice(0, 2).every(call => call.bucket === 'campus-gallery' && call.options.upsert === false && call.options.contentType === 'image/webp'))
})
test('retry recovers a successful submission after a lost database response without duplicates', async () => {
  const backend = submissionBackend({ loseInsertResponse: true })
  assert.equal((await backend.repository.create(backend.input)).status, 'pending')
  const requests = backend.calls.length
  await backend.repository.create(backend.input)
  assert.equal(backend.calls.length, requests); assert.equal(backend.rows.size, 1)
})
test('storage failure stops before database insertion and allows the same caption to retry', async () => {
  const backend = submissionBackend({ storageError: { message: 'Connection lost' } })
  await assert.rejects(() => backend.repository.create(backend.input), /Storage upload failed/)
  assert.equal(backend.rows.size, 0); assert.equal(backend.input.caption, '  A courtyard  ')
})
test('existing owner submission is recovered without reuploading either object', async () => {
  const backend = submissionBackend({ existing: true })
  assert.equal((await backend.repository.create(backend.input)).id, backend.input.id)
  assert.equal(backend.calls.length, 0)
})
test('adapter rejects malformed UUIDs and noninteger image dimensions before contacting backend', async () => {
  const backend = submissionBackend()
  for (const input of [{ ...backend.input, id: '-'.repeat(36) }, { ...backend.input, width: NaN }, { ...backend.input, height: 1.5 }]) await assert.rejects(() => backend.repository.create(input), /Invalid photo/)
  assert.equal(backend.calls.length, 0)
})
