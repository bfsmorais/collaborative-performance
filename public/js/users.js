import { supabase } from './supabase.js';

export async function getUserDetails(userId) {
  if (!userId) throw new Error('userId em falta');

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, city, main_instrument, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) throw new Error('Utilizador não encontrado');

  const { data: contribsRows, error: cErr } = await supabase
    .from('contributions')
    .select(`
      type, instrument, created_at,
      song:songs!contributions_song_id_fkey(id, title, status, created_by)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (cErr) throw cErr;

  const { data: createdRows, error: sErr } = await supabase
    .from('songs')
    .select('id, title, status, created_at')
    .eq('created_by', userId);
  if (sErr) throw sErr;

  // Agrega por canção: cada entrada da lista corresponde a uma canção,
  // com um array de "tags" (instrumentos contribuídos + 'letra' + 'criador')
  const songMap = new Map();

  (createdRows || []).forEach(s => {
    songMap.set(s.id, {
      id: s.id,
      title: s.title,
      status: s.status,
      tags: ['criador'],
    });
  });

  (contribsRows || []).forEach(c => {
    if (!c.song) return;
    const existing = songMap.get(c.song.id) || {
      id: c.song.id,
      title: c.song.title,
      status: c.song.status,
      tags: [],
    };
    if (c.type === 'audio') {
      existing.tags.push(c.instrument || 'instrumento');
    } else if (c.type === 'lyrics') {
      existing.tags.push('letra');
    }
    songMap.set(c.song.id, existing);
  });

  const songs = Array.from(songMap.values());

  return {
    ...profile,
    contributionCount: (contribsRows || []).length,
    songCount: songs.length,
    songs,
  };
}
