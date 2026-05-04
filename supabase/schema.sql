-- Collaborative Performance — Schema
-- Corre este script no Supabase SQL Editor antes de qualquer outro

-- ============================================================
-- TABELAS
-- ============================================================

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text,
  city text,
  main_instrument text,
  created_at timestamptz default now()
);

create table albums (
  id uuid primary key default gen_random_uuid(),
  name text,
  band_name text,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz default now(),
  closed_at timestamptz
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  album_id uuid references albums(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references songs(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete set null,
  type text not null check (type in ('audio', 'lyrics')),
  instrument text,
  audio_path text,
  lyrics_text text,
  created_at timestamptz default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references songs(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete set null,
  message text not null,
  created_at timestamptz default now()
);

-- Índices úteis
create index idx_songs_status on songs(status);
create index idx_songs_album on songs(album_id);
create index idx_contributions_song on contributions(song_id);
create index idx_chat_song on chat_messages(song_id, created_at);

-- ============================================================
-- TRIGGER: auto-criar profile quando user regista
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TRIGGER: marcar canção completa quando 2 instrumentos + 1 letra
-- ============================================================

create or replace function public.update_song_status()
returns trigger
language plpgsql
as $$
declare
  v_song_id uuid;
  v_audio_count int;
  v_lyrics_count int;
begin
  v_song_id := coalesce(new.song_id, old.song_id);

  select
    count(*) filter (where type = 'audio'),
    count(*) filter (where type = 'lyrics')
  into v_audio_count, v_lyrics_count
  from contributions
  where song_id = v_song_id;

  update songs
    set status = case
      when v_audio_count >= 2 and v_lyrics_count >= 1 then 'complete'
      else 'in_progress'
    end,
    updated_at = now()
  where id = v_song_id;

  return new;
end;
$$;

create trigger on_contribution_change
  after insert or update or delete on contributions
  for each row execute function public.update_song_status();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table albums enable row level security;
alter table songs enable row level security;
alter table contributions enable row level security;
alter table chat_messages enable row level security;

-- Profiles: leitura pública para users autenticados; user gere o seu
create policy "profiles_read_all"
  on profiles for select to authenticated using (true);
create policy "profiles_insert_own"
  on profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own"
  on profiles for update to authenticated using (auth.uid() = id);

-- Albums: leitura pública
create policy "albums_read_all"
  on albums for select to authenticated using (true);
create policy "albums_insert_authenticated"
  on albums for insert to authenticated with check (true);
create policy "albums_update_authenticated"
  on albums for update to authenticated using (true);

-- Songs: qualquer autenticado pode ler/criar; só criador altera
create policy "songs_read_all"
  on songs for select to authenticated using (true);
create policy "songs_insert_authenticated"
  on songs for insert to authenticated with check (true);
create policy "songs_update_creator"
  on songs for update to authenticated using (auth.uid() = created_by);
create policy "songs_update_system"
  on songs for update to authenticated using (true);

-- Contributions: leitura pública; user só insere/altera os próprios
create policy "contributions_read_all"
  on contributions for select to authenticated using (true);
create policy "contributions_insert_own"
  on contributions for insert to authenticated with check (auth.uid() = user_id);
create policy "contributions_update_own"
  on contributions for update to authenticated using (auth.uid() = user_id);
create policy "contributions_delete_own"
  on contributions for delete to authenticated using (auth.uid() = user_id);

-- Chat: leitura pública; user só envia em seu nome
create policy "chat_read_all"
  on chat_messages for select to authenticated using (true);
create policy "chat_insert_own"
  on chat_messages for insert to authenticated with check (auth.uid() = user_id);

-- ============================================================
-- REALTIME (presence + chat + alterações de canções)
-- ============================================================

alter publication supabase_realtime add table songs;
alter publication supabase_realtime add table contributions;
alter publication supabase_realtime add table chat_messages;
