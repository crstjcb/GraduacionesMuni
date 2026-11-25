-- GRADUACIÓN CHINAUTLA 2026
-- Ejecutar desde Supabase > SQL Editor > New query.
-- IMPORTANTE: Las fotos son PÚBLICAS para que los padres puedan descargarlas.
-- Solo usuarios de app_admins pueden agregar, editar o borrar datos y archivos.

create extension if not exists pgcrypto;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

revoke all on public.app_admins from anon, authenticated;
alter table public.app_admins enable row level security;

-- Esta función solo responde sí/no respecto al usuario autenticado.
-- Nunca recibe un email, contraseña ni UID del visitante.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('08', '11', '14', '17', 'destacados')),
  filename text not null,
  storage_path text not null unique,
  thumb_path text,
  mime_type text not null,
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists photos_section_order_idx on public.photos (section, created_at desc, id desc);

alter table public.photos enable row level security;
grant select on public.photos to anon, authenticated;
grant insert, update, delete on public.photos to authenticated;

drop policy if exists "Fotos visibles por todos" on public.photos;
create policy "Fotos visibles por todos"
on public.photos for select to anon, authenticated using (true);

drop policy if exists "Solo administradores insertan fotos" on public.photos;
create policy "Solo administradores insertan fotos"
on public.photos for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "Solo administradores editan fotos" on public.photos;
create policy "Solo administradores editan fotos"
on public.photos for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Solo administradores eliminan fotos" on public.photos;
create policy "Solo administradores eliminan fotos"
on public.photos for delete to authenticated
using ((select public.is_admin()));

-- Bucket público: las fotografías se pueden abrir desde cualquier celular.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'graduacion-fotos', 'graduacion-fotos', true, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Los permisos sobre los archivos se verifican en Supabase; NO en JavaScript.
drop policy if exists "Admin lee objetos de graduacion" on storage.objects;
create policy "Admin lee objetos de graduacion" on storage.objects
for select to authenticated using (
  bucket_id = 'graduacion-fotos' and (select public.is_admin())
);

drop policy if exists "Admin sube objetos de graduacion" on storage.objects;
create policy "Admin sube objetos de graduacion" on storage.objects
for insert to authenticated with check (
  bucket_id = 'graduacion-fotos' and (select public.is_admin())
);

drop policy if exists "Admin cambia objetos de graduacion" on storage.objects;
create policy "Admin cambia objetos de graduacion" on storage.objects
for update to authenticated using (
  bucket_id = 'graduacion-fotos' and (select public.is_admin())
) with check (
  bucket_id = 'graduacion-fotos' and (select public.is_admin())
);

drop policy if exists "Admin elimina objetos de graduacion" on storage.objects;
create policy "Admin elimina objetos de graduacion" on storage.objects
for delete to authenticated using (
  bucket_id = 'graduacion-fotos' and (select public.is_admin())
);
