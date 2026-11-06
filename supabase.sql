
create extension if not exists pgcrypto;

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    role text default 'user'
);

create table public.projects (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid references public.profiles(id),
    title text not null,
    type text not null,
    description text,
    file_path text not null,
    cover_url text,
    status text default 'pending',
    download_count bigint default 0,
    created_at timestamptz default now()
);

create table public.download_events (
    id bigint generated always as identity primary key,
    project_id uuid references public.projects(id),
    created_at timestamptz default now()
);

create or replace function public.new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into profiles(id,email)
    values(new.id,new.email);
    return new;
end;
$$;

create trigger create_profile
after insert on auth.users
for each row execute procedure public.new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.download_events enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path=public
as $$
select exists(
    select 1 from profiles
    where id=auth.uid() and role='admin'
);
$$;

create policy "read profiles"
on profiles for select to authenticated
using(id=auth.uid() or is_admin());

create policy "public projects"
on projects for select to anon,authenticated
using(status='approved' or owner_id=auth.uid() or is_admin());

create policy "submit projects"
on projects for insert to authenticated
with check(owner_id=auth.uid() and status='pending');

create policy "admin update projects"
on projects for update to authenticated
using(is_admin()) with check(is_admin());

create or replace function public.register_download(
    p_project_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin

    update projects
    set download_count=download_count+1
    where id=p_project_id and status='approved';

    if not found then
        raise exception 'Proyecto no disponible';
    end if;

    insert into download_events(project_id)
    values(p_project_id);

end;
$$;

revoke all on function public.register_download(uuid)
from public,anon,authenticated;

grant execute on function public.register_download(uuid)
to service_role;

create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
security definer
set search_path=public
as $$
begin

    if not is_admin() then
        raise exception 'No autorizado';
    end if;

    return json_build_object(
        'projects',(select count(*) from projects),
        'pending',(select count(*) from projects where status='pending'),
        'downloads',(select count(*) from download_events)
    );

end;
$$;

grant execute on function public.admin_dashboard_stats()
to authenticated;

-- BIBLIOTECAS DE ARCHIVOS

insert into storage.buckets
(id,name,public,file_size_limit,allowed_mime_types)
values
(
'store-files',
'store-files',
false,
52428800,
array[
'application/vnd.android.package-archive',
'application/zip',
'application/x-zip-compressed',
'text/html',
'application/octet-stream'
]
),
(
'store-images',
'store-images',
true,
5242880,
array['image/png','image/jpeg','image/webp']
)
on conflict(id) do nothing;

create policy "upload own files"
on storage.objects for insert to authenticated
with check(
bucket_id='store-files'
and (storage.foldername(name))[1]=auth.uid()::text
);

create policy "upload own images"
on storage.objects for insert to authenticated
with check(
bucket_id='store-images'
and (storage.foldername(name))[1]=auth.uid()::text
);

create policy "delete own files"
on storage.objects for delete to authenticated
using(
bucket_id in ('store-files','store-images')
and (storage.foldername(name))[1]=auth.uid()::text
);

create policy "read images"
on storage.objects for select to anon,authenticated
using(bucket_id='store-images');

-- DESPUÉS DE REGISTRAR TU CUENTA:
-- Ejecuta sustituyendo tu correo:
-- update profiles set role='admin'
-- where email='TU_CORREO';
