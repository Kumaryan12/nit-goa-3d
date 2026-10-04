import { PGlite } from '@electric-sql/pglite'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const db = new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1'))$$;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to anon,authenticated;
grant select,insert,delete on storage.objects to anon,authenticated;`)
await db.exec(
  await readFile(
    new URL('../supabase/migrations/001_gallery.sql', import.meta.url),
    'utf8',
  ),
)
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222',
  admin = '33333333-3333-4333-8333-333333333333',
  mod = '44444444-4444-4444-8444-444444444444'
await db.exec(
  `insert into auth.users values('${a}');insert into public.profiles(id,display_name) values('${a}','Existing member');`,
)
await db.exec(
  await readFile(
    new URL('../supabase/migrations/002_community.sql', import.meta.url),
    'utf8',
  ),
)
await db.exec(
  `insert into auth.users values('${b}'),('${admin}'),('${mod}');update public.campus_members set role='admin' where user_id='${admin}';update public.campus_members set role='moderator' where user_id='${mod}';`,
)
async function as(role, user, fn, aal = 'aal2') {
  await db.exec(
    `set role ${role};select set_config('request.jwt.claim.aal','${aal}',false);select set_config('request.jwt.claim.sub','${user || ''}',false);`,
  )
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}
after(() => db.close())
test('accounts are provisioned privately and existing profiles survive migration', async () => {
  assert.equal(
    (await db.query('select count(*)::int n from public.campus_members'))
      .rows[0].n,
    4,
  )
  assert.equal(
    (await db.query(`select display_name from public.profiles where id='${a}'`))
      .rows[0].display_name,
    'Existing member',
  )
  assert.equal(
    (await as('anon', null, () => db.query('select * from public.profiles')))
      .rows.length,
    0,
  )
  const result = await as('authenticated', b, () =>
    db.query('select id,is_public from public.profiles'),
  )
  assert.deepEqual(result.rows, [{ id: b, is_public: false }])
})
test('only the owner can publish and edit a profile, handles must be valid and unique', async () => {
  for (const fields of [
    'is_public=true',
    "handle='admin'",
    "handle='bad handle'",
    "bio=repeat('x',281)",
  ])
    await as('authenticated', a, () =>
      assert.rejects(
        () => db.exec(`update public.profiles set ${fields} where id='${a}'`),
        /check constraint/,
      ),
    )
  await as('authenticated', a, () =>
    db.exec(
      `update public.profiles set handle='campus_artist',bio='Music and sunsets',is_public=true where id='${a}'`,
    ),
  )
  assert.deepEqual(
    (
      await as('anon', null, () =>
        db.query('select handle,bio from public.profiles'),
      )
    ).rows,
    [{ handle: 'campus_artist', bio: 'Music and sunsets' }],
  )
  await as('authenticated', b, () =>
    db.exec(`update public.profiles set bio='Forged' where id='${a}'`),
  )
  assert.equal(
    (await db.query(`select bio from public.profiles where id='${a}'`)).rows[0]
      .bio,
    'Music and sunsets',
  )
  await as('authenticated', b, () =>
    assert.rejects(
      () =>
        db.exec(
          `update public.profiles set handle='campus_artist' where id='${b}'`,
        ),
      /unique constraint/,
    ),
  )
  await as('authenticated', a, () =>
    db.exec(`update public.profiles set is_public=false where id='${a}'`),
  )
  assert.equal(
    (await as('anon', null, () => db.query('select * from public.profiles')))
      .rows.length,
    0,
  )
})
test('account roles cannot be forged by profile or membership writes and access is own-scoped', async () => {
  for (const sql of [
    `update public.campus_members set role='admin' where user_id='${b}'`,
    `insert into public.campus_members(user_id,role) values('${a}','admin')`,
    `select * from public.campus_moderation_log`,
  ])
    await as('authenticated', b, () =>
      assert.rejects(() => db.exec(sql), /permission denied/),
    )
  const result = await as('authenticated', b, () =>
    db.query('select public.campus_access() access'),
  )
  assert.equal(result.rows[0].access.id, b)
  assert.equal(result.rows[0].access.role, 'member')
  await as('anon', null, () =>
    assert.rejects(
      () => db.query('select public.campus_access()'),
      /permission denied/,
    ),
  )
})
test('moderation checks role, hierarchy, self actions and records bans atomically', async () => {
  for (const [actor, target] of [
    [a, b],
    [mod, admin],
    [admin, admin],
    [mod, mod],
  ])
    await as('authenticated', actor, () =>
      assert.rejects(
        () =>
          db.query('select public.moderate_campus($1,$2,$3)', [
            target,
            'ban',
            'spam',
          ]),
        /Not permitted/,
      ),
    )
  await as('authenticated', mod, () =>
    db.query('select public.moderate_campus($1,$2,$3)', [b, 'ban', 'spam']),
  )
  assert.equal(
    (
      await as('authenticated', b, () =>
        db.query('select public.campus_access() access'),
      )
    ).rows[0].access.status,
    'banned',
  )
  assert.equal(
    (await db.query('select count(*)::int n from public.campus_moderation_log'))
      .rows[0].n,
    1,
  )
  await as('authenticated', admin, () =>
    db.query('select public.moderate_campus($1,$2,$3)', [
      b,
      'unban',
      'reviewed',
    ]),
  )
  assert.equal(
    (
      await db.query(
        `select status from public.campus_members where user_id='${b}'`,
      )
    ).rows[0].status,
    'active',
  )
  await as('authenticated', admin, () =>
    assert.rejects(
      () => db.query('select public.moderate_campus($1,$2,$3)', [b, 'ban', '']),
      /Invalid moderation/,
    ),
  )
})

test('moderators require MFA and suspended accounts cannot publish profiles or insert gallery data', async () => {
  await as(
    'authenticated',
    admin,
    () =>
      assert.rejects(
        () =>
          db.query('select public.moderate_campus($1,$2,$3)', [
            b,
            'ban',
            'review',
          ]),
        /Authenticator verification/,
      ),
    'aal1',
  )
  await as('authenticated', b, () =>
    db.exec(
      `update public.profiles set handle='public_member',is_public=true where id='${b}'`,
    ),
  )
  await as('authenticated', admin, () =>
    db.query('select public.moderate_campus($1,$2,$3)', [b, 'ban', 'review']),
  )
  await as('authenticated', b, () =>
    db.exec(`update public.profiles set bio='spam' where id='${b}'`),
  )
  assert.notEqual(
    (await db.query(`select bio from public.profiles where id='${b}'`)).rows[0]
      .bio,
    'spam',
  )
  await as('authenticated', b, () =>
    assert.rejects(
      () =>
        db.exec(
          `insert into public.photos(location_id,author_id,storage_path,caption,width,height) values('canteen','${b}','${b}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.webp','Spam',100,100)`,
        ),
      /row-level security/,
    ),
  )
  assert.equal(
    (
      await as('anon', null, () =>
        db.query(`select id from public.profiles where id='${b}'`),
      )
    ).rows.length,
    0,
  )
})
