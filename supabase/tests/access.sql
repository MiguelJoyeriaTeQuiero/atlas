-- Run as the project administrator. Fixtures and changes are rolled back.

begin;
insert into auth.users(id,email) values
 ('fffffff1-ffff-4fff-8fff-fffffffffff1','atlas-test-admin-a@example.invalid'),
 ('fffffff2-ffff-4fff-8fff-fffffffffff2','atlas-test-director@example.invalid'),
 ('fffffff3-ffff-4fff-8fff-fffffffffff3','atlas-test-admin-b@example.invalid');
insert into public.atlas_workspaces(id,name) values
 ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','ATLAS test A'),
 ('bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1','ATLAS test B');
insert into public.atlas_memberships(workspace_id,user_id,role) values
 ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','fffffff1-ffff-4fff-8fff-fffffffffff1','admin'),
 ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','fffffff2-ffff-4fff-8fff-fffffffffff2','director'),
 ('bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1','fffffff3-ffff-4fff-8fff-fffffffffff3','admin');
insert into public.atlas_records(workspace_id,id,kind,data)
select w,'00000000-0000-4000-8000-000000000001','settings',
 '{"weights":{"time":30,"cost":22,"errors":16,"speed":10,"trace":8,"decisions":6,"sales":5,"service":3},"currency":"EUR","monthlyHoursPerFte":160,"aiEnabled":false,"initiativeName":"ATLAS","organizationName":"Test"}'::jsonb
from unnest(array['aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid]) w;
set local role authenticated;
set local request.jwt.claims = '{"sub":"fffffff1-ffff-4fff-8fff-fffffffffff1","role":"authenticated"}';
do $test$
declare result jsonb; denied boolean; settings jsonb;
begin
  assert (select count(*) from public.atlas_records)=1, 'Administrator workspace isolation failed';
  select data into settings from public.atlas_records where kind='settings';
  result := public.atlas_put_record('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','settings',settings,1);
  assert result->>'revision'='2', 'Administrator update failed';
  denied := false;
  begin
    perform public.atlas_put_record('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','settings',settings,1);
  exception when serialization_failure then denied := true;
  end;
  assert denied, 'Stale revision accepted';
  denied := false;
  begin
    perform public.atlas_put_record('bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1','00000000-0000-4000-8000-000000000001','settings',settings,1);
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'Cross-workspace write allowed';
  denied := false;
  begin
    insert into public.atlas_memberships values ('bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1','fffffff1-ffff-4fff-8fff-fffffffffff1','admin',now());
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'Self-enrollment allowed';
  denied := false;
  begin
    perform public.atlas_import_records('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '[{"id":"ccccccc1-cccc-4ccc-8ccc-ccccccccccc1","kind":"session","data":{"id":"ccccccc1-cccc-4ccc-8ccc-ccccccccccc1","company":"JTQ","departmentId":"it","title":"Test","date":"2026-11-04","owner":"Test","notes":"","createdAt":"2026-11-04","updatedAt":"2026-11-04","participants":[],"processIds":[],"status":"planned"}},{"id":"ccccccc2-cccc-4ccc-8ccc-ccccccccccc2","kind":"session","data":{"id":"ccccccc2-cccc-4ccc-8ccc-ccccccccccc2"}}]'::jsonb);
  exception when raise_exception then denied := true;
  end;
  assert denied, 'Invalid import accepted';
  assert (select count(*) from public.atlas_records where kind='session')=0, 'Import not atomic';
  assert (select count(*) from public.atlas_audit_log where workspace_id='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1')=2, 'Audit missing';
end $test$;
set local request.jwt.claims = '{"sub":"fffffff2-ffff-4fff-8fff-fffffffffff2","role":"authenticated"}';
do $test$
declare denied boolean := false;
begin
  assert (select count(*) from public.atlas_records)=1, 'Director cannot read';
  begin
    perform public.atlas_put_record('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','settings','{}'::jsonb,2);
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'Director write allowed';
end $test$;
set local request.jwt.claims = '{"sub":"ddddddd1-dddd-4ddd-8ddd-ddddddddddd1","role":"authenticated"}';
do $test$
begin
  assert (select count(*) from public.atlas_workspaces)=0, 'Non-member sees workspaces';
  assert (select count(*) from public.atlas_records)=0, 'Non-member sees records';
  assert (select count(*) from public.atlas_audit_log)=0, 'Non-member sees audit';
end $test$;
reset role;
set local role anon;
do $test$
declare denied boolean := false;
begin
  begin
    perform 1 from public.atlas_records;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'Anonymous read allowed';
  assert not has_function_privilege('anon','public.atlas_put_record(uuid,uuid,text,jsonb,integer)','execute'), 'Anonymous RPC allowed';
end $test$;
reset role;
do $test$
begin
  assert (select not public from storage.buckets where id='atlas-evidence'), 'Bucket is public';
  assert (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('atlas_workspaces','atlas_memberships','atlas_records','atlas_audit_log') and c.relrowsecurity)=4, 'RLS missing';
  assert not has_function_privilege('authenticated','public.atlas_validate_record(uuid,uuid,text,jsonb)','execute'), 'Internal validation exposed';
  assert not has_function_privilege('authenticated','public.atlas_audit_record()','execute'), 'Internal audit exposed';
end $test$;
select 'PASS: admin, director, outsider, anonymous, revisions, atomic import, audit, private bucket and RLS' as result;
rollback;

