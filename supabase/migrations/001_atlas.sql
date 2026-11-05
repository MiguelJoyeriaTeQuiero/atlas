-- ATLAS / migration 001
-- Contract used by the browser store:
-- atlas_memberships(workspace_id,user_id,role); atlas_records(workspace_id,id,kind,data,revision,updated_at).
-- RPC atlas_put_record(uuid,uuid,text,jsonb,int) -> jsonb {revision}; expected_revision=0 creates.
-- RPC atlas_delete_record(uuid,uuid,int) -> boolean. RPC atlas_import_records(uuid,jsonb) -> jsonb.
-- Authentication is not membership. Bootstrap the workspace and its members MANUALLY in the SQL editor.
-- Never ship a service-role key to the browser. Directors can read; only administrators can change records.

create extension if not exists pgcrypto;

create table if not exists public.atlas_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);
create table if not exists public.atlas_memberships (
  workspace_id uuid not null references public.atlas_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','director')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create index if not exists atlas_memberships_user_idx on public.atlas_memberships(user_id);
create table if not exists public.atlas_records (
  workspace_id uuid not null references public.atlas_workspaces(id) on delete cascade,
  id uuid not null,
  kind text not null check (kind in ('process','session','measurement','evidence','settings')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key(workspace_id,id),
  check (octet_length(data::text) <= 1048576),
  check (kind = 'settings' or data ->> 'id' = id::text)
);
create index if not exists atlas_records_workspace_kind_idx on public.atlas_records(workspace_id,kind);
create unique index if not exists atlas_measurement_period_unique on public.atlas_records(workspace_id,(data->>'processId'),(data->>'month')) where kind = 'measurement';
create unique index if not exists atlas_one_settings_per_workspace on public.atlas_records(workspace_id) where kind = 'settings';

alter table public.atlas_workspaces enable row level security;
alter table public.atlas_memberships enable row level security;
alter table public.atlas_records enable row level security;
revoke all on public.atlas_workspaces,public.atlas_memberships,public.atlas_records from anon,authenticated;
grant select on public.atlas_workspaces,public.atlas_memberships,public.atlas_records to authenticated;
-- No client INSERT/UPDATE/DELETE grants and no membership-write policy: no self-enrollment or role elevation.
create policy atlas_own_membership on public.atlas_memberships for select to authenticated using (user_id = (select auth.uid()));
create policy atlas_workspace_read on public.atlas_workspaces for select to authenticated using (
  exists(select 1 from public.atlas_memberships m where m.workspace_id = id and m.user_id = (select auth.uid()))
);
create policy atlas_record_read on public.atlas_records for select to authenticated using (
  exists(select 1 from public.atlas_memberships m where m.workspace_id = atlas_records.workspace_id and m.user_id = (select auth.uid()))
);

-- Validation runs under the RPC owner after explicit membership checks. It does not trust client flags.
create or replace function public.atlas_validate_record(p_workspace_id uuid,p_id uuid,p_kind text,p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_field text;
  v_value jsonb;
  v_reference text;
  v_uuid uuid;
  v_baseline jsonb;
begin
  if p_kind not in ('process','session','measurement','evidence','settings') or p_kind is null then raise exception 'ATLAS_INVALID_KIND'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 1048576 then raise exception 'ATLAS_INVALID_DATA'; end if;
  if p_kind <> 'settings' and (p_data->>'id' is distinct from p_id::text) then raise exception 'ATLAS_ID_MISMATCH'; end if;
  if p_kind = 'settings' and p_id <> '00000000-0000-4000-8000-000000000001'::uuid then raise exception 'ATLAS_SETTINGS_ID'; end if;
  if p_kind in ('process','session') then
    if coalesce(p_data->>'company','') not in ('JTQ','TQM','Ambas') then raise exception 'ATLAS_INVALID_COMPANY'; end if;
    if coalesce(p_data->>'departmentId','') not in ('contabilidad','finanzas','compras','ventas','rrhh','marketing','it','direccion','logistica','tiendas') then raise exception 'ATLAS_INVALID_DEPARTMENT'; end if;
  end if;
  if p_kind = 'process' then
    foreach v_field in array array['name','owner','description','input','output','currentSteps','notes','createdAt','updatedAt'] loop
      if jsonb_typeof(p_data->v_field) is distinct from 'string' then raise exception 'ATLAS_INVALID_TEXT:%',v_field; end if;
    end loop;
    if p_data ? 'aiProposal' and jsonb_typeof(p_data->'aiProposal') is distinct from 'string' then raise exception 'ATLAS_INVALID_AI_PROPOSAL'; end if;
    if p_data ? 'actualImplementationCost' and (jsonb_typeof(p_data->'actualImplementationCost') is distinct from 'number' or (p_data->>'actualImplementationCost')::numeric < 0) then raise exception 'ATLAS_INVALID_ACTUAL_INVESTMENT'; end if;
    if p_data ? 'actualCostSource' and jsonb_typeof(p_data->'actualCostSource') is distinct from 'string' then raise exception 'ATLAS_INVALID_ACTUAL_COST_SOURCE'; end if;
    if p_data ? 'implementationCostValidated' and jsonb_typeof(p_data->'implementationCostValidated') is distinct from 'boolean' then raise exception 'ATLAS_INVALID_ACTUAL_COST_VALIDATION'; end if;
    if p_data->>'implementationCostValidated' = 'true' and (jsonb_typeof(p_data->'actualImplementationCost') is distinct from 'number' or length(btrim(coalesce(p_data->>'actualCostSource',''))) = 0) then raise exception 'ATLAS_ACTUAL_INVESTMENT_SOURCE_REQUIRED'; end if;
    if jsonb_typeof(p_data->'name') is distinct from 'string' then raise exception 'ATLAS_INVALID_PROCESS_NAME'; end if;
    if coalesce(p_data->>'status','') not in ('identified','assessing','approved','pilot','implemented','paused','discarded') then raise exception 'ATLAS_INVALID_STATUS'; end if;
    if coalesce(p_data->>'evidenceLevel','') not in ('estimate','observed','validated') then raise exception 'ATLAS_INVALID_EVIDENCE_LEVEL'; end if;
    foreach v_field in array array['volumePerMonth','minutesPerCase','minutesPerError','reviewMinutesPerCase','hourlyCost','implementationCost','monthlyRunningCost','cashSavingsMonthly'] loop
      v_value := p_data->v_field;
      if jsonb_typeof(v_value) is distinct from 'number' or (v_value::text)::numeric < 0 or (v_value::text)::numeric > 1000000000000 then raise exception 'ATLAS_INVALID_NUMBER:%',v_field; end if;
    end loop;
    if jsonb_typeof(p_data->'peoplePerCase') is distinct from 'number' or (p_data->>'peoplePerCase')::numeric < 1 then raise exception 'ATLAS_INVALID_PEOPLE'; end if;
    foreach v_field in array array['errorRate','automatablePct','adoptionPct','exceptionPct','cashRealizationPct','errorReductionPct'] loop
      v_value := p_data->v_field;
      if jsonb_typeof(v_value) is distinct from 'number' or (v_value::text)::numeric not between 0 and 100 then raise exception 'ATLAS_INVALID_PERCENT:%',v_field; end if;
    end loop;
    foreach v_field in array array['complexity','risk','dataReadiness'] loop
      v_value := p_data->v_field;
      if jsonb_typeof(v_value) is distinct from 'number' or (v_value::text)::numeric not between 1 and 5 then raise exception 'ATLAS_INVALID_LEVEL:%',v_field; end if;
    end loop;
    foreach v_field in array array['time','cost','errors','speed','trace','decisions','sales','service'] loop
      v_value := p_data->'impact'->v_field;
      if jsonb_typeof(v_value) is distinct from 'number' or (v_value::text)::numeric not between 0 and 5 then raise exception 'ATLAS_INVALID_IMPACT:%',v_field; end if;
    end loop;
    if jsonb_typeof(p_data->'systems') is distinct from 'array' then raise exception 'ATLAS_INVALID_SYSTEMS'; end if;
    if exists(select 1 from jsonb_array_elements(p_data->'systems') j where jsonb_typeof(j) <> 'string') then raise exception 'ATLAS_INVALID_SYSTEMS'; end if;
    if p_data ? 'baseline' then
      v_baseline := p_data->'baseline';
      if jsonb_typeof(v_baseline) is distinct from 'object' then raise exception 'ATLAS_INVALID_BASELINE'; end if;
      foreach v_field in array array['volumePerMonth','minutesPerCase','minutesPerError','hourlyCost'] loop
        v_value := v_baseline->v_field;
        if jsonb_typeof(v_value) is distinct from 'number' or (v_value::text)::numeric < 0 then raise exception 'ATLAS_INVALID_BASELINE:%',v_field; end if;
      end loop;
      if jsonb_typeof(v_baseline->'peoplePerCase') is distinct from 'number' or (v_baseline->>'peoplePerCase')::numeric < 1 then raise exception 'ATLAS_INVALID_BASELINE_PEOPLE'; end if;
      if jsonb_typeof(v_baseline->'errorRate') is distinct from 'number' or (v_baseline->>'errorRate')::numeric not between 0 and 100 then raise exception 'ATLAS_INVALID_BASELINE_ERROR'; end if;
      if jsonb_typeof(v_baseline->'validated') is distinct from 'boolean' or jsonb_typeof(v_baseline->'source') is distinct from 'string' then raise exception 'ATLAS_INVALID_BASELINE_SOURCE'; end if;
      if v_baseline->>'validated' = 'true' and length(btrim(v_baseline->>'source')) = 0 then raise exception 'ATLAS_BASELINE_SOURCE_REQUIRED'; end if;
    end if;
  elsif p_kind = 'session' then
    foreach v_field in array array['title','date','owner','notes','createdAt','updatedAt'] loop
      if jsonb_typeof(p_data->v_field) is distinct from 'string' then raise exception 'ATLAS_INVALID_SESSION_TEXT:%',v_field; end if;
    end loop;
    if jsonb_typeof(p_data->'participants') is distinct from 'array' then raise exception 'ATLAS_INVALID_PARTICIPANTS'; end if;
    if exists(select 1 from jsonb_array_elements(p_data->'participants') j where jsonb_typeof(j) <> 'string') then raise exception 'ATLAS_INVALID_PARTICIPANTS'; end if;
    if coalesce(p_data->>'status','') not in ('planned','completed') then raise exception 'ATLAS_INVALID_SESSION_STATUS'; end if;
    if jsonb_typeof(p_data->'processIds') is distinct from 'array' then raise exception 'ATLAS_INVALID_PROCESS_REFERENCES'; end if;
    for v_reference in select jsonb_array_elements_text(p_data->'processIds') loop
      if not exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and r.id::text = v_reference and r.kind = 'process') then raise exception 'ATLAS_UNKNOWN_PROCESS'; end if;
    end loop;
  elsif p_kind = 'measurement' then
    foreach v_field in array array['processId','month','source','notes','createdAt','updatedAt'] loop
      if jsonb_typeof(p_data->v_field) is distinct from 'string' then raise exception 'ATLAS_INVALID_MEASUREMENT_TEXT:%',v_field; end if;
    end loop;
    if not exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and r.id::text = p_data->>'processId' and r.kind = 'process') then raise exception 'ATLAS_UNKNOWN_PROCESS'; end if;
    if coalesce(p_data->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'ATLAS_INVALID_MONTH'; end if;
    foreach v_field in array array['volume','minutesPerCase','errors','minutesPerError','reviewMinutes','runningCost','realCashSaved'] loop
      v_value := p_data->v_field;
      if jsonb_typeof(v_value) is distinct from 'number' or (v_value::text)::numeric < 0 or (v_value::text)::numeric > 1000000000000 then raise exception 'ATLAS_INVALID_MEASUREMENT:%',v_field; end if;
    end loop;
    if jsonb_typeof(p_data->'peoplePerCase') is distinct from 'number' or (p_data->>'peoplePerCase')::numeric < 1 then raise exception 'ATLAS_INVALID_MEASUREMENT_PEOPLE'; end if;
    if (p_data->>'volume')::numeric <> trunc((p_data->>'volume')::numeric) or (p_data->>'errors')::numeric <> trunc((p_data->>'errors')::numeric) then raise exception 'ATLAS_COUNTS_MUST_BE_INTEGERS'; end if;
    if (p_data->>'errors')::numeric > (p_data->>'volume')::numeric then raise exception 'ATLAS_ERRORS_EXCEED_VOLUME'; end if;
    if jsonb_typeof(p_data->'validated') is distinct from 'boolean' or jsonb_typeof(p_data->'source') is distinct from 'string' then raise exception 'ATLAS_INVALID_MEASUREMENT_VALIDATION'; end if;
    if p_data->>'validated' = 'true' and length(btrim(p_data->>'source')) = 0 then raise exception 'ATLAS_MEASUREMENT_SOURCE_REQUIRED'; end if;
  elsif p_kind = 'evidence' then
    foreach v_field in array array['name','description','source','createdAt'] loop
      if jsonb_typeof(p_data->v_field) is distinct from 'string' then raise exception 'ATLAS_INVALID_EVIDENCE_TEXT:%',v_field; end if;
    end loop;
    if coalesce(p_data->>'type','') not in ('document','observation','data','interview') then raise exception 'ATLAS_INVALID_EVIDENCE_TYPE'; end if;
    if jsonb_typeof(p_data->'validated') is distinct from 'boolean' then raise exception 'ATLAS_INVALID_EVIDENCE_VALIDATION'; end if;
    if jsonb_typeof(p_data->'anonymized') is distinct from 'boolean' then raise exception 'ATLAS_ANONYMIZATION_FLAG_REQUIRED'; end if;
    if p_data ? 'size' and (jsonb_typeof(p_data->'size') is distinct from 'number' or (p_data->>'size')::numeric not between 0 and 52428800) then raise exception 'ATLAS_EVIDENCE_SIZE_LIMIT: maximum 50 MiB'; end if;
    if not (p_data ? 'processId' or p_data ? 'sessionId' or p_data ? 'departmentId') then raise exception 'ATLAS_EVIDENCE_LINK_REQUIRED'; end if;
    if p_data ? 'processId' and not exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and r.id::text = p_data->>'processId' and r.kind = 'process') then raise exception 'ATLAS_UNKNOWN_PROCESS'; end if;
    if p_data ? 'sessionId' and not exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and r.id::text = p_data->>'sessionId' and r.kind = 'session') then raise exception 'ATLAS_UNKNOWN_SESSION'; end if;
    if p_data ? 'departmentId' and coalesce(p_data->>'departmentId','') not in ('contabilidad','finanzas','compras','ventas','rrhh','marketing','it','direccion','logistica','tiendas') then raise exception 'ATLAS_INVALID_DEPARTMENT'; end if;
    if p_data ? 'storagePath' and split_part(p_data->>'storagePath','/',1) is distinct from p_workspace_id::text then raise exception 'ATLAS_STORAGE_WORKSPACE_MISMATCH'; end if;
  elsif p_kind = 'settings' then
    foreach v_field in array array['initiativeName','organizationName'] loop
      if jsonb_typeof(p_data->v_field) is distinct from 'string' then raise exception 'ATLAS_INVALID_SETTINGS_TEXT:%',v_field; end if;
    end loop;
    if p_data->>'currency' is distinct from 'EUR' then raise exception 'ATLAS_INVALID_CURRENCY'; end if;
    if jsonb_typeof(p_data->'aiEnabled') is distinct from 'boolean' then raise exception 'ATLAS_INVALID_AI_FLAG'; end if;
    if jsonb_typeof(p_data->'monthlyHoursPerFte') is distinct from 'number' or (p_data->>'monthlyHoursPerFte')::numeric not between 1 and 744 then raise exception 'ATLAS_INVALID_CAPACITY'; end if;
    foreach v_field in array array['time','cost','errors','speed','trace','decisions','sales','service'] loop
      v_value := p_data->'weights'->v_field;
      if jsonb_typeof(v_value) is distinct from 'number' or (v_value::text)::numeric not between 0 and 100 then raise exception 'ATLAS_INVALID_WEIGHT:%',v_field; end if;
    end loop;
  end if;
end $$;
revoke all on function public.atlas_validate_record(uuid,uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.atlas_put_record(p_workspace_id uuid,p_id uuid,p_kind text,p_data jsonb,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_record public.atlas_records%rowtype; v_revision integer; v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists(select 1 from public.atlas_memberships m where m.workspace_id = p_workspace_id and m.user_id = v_actor and m.role = 'admin') then raise exception 'ATLAS_FORBIDDEN' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'ATLAS_INVALID_REVISION'; end if;
  -- Serialize all workspace writes, including multi-record imports and reference checks.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  perform public.atlas_validate_record(p_workspace_id,p_id,p_kind,p_data);
  select * into v_record from public.atlas_records r where r.workspace_id = p_workspace_id and r.id = p_id for update;
  if not found then
    if p_expected_revision <> 0 then raise exception 'ATLAS_CONFLICT: record no longer exists' using errcode = '40001'; end if;
    insert into public.atlas_records(workspace_id,id,kind,data,revision,created_by,updated_by) values (p_workspace_id,p_id,p_kind,p_data,1,v_actor,v_actor);
    v_revision := 1;
  else
    if v_record.revision <> p_expected_revision or p_expected_revision = 0 then raise exception 'ATLAS_CONFLICT: stale revision' using errcode = '40001'; end if;
    if v_record.kind <> p_kind then raise exception 'ATLAS_KIND_IMMUTABLE'; end if;
    if p_kind = 'process' and ((v_record.data->'baseline') - array['source','validated']::text[]) is distinct from ((p_data->'baseline') - array['source','validated']::text[]) and exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and r.kind = 'measurement' and r.data->>'processId' = p_id::text) then raise exception 'ATLAS_BASELINE_LOCKED: measurements already exist'; end if;
    update public.atlas_records set data = p_data,revision = revision + 1,updated_at = now(),updated_by = v_actor where workspace_id = p_workspace_id and id = p_id returning revision into v_revision;
  end if;
  return jsonb_build_object('revision',v_revision);
end $$;
revoke all on function public.atlas_put_record(uuid,uuid,text,jsonb,integer) from public,anon;
grant execute on function public.atlas_put_record(uuid,uuid,text,jsonb,integer) to authenticated;

create or replace function public.atlas_delete_record(p_workspace_id uuid,p_id uuid,p_expected_revision integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_record public.atlas_records%rowtype; v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists(select 1 from public.atlas_memberships m where m.workspace_id = p_workspace_id and m.user_id = v_actor and m.role = 'admin') then raise exception 'ATLAS_FORBIDDEN' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  select * into v_record from public.atlas_records r where r.workspace_id = p_workspace_id and r.id = p_id for update;
  if not found then raise exception 'ATLAS_CONFLICT: record no longer exists' using errcode = '40001'; end if;
  if p_expected_revision is null or v_record.revision <> p_expected_revision then raise exception 'ATLAS_CONFLICT: stale revision' using errcode = '40001'; end if;
  if v_record.kind = 'process' and exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and (
    (r.kind in ('measurement','evidence') and r.data->>'processId' = p_id::text) or
    (r.kind = 'session' and coalesce(r.data->'processIds','[]'::jsonb) ? p_id::text)
  )) then raise exception 'ATLAS_LINKED_RECORDS: unlink sessions, evidence and measurements first'; end if;
  if v_record.kind = 'session' and exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and r.kind = 'evidence' and r.data->>'sessionId' = p_id::text) then raise exception 'ATLAS_LINKED_RECORDS: unlink evidence first'; end if;
  delete from public.atlas_records where workspace_id = p_workspace_id and id = p_id;
  return true;
end $$;
revoke all on function public.atlas_delete_record(uuid,uuid,integer) from public,anon;
grant execute on function public.atlas_delete_record(uuid,uuid,integer) to authenticated;

create or replace function public.atlas_import_records(p_workspace_id uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_item jsonb; v_id uuid; v_kind text; v_count integer := 0; v_order text;
begin
  if v_actor is null or not exists(select 1 from public.atlas_memberships m where m.workspace_id = p_workspace_id and m.user_id = v_actor and m.role = 'admin') then raise exception 'ATLAS_FORBIDDEN' using errcode = '42501'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'ATLAS_INVALID_IMPORT'; end if;
  if jsonb_array_length(p_records) > 5000 or octet_length(p_records::text) > 10485760 then raise exception 'ATLAS_IMPORT_TOO_LARGE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  for v_item in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'ATLAS_INVALID_IMPORT_RECORD'; end if;
    v_kind := v_item->>'kind';
    if v_kind is null or v_kind not in ('process','session','measurement','evidence') then raise exception 'ATLAS_IMPORT_KIND_NOT_ALLOWED'; end if;
    v_id := (v_item->>'id')::uuid;
    if v_id is null or v_item->'data'->>'id' is distinct from v_id::text then raise exception 'ATLAS_IMPORT_ID_MISMATCH'; end if;
    if exists(select 1 from public.atlas_records r where r.workspace_id = p_workspace_id and r.id = v_id) then raise exception 'ATLAS_IMPORT_CONFLICT: existing record ID' using errcode = '40001'; end if;
  end loop;
  if exists(select value->>'id' from jsonb_array_elements(p_records) group by value->>'id' having count(*) > 1) then raise exception 'ATLAS_IMPORT_DUPLICATE_ID'; end if;
  -- References resolve inside the same transaction. Any exception rolls back every insertion.
  foreach v_order in array array['process','session','measurement','evidence'] loop
    for v_item in select value from jsonb_array_elements(p_records) where value->>'kind' = v_order loop
      v_id := (v_item->>'id')::uuid;
      perform public.atlas_validate_record(p_workspace_id,v_id,v_order,v_item->'data');
      insert into public.atlas_records(workspace_id,id,kind,data,revision,created_by,updated_by) values (p_workspace_id,v_id,v_order,v_item->'data',1,v_actor,v_actor);
      v_count := v_count + 1;
    end loop;
  end loop;
  return jsonb_build_object('imported',v_count,'revision',1);
end $$;
revoke all on function public.atlas_import_records(uuid,jsonb) from public,anon;
grant execute on function public.atlas_import_records(uuid,jsonb) to authenticated;

-- Private attachments. No public URLs. Signed URLs must be created under the signed-in user's RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('atlas-evidence','atlas-evidence',false,52428800,array[
  'application/pdf','text/plain','text/csv','application/json',
  'image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif',
  'video/mp4','video/webm','video/quicktime',
  'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict(id) do update set public = false,file_size_limit = excluded.file_size_limit,allowed_mime_types = excluded.allowed_mime_types;
create policy atlas_evidence_read on storage.objects for select to authenticated using (
  bucket_id = 'atlas-evidence' and exists(select 1 from public.atlas_memberships m where m.workspace_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()))
);
create policy atlas_evidence_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'atlas-evidence' and exists(select 1 from public.atlas_memberships m where m.workspace_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role = 'admin')
);
create policy atlas_evidence_update on storage.objects for update to authenticated using (
  bucket_id = 'atlas-evidence' and exists(select 1 from public.atlas_memberships m where m.workspace_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role = 'admin')
) with check (
  bucket_id = 'atlas-evidence' and exists(select 1 from public.atlas_memberships m where m.workspace_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role = 'admin')
);
create policy atlas_evidence_delete on storage.objects for delete to authenticated using (
  bucket_id = 'atlas-evidence' and exists(select 1 from public.atlas_memberships m where m.workspace_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role = 'admin')
);

-- Bootstrap example (run as a Supabase project administrator, replacing IDs with auth.users IDs):
-- insert into public.atlas_workspaces(name) values ('JTQ · TQM') returning id;
-- insert into public.atlas_memberships(workspace_id,user_id,role) values ('WORKSPACE_UUID','AUTH_USER_UUID','admin');
-- Add directors with role='director'. Do not create a public signup-to-membership trigger.
-- Deployment verification must test unauthenticated denial, director write denial, cross-workspace isolation,
-- stale-revision rejection, atomic import rollback, frozen baseline protection and private storage access.

-- Audit records validation/cost provenance changes without copying all interview content into a history table.
create table if not exists public.atlas_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces(id) on delete cascade,
  record_id uuid not null,
  kind text not null,
  action text not null check(action in ('INSERT','UPDATE','DELETE')),
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_revision integer,
  revision integer,
  changed_fields text[] not null,
  validation_before jsonb,
  validation_after jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists atlas_audit_workspace_time_idx on public.atlas_audit_log(workspace_id,occurred_at desc);
alter table public.atlas_audit_log enable row level security;
revoke all on public.atlas_audit_log from anon,authenticated;
grant select on public.atlas_audit_log to authenticated;
create policy atlas_audit_read on public.atlas_audit_log for select to authenticated using (
  exists(select 1 from public.atlas_memberships m where m.workspace_id = atlas_audit_log.workspace_id and m.user_id = (select auth.uid()))
);
create or replace function public.atlas_audit_record()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb; v_fields text[];
begin
  if tg_op <> 'INSERT' then v_before := old.data; end if;
  if tg_op <> 'DELETE' then v_after := new.data; end if;
  select coalesce(array_agg(keys.key order by keys.key),'{}'::text[]) into v_fields from
    (select jsonb_object_keys(v_before) as key union select jsonb_object_keys(v_after) as key) keys
    where (v_before->keys.key) is distinct from (v_after->keys.key);
  insert into public.atlas_audit_log(workspace_id,record_id,kind,action,actor_user_id,previous_revision,revision,changed_fields,validation_before,validation_after)
  values (
    case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'DELETE' then old.kind else new.kind end,
    tg_op,auth.uid(),case when tg_op = 'INSERT' then null else old.revision end,
    case when tg_op = 'DELETE' then null else new.revision end,v_fields,
    jsonb_build_object('baselineSource',v_before#>'{baseline,source}','baselineValidated',v_before#>'{baseline,validated}','actualImplementationCost',v_before->'actualImplementationCost','actualCostSource',v_before->'actualCostSource','implementationCostValidated',v_before->'implementationCostValidated','measurementValidated',v_before->'validated','measurementSource',v_before->'source'),
    jsonb_build_object('baselineSource',v_after#>'{baseline,source}','baselineValidated',v_after#>'{baseline,validated}','actualImplementationCost',v_after->'actualImplementationCost','actualCostSource',v_after->'actualCostSource','implementationCostValidated',v_after->'implementationCostValidated','measurementValidated',v_after->'validated','measurementSource',v_after->'source')
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.atlas_audit_record() from public,anon,authenticated;
create trigger atlas_audit_records after insert or update or delete on public.atlas_records for each row execute function public.atlas_audit_record();

/*
OPTIONAL INTEGRATION TESTS — run separately in a disposable Supabase test project after this migration.
These are prepared tests, not a claim of an executed deployment. All fixtures are rolled back.
Use the SQL editor or pg_prove with a project-administrator connection.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select plan(10);
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
insert into public.atlas_records(workspace_id,id,kind,data) select w,'00000000-0000-4000-8000-000000000001','settings',
 '{"weights":{"time":30,"cost":22,"errors":16,"speed":10,"trace":8,"decisions":6,"sales":5,"service":3},"currency":"EUR","monthlyHoursPerFte":160,"aiEnabled":false,"initiativeName":"ATLAS","organizationName":"Test"}'::jsonb
 from unnest(array['aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid]) w;
set local role authenticated;
set local request.jwt.claims = '{"sub":"fffffff1-ffff-4fff-8fff-fffffffffff1","role":"authenticated"}';
select is((select count(*)::integer from public.atlas_records where workspace_id='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),1,'Administrator reads own workspace');
select is((select count(*)::integer from public.atlas_records where workspace_id='bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),0,'Cross-workspace records remain invisible');
select lives_ok($q$select public.atlas_put_record('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','settings',(select data from public.atlas_records where workspace_id='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and kind='settings'),1)$q$,'Administrator can update with the current revision');
select throws_ok($q$select public.atlas_put_record('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','settings',(select data from public.atlas_records where workspace_id='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and kind='settings'),1)$q$,'40001','ATLAS_CONFLICT: stale revision','Concurrent stale write is rejected');
select throws_ok($q$select public.atlas_put_record('bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1','00000000-0000-4000-8000-000000000001','settings','{}'::jsonb,1)$q$,'42501','ATLAS_FORBIDDEN','Administrator cannot write another workspace');
select throws_ok($q$insert into public.atlas_memberships values ('bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1','fffffff1-ffff-4fff-8fff-fffffffffff1','admin',now())$q$,'42501',null,'Self-enrollment is prohibited');
set local request.jwt.claims = '{"sub":"fffffff2-ffff-4fff-8fff-fffffffffff2","role":"authenticated"}';
select throws_ok($q$select public.atlas_put_record('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','settings','{}'::jsonb,2)$q$,'42501','ATLAS_FORBIDDEN','Director cannot write');
select is((select count(*)::integer from public.atlas_records where workspace_id='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),1,'Director can read authorized workspace');
reset role;
set local role anon;
select throws_ok($q$select * from public.atlas_records$q$,'42501',null,'Anonymous users cannot read records');
reset role;
select is((select public from storage.buckets where id='atlas-evidence'),false,'Evidence bucket is private');
select * from finish();
rollback;
*/
