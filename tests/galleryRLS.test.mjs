import { PGlite } from '@electric-sql/pglite'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// Real PostgreSQL execution with minimal Supabase auth/storage schema stubs.
// This validates SQL and RLS, not hosted Auth delivery or Storage's HTTP service.
const db = new PGlite()
await db.exec(`create role anon; create role authenticated;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to anon,authenticated;
grant execute on function auth.uid(),storage.foldername(text) to anon,authenticated;
grant select,insert,delete on storage.objects to anon,authenticated;`)
await db.exec(await readFile(new URL('../supabase/migrations/001_gallery.sql', import.meta.url),'utf8'))
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const approved='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pending='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owned='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
await db.exec(`insert into auth.users values ('${owner}'),('${other}');
insert into public.photos(id,location_id,author_id,storage_path,caption,width,height,status) values
('${approved}','academic-block','${owner}','${owner}/${approved}/original.webp','Approved',100,100,'approved'),
('${pending}','boys-hostel','${owner}','${owner}/${pending}/original.webp','Pending',100,100,'pending');
insert into storage.objects(bucket_id,name,metadata) values ('campus-gallery','${owner}/${approved}/original.webp','{"mimetype":"image/webp"}'),('campus-gallery','${owner}/${pending}/original.webp','{"mimetype":"image/webp"}');`)
async function as(role,user,action){await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${user??''}',false);`);try{return await action()}finally{await db.exec('reset role')}}
after(async()=>db.close())
test('migration executes in PostgreSQL and anonymous reads exclude pending rows', async()=>{const result=await as('anon',null,()=>db.query('select id from public.photos'));assert.deepEqual(result.rows,[{id:approved}])})
test('anonymous storage read includes only approved associated objects', async()=>{const result=await as('anon',null,()=>db.query('select name from storage.objects'));assert.equal(result.rows.length,1);assert.ok(result.rows[0].name.includes(approved))})
test('authenticated owner inserts own pending photo and reads own pending records', async()=>{await as('authenticated',owner,()=>db.exec(`insert into public.photos(id,location_id,author_id,storage_path,caption,width,height,status) values('${owned}','canteen','${owner}','${owner}/${owned}/original.webp','My photo',100,100,'pending')`));const result=await as('authenticated',owner,()=>db.query('select id from public.photos'));assert.equal(result.rows.length,3)})
test('ordinary users cannot insert self-approved uploads or arbitrary author IDs', async()=>{for(const [author,status] of [[owner,'approved'],[other,'pending']])await as('authenticated',owner,()=>assert.rejects(()=>db.exec(`insert into public.photos(id,location_id,author_id,storage_path,caption,width,height,status) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','canteen','${author}','${author}/dddddddd-dddd-4ddd-8ddd-dddddddddddd/original.webp','No',100,100,'${status}')`),/row-level security/))})
test('ordinary users cannot approve, rewrite author or set photo counters', async()=>{for(const set of ["status='approved'",`author_id='${other}'`,'like_count=999'])await as('authenticated',owner,()=>assert.rejects(()=>db.exec(`update public.photos set ${set} where id='${pending}'`),/permission denied/))})
test('likes require approved photo and own identity and counter changes are server-side', async()=>{await as('authenticated',other,()=>db.exec(`insert into public.photo_likes(photo_id,user_id) values('${approved}','${other}')`));assert.equal((await db.query(`select like_count from public.photos where id='${approved}'`)).rows[0].like_count,1);await as('authenticated',other,()=>assert.rejects(()=>db.exec(`insert into public.photo_likes(photo_id,user_id) values('${pending}','${other}')`),/row-level security/));await as('authenticated',other,()=>assert.rejects(()=>db.exec(`insert into public.photo_likes(photo_id,user_id) values('${approved}','${owner}')`),/row-level security/))})
test('another user cannot remove a like; the liker can unlike and count decrements', async()=>{await as('authenticated',owner,()=>db.exec(`delete from public.photo_likes where user_id='${other}'`));assert.equal((await db.query('select count(*)::int as n from public.photo_likes')).rows[0].n,1);await as('authenticated',other,()=>db.exec('delete from public.photo_likes'));assert.equal((await db.query(`select like_count from public.photos where id='${approved}'`)).rows[0].like_count,0)})
test('storage insert allows only owner UUID paths and WebP metadata', async()=>{await as('authenticated',owner,()=>db.exec(`insert into storage.objects(bucket_id,name,metadata) values('campus-gallery','${owner}/${owned}/thumbnail.webp','{"mimetype":"image/webp"}')`));for(const [path,mime] of [[`${other}/${owned}/original.webp`,'image/webp'],[`${owner}/${owned}/wrong.svg`,'image/webp'],[`${owner}/${owned}/original.webp`,'image/png']])await as('authenticated',owner,()=>assert.rejects(()=>db.exec(`insert into storage.objects(bucket_id,name,metadata) values('campus-gallery','${path}','{"mimetype":"${mime}"}')`),/row-level security/))})
test('reports require verified reporter, have duplicate protection and are private', async()=>{await as('authenticated',other,()=>db.exec(`insert into public.photo_reports(photo_id,reporter_id,reason) values('${approved}','${other}','Review requested')`));await as('authenticated',other,()=>assert.rejects(()=>db.exec(`insert into public.photo_reports(photo_id,reporter_id,reason) values('${approved}','${other}','Again')`),/duplicate key/));await as('authenticated',other,()=>assert.rejects(()=>db.query('select * from public.photo_reports'),/permission denied/))})
test('photo deletion is owner-scoped even for guessed UUIDs', async()=>{await as('authenticated',other,()=>db.exec(`delete from public.photos where id='${owned}'`));assert.equal((await db.query(`select id from public.photos where id='${owned}'`)).rows.length,1);await as('authenticated',owner,()=>db.exec(`delete from public.photos where id='${owned}'`));assert.equal((await db.query(`select id from public.photos where id='${owned}'`)).rows.length,0)})
