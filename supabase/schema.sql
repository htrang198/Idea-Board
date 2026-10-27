-- Brand Idea Board: run once in Supabase > SQL Editor.
-- Everyone can view. Anyone signed in (email + password) can add, edit and delete.

create table if not exists public.folders (
  id text primary key,
  name text not null check (char_length(name) between 1 and 80),
  parent text references public.folders(id) on delete restrict,
  sort int not null default 999,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  folder text not null references public.folders(id) on delete restrict,
  kind text not null check (kind in ('file', 'note', 'link')),
  title text not null default '' check (char_length(title) <= 120),
  note text not null default '' check (char_length(note) <= 20000),
  url text,
  storage_path text,
  content_type text,
  size_bytes bigint,
  file_name text,
  author_email text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists items_folder_idx on public.items(folder);
create index if not exists items_created_idx on public.items(created_at desc);

alter table public.folders enable row level security;
alter table public.items enable row level security;

drop policy if exists "folders read" on public.folders;
drop policy if exists "folders write" on public.folders;
drop policy if exists "items read" on public.items;
drop policy if exists "items write" on public.items;
create policy "folders read" on public.folders for select using (true);
create policy "folders write" on public.folders for all to authenticated using (true) with check (true);
create policy "items read" on public.items for select using (true);
create policy "items write" on public.items for all to authenticated using (true) with check (true);

-- Public bucket for uploads. file_size_limit is per file (free plan max is 50 MB).
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "media read" on storage.objects;
drop policy if exists "media upload" on storage.objects;
drop policy if exists "media delete" on storage.objects;
create policy "media read" on storage.objects for select using (bucket_id = 'media');
create policy "media upload" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "media delete" on storage.objects for delete to authenticated using (bucket_id = 'media');

-- Starting brands
insert into public.folders (id, name, parent, sort) values
  ('canon', 'Canon', null, 1),
  ('tasklet', 'Tasklet', null, 2),
  ('radical-numenics', 'Radical Numenics', null, 3),
  ('canon-cinema', 'Cinema', 'canon', 1),
  ('canon-camera', 'Camera', 'canon', 2),
  ('canon-ivy', 'Ivy', 'canon', 3),
  ('canon-printers', 'Printers', 'canon', 4),
  ('canon-lens', 'Lens', 'canon', 5)
on conflict (id) do nothing;
