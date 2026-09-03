-- Add Pocket Company as a real project company for Pocket operators.
-- Pocket managers already receive ADMIN access through read_bootstrap and the
-- authorization helpers, so no user-specific UUID or membership is seeded.

do $$
declare
  pocket_client_id bigint;
begin
  insert into public.clients (
    legacy_id,
    slug,
    display_name,
    status_code,
    archived_at
  ) values (
    'CLT-POCKET',
    'pocket-company',
    '포켓컴퍼니',
    'ACTIVE',
    null
  )
  on conflict (slug) do update
    set display_name = excluded.display_name,
        status_code = 'ACTIVE',
        archived_at = null
  returning id into pocket_client_id;

  insert into public.projects (
    legacy_id,
    client_id,
    project_name,
    description,
    phase_code,
    status_code,
    start_date,
    end_date,
    client_view_enabled,
    archived_at
  ) values (
    'PRJ-POCKET-INTERNAL-001',
    pocket_client_id,
    '포켓컴퍼니 내부 운영',
    '포켓컴퍼니 내부 마케팅 및 운영 업무',
    'P0',
    'ACTIVE',
    current_date,
    null,
    false,
    null
  )
  on conflict (legacy_id) do update
    set project_name = excluded.project_name,
        description = excluded.description,
        phase_code = excluded.phase_code,
        status_code = 'ACTIVE',
        client_view_enabled = false,
        archived_at = null;
end;
$$;
