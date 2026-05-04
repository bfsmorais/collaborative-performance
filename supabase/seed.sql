-- Collaborative Performance — Seed Data
-- Corre este script DEPOIS do schema.sql E DEPOIS de teres registado os 3 utilizadores demo
-- (tomas@demo.pt, sofia@demo.pt, joao@demo.pt — todos com password demo1234)

-- 1) Álbum activo
insert into albums (id, name, status)
values ('00000000-0000-0000-0000-000000000001', 'Volume I', 'active')
on conflict (id) do nothing;

-- 2) Actualizar profiles (cidade + instrumento principal) para os 3 utilizadores demo
-- Nota: o trigger handle_new_user() já criou os profiles; aqui só enriquecemos.

update profiles set
  display_name = 'Tomás',
  city = 'Porto',
  main_instrument = 'guitar'
where username = 'tomas';

update profiles set
  display_name = 'Sofia',
  city = 'Lisboa',
  main_instrument = 'vocal'
where username = 'sofia';

update profiles set
  display_name = 'João',
  city = 'Coimbra',
  main_instrument = 'drums'
where username = 'joao';

-- 3) Canções de exemplo
-- (precisa de pelo menos um utilizador registado; usa o id do Tomás como criador padrão)

do $$
declare
  v_tomas uuid;
  v_sofia uuid;
  v_joao uuid;
  v_album uuid := '00000000-0000-0000-0000-000000000001';
  v_song1 uuid;
  v_song2 uuid;
begin
  select id into v_tomas from profiles where username = 'tomas' limit 1;
  select id into v_sofia from profiles where username = 'sofia' limit 1;
  select id into v_joao from profiles where username = 'joao' limit 1;

  if v_tomas is null then
    raise notice 'Utilizadores demo ainda não foram registados — salta seed das canções';
    return;
  end if;

  -- Canção 1 — só guitarra do Tomás (estado: em desenvolvimento)
  insert into songs (id, title, album_id, created_by)
  values (gen_random_uuid(), 'Manhã no Douro', v_album, v_tomas)
  returning id into v_song1;

  insert into contributions (song_id, user_id, type, instrument, audio_path)
  values (v_song1, v_tomas, 'audio', 'guitar', 'demo/manha-douro-guitar.mp3');

  -- Canção 2 — guitarra + bateria + letra (estado: completa)
  insert into songs (id, title, album_id, created_by)
  values (gen_random_uuid(), 'Sinal de Fumo', v_album, v_sofia)
  returning id into v_song2;

  insert into contributions (song_id, user_id, type, instrument, audio_path)
  values
    (v_song2, v_tomas, 'audio', 'guitar', 'demo/sinal-fumo-guitar.mp3'),
    (v_song2, v_joao, 'audio', 'drums', 'demo/sinal-fumo-drums.mp3');

  insert into contributions (song_id, user_id, type, lyrics_text)
  values (v_song2, v_sofia, 'lyrics',
    E'Sinal de fumo na varanda\nUm dia que se vai e fica\n...');
end $$;
