-- Adiciona 8 canções ao álbum activo, com contributos variados.
-- Pré-requisito: os 3 utilizadores demo (tomas, sofia, joao) já registados.
-- Os audio_path são fictícios (não há ficheiros reais nos buckets) — a UI funciona,
-- só os players ficam silenciosos.

do $$
declare
  v_album uuid;
  v_tomas uuid;
  v_sofia uuid;
  v_joao  uuid;
  v_song  uuid;
begin
  select id into v_album from albums where status = 'active' limit 1;
  select id into v_tomas from profiles where username = 'tomas';
  select id into v_sofia from profiles where username = 'sofia';
  select id into v_joao  from profiles where username = 'joao';

  if v_album is null or v_tomas is null or v_sofia is null or v_joao is null then
    raise exception 'Falta álbum activo ou um dos utilizadores demo (tomas, sofia, joao)';
  end if;

  -- 1) Lisboa Velha — sofia cria, mistura completa
  insert into songs (title, album_id, created_by) values ('Lisboa Velha', v_album, v_sofia) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_tomas, 'audio', 'guitar', 'demo/lisboa-guitar.mp3'),
    (v_song, v_joao,  'audio', 'drums',  'demo/lisboa-drums.mp3'),
    (v_song, v_sofia, 'audio', 'vocal',  'demo/lisboa-vocal.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_sofia, 'lyrics', E'Vento na rua antiga\nA cidade não dorme\nUm passo de cada vez');

  -- 2) Atlântico Norte — joao cria, instrumental
  insert into songs (title, album_id, created_by) values ('Atlântico Norte', v_album, v_joao) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_joao,  'audio', 'drums',  'demo/atlantico-drums.mp3'),
    (v_song, v_sofia, 'audio', 'piano',  'demo/atlantico-piano.mp3'),
    (v_song, v_tomas, 'audio', 'bass',   'demo/atlantico-bass.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_tomas, 'lyrics', E'Marés mudam\nNada fica na mesma\nO horizonte chama');

  -- 3) Janelas Abertas — tomas cria, folk acústico
  insert into songs (title, album_id, created_by) values ('Janelas Abertas', v_album, v_tomas) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_tomas, 'audio', 'guitar', 'demo/janelas-guitar.mp3'),
    (v_song, v_sofia, 'audio', 'vocal',  'demo/janelas-vocal.mp3'),
    (v_song, v_joao,  'audio', 'other',  'demo/janelas-percussion.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_sofia, 'lyrics', E'Janelas abertas para o sol\nDias longos sem pressa\nA luz entra devagar');

  -- 4) A Casa dos Meus Avós — sofia cria, balada
  insert into songs (title, album_id, created_by) values ('A Casa dos Meus Avós', v_album, v_sofia) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_sofia, 'audio', 'vocal',  'demo/avos-vocal.mp3'),
    (v_song, v_tomas, 'audio', 'piano',  'demo/avos-piano.mp3'),
    (v_song, v_joao,  'audio', 'bass',   'demo/avos-bass.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_sofia, 'lyrics', E'A casa onde brincava\nAinda guarda os meus passos\nNo soalho de madeira');

  -- 5) Nuvem Vermelha — tomas cria, rock
  insert into songs (title, album_id, created_by) values ('Nuvem Vermelha', v_album, v_tomas) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_tomas, 'audio', 'guitar', 'demo/nuvem-guitar.mp3'),
    (v_song, v_joao,  'audio', 'drums',  'demo/nuvem-drums.mp3'),
    (v_song, v_sofia, 'audio', 'vocal',  'demo/nuvem-vocal.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_joao, 'lyrics', E'Nuvem vermelha no fim da tarde\nO céu pinta-se de adeus\nE a cidade respira fundo');

  -- 6) Outono em Coimbra — joao cria, acústico
  insert into songs (title, album_id, created_by) values ('Outono em Coimbra', v_album, v_joao) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_joao,  'audio', 'guitar', 'demo/outono-guitar.mp3'),
    (v_song, v_sofia, 'audio', 'vocal',  'demo/outono-vocal.mp3'),
    (v_song, v_tomas, 'audio', 'piano',  'demo/outono-piano.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_sofia, 'lyrics', E'As folhas caem na Sé Velha\nO Mondego corre devagar\nOutono dura um momento');

  -- 7) Comboio das Cinco — sofia cria, synth-pop
  insert into songs (title, album_id, created_by) values ('Comboio das Cinco', v_album, v_sofia) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_sofia, 'audio', 'vocal',  'demo/comboio-vocal.mp3'),
    (v_song, v_tomas, 'audio', 'piano',  'demo/comboio-piano.mp3'),
    (v_song, v_joao,  'audio', 'drums',  'demo/comboio-drums.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_sofia, 'lyrics', E'Comboio das cinco\nLevou mais um adeus\nFica só o som dos carris');

  -- 8) Estrela do Norte — tomas cria, fusão
  insert into songs (title, album_id, created_by) values ('Estrela do Norte', v_album, v_tomas) returning id into v_song;
  insert into contributions (song_id, user_id, type, instrument, audio_path) values
    (v_song, v_tomas, 'audio', 'guitar', 'demo/estrela-guitar.mp3'),
    (v_song, v_sofia, 'audio', 'vocal',  'demo/estrela-vocal.mp3'),
    (v_song, v_joao,  'audio', 'drums',  'demo/estrela-drums.mp3');
  insert into contributions (song_id, user_id, type, lyrics_text) values
    (v_song, v_tomas, 'lyrics', E'Segue a estrela do norte\nQuando todas as outras se apagam\nE encontra o caminho de volta');

  raise notice '✓ 8 canções adicionadas ao álbum activo';
end $$;
