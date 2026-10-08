import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { fakeFirestore } from './firestoreFake.mjs'
import { isAvatarStyle, profileError } from '../src/lib/profile.ts'
import { createProfileStore } from '../server/profileStore.ts'
import { createProfileAPI } from '../server/profileApi.ts'
import { createAccessVerifier } from '../server/access.ts'
import { createCampusRoom } from '../server/campusRoom.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'

const identity={id:'alice',name:'Alice',role:'member',expiresAt:Date.now()+60000}
const profile={id:'alice',display_name:'Alice',handle:'alice',bio:'Campus music',course:'CSE',interests:['Music'],avatar_color:'forest',is_public:false,created_at:'2026-10-08T00:00:00.000Z'}
const setup=(extra={})=>fakeFirestore({'profiles/alice':{...profile,...extra},'campusMembers/alice':{role:'member',status:'active'}})
const boundary=[{x:-200,z:-200},{x:200,z:-200},{x:200,z:200},{x:-200,z:200},{x:-200,z:-200}]
const pose={x:0,y:0,z:0,yaw:0,moving:false,running:false,active:true,visible:true,space:'outdoors',epoch:1}

test('avatar choices validate appearance and leave old profiles eligible to choose',()=>{
 for(const style of ['girl','boy']) {assert.ok(isAvatarStyle(style));assert.equal(profileError({...profile,avatar_style:style}),null)}
 for(const style of ['__proto__','constructor','woman',{},1]) {assert.equal(isAvatarStyle(style),false);assert.match(profileError({...profile,avatar_style:style}),/girl or boy/)}
 assert.equal(profileError(profile),null);assert.equal(profileError({...profile,avatar_style:null}),null)
})

test('appearance-only saves preserve profile details, roles and privacy',async()=>{
 const {db,data}=setup(),store=createProfileStore(db)
 const saved=await store.saveAvatar(identity,{avatar_style:'girl',id:'bob',role:'admin',is_public:true,display_name:'Injected name',avatar_color:'coral'})
 assert.deepEqual(saved,{...profile,avatar_style:'girl'})
 assert.deepEqual(data.get('profiles/alice'),saved)
 assert.equal(data.get('campusMembers/alice').role,'member');assert.equal(data.has('publicProfiles/alice'),false);assert.equal(data.has('profiles/bob'),false)
 // An older profile editor must not erase an appearance chosen elsewhere.
 await store.save(identity,{...profile,bio:'Updated story'})
 assert.equal(data.get('profiles/alice').avatar_style,'girl')
 assert.equal(data.get('profiles/alice').bio,'Updated story')
 await assert.rejects(()=>store.saveAvatar(identity,{avatar_style:'invalid'}),/girl or boy/)
 data.set('campusMembers/alice',{role:'member',status:'banned'})
 await assert.rejects(()=>store.saveAvatar(identity,{avatar_style:'boy'}),/unavailable/)
 assert.equal(data.get('profiles/alice').avatar_style,'girl')
})

test('public avatars stay synchronized, while private choices create no public record',async()=>{
 const {db,data}=setup({is_public:true}),store=createProfileStore(db)
 await store.saveAvatar(identity,{avatar_style:'boy'})
 assert.equal((await store.publicProfile('alice')).avatar_style,'boy')
 await store.saveAvatar(identity,{avatar_style:'girl'})
 assert.equal((await store.publicProfile('alice')).avatar_style,'girl','cached public cards are invalidated')
 await store.save(identity,{...profile,avatar_style:'girl',is_public:false})
 await store.saveAvatar(identity,{avatar_style:'boy'})
 assert.equal(data.has('publicProfiles/alice'),false)
})

test('Google sign-in preserves chosen appearance and new accounts receive no assumed choice',async()=>{
 const {db,data}=fakeFirestore()
 const verify=createAccessVerifier({db,auth:{verifyIdToken:async()=>({uid:'alice',exp:Math.floor(Date.now()/1000)+60,auth_time:1,firebase:{sign_in_provider:'google.com'}}),getUser:async()=>({uid:'alice',displayName:'Alice',email:'alice@example.com',emailVerified:true})}})
 const first=await verify('test-google-token-avatar-only');assert.equal(first.avatarStyle,null);assert.equal(data.get('profiles/alice').avatar_style,null)
 await createProfileStore(db).saveAvatar(first,{avatar_style:'girl'})
 assert.equal((await verify('test-google-token-avatar-only')).avatarStyle,'girl')
 assert.equal(data.get('profiles/alice').is_public,false)
})

test('live appearance comes from verified profiles, survives metadata refresh and cannot be forged in a pose',()=>{
 const room=createCampusRoom(boundary)
 room.add({...identity,avatarStyle:'girl'});room.add({...identity,id:'bob',avatarStyle:'boy'})
 assert.ok(room.pose('alice',{...pose,avatarStyle:'boy'},'walk',1000))
 const snapshot=room.snapshot(1000),parsed=parseCampusSnapshot(snapshot)
 assert.equal(parsed.people.find(p=>p.id==='alice').avatarStyle,'girl');assert.equal(parsed.people.find(p=>p.id==='bob').avatarStyle,'boy')
 room.updateIdentity({...identity,avatarStyle:'boy'})
 assert.equal(room.snapshot(1000).people.find(p=>p.id==='alice').avatarStyle,'boy')
 assert.equal(parseCampusSnapshot({...snapshot,people:snapshot.people.map(p=>({...p,avatarStyle:'invalid'}))}),null)
 assert.ok(parseCampusSnapshot({...snapshot,people:snapshot.people.map(({avatarStyle,...p})=>p)}),'older snapshots remain compatible')
})

test('avatar API enforces authentication, methods, validation and the signed-in account',async t=>{
 const oldProject=process.env.FIREBASE_PROJECT_ID;process.env.FIREBASE_PROJECT_ID='avatar-test-project'
 const {db,data}=setup(),api=createProfileAPI(async token=>{if(token!=='avatar-test-alice-token-only')throw new Error('Sign in to join campus.');return identity},()=>createProfileStore(db))
 const server=createServer((req,res)=>{if(!api.handle(req,res)){res.writeHead(404);res.end()}})
 t.after(async()=>{await new Promise(r=>server.close(r));if(oldProject===undefined)delete process.env.FIREBASE_PROJECT_ID;else process.env.FIREBASE_PROJECT_ID=oldProject})
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const url=`http://127.0.0.1:${server.address().port}/api/me/avatar`
 const send=(body,method='PATCH',auth=true)=>fetch(url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer avatar-test-alice-token-only'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 assert.equal((await send({avatar_style:'girl'},'PATCH',false)).status,403)
 assert.equal((await send(undefined,'GET')).status,405)
 assert.equal((await send({avatar_style:'invalid'})).status,400)
 const result=await send({avatar_style:'girl',id:'bob',role:'admin'})
 assert.equal(result.status,200);assert.equal((await result.json()).avatar_style,'girl')
 assert.equal(data.get('profiles/alice').avatar_style,'girl');assert.equal(data.has('profiles/bob'),false)
})
