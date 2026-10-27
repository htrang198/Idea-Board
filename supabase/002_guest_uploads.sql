-- Guest uploads: anyone can add without an account (Supabase anonymous sign-in).
-- Members (Google or email) can edit and delete anything; guests only what they added themselves.
-- Run once in Supabase > SQL Editor, then turn on Authentication > Sign In / Providers > "Allow anonymous sign-ins".

create or replace function public.is_member() returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
$$;

drop policy if exists "folders write" on public.folders;
drop policy if exists "folders insert" on public.folders;
drop policy if exists "folders change" on public.folders;
drop policy if exists "folders remove" on public.folders;
create policy "folders insert" on public.folders for insert to authenticated with check (true);
create policy "folders change" on public.folders for update to authenticated using (public.is_member() or created_by = auth.uid()) with check (true);
create policy "folders remove" on public.folders for delete to authenticated using (public.is_member() or created_by = auth.uid());

drop policy if exists "items write" on public.items;
drop policy if exists "items insert" on public.items;
drop policy if exists "items change" on public.items;
drop policy if exists "items remove" on public.items;
create policy "items insert" on public.items for insert to authenticated with check (created_by = auth.uid());
create policy "items change" on public.items for update to authenticated using (public.is_member() or created_by = auth.uid()) with check (true);
create policy "items remove" on public.items for delete to authenticated using (public.is_member() or created_by = auth.uid());

drop policy if exists "media delete" on storage.objects;
create policy "media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (public.is_member() or owner_id = auth.uid()::text));
