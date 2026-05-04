import { supabase } from './supabase.js';
import { AUDIO_BUCKET } from './config.js';

export async function listSongs(filters = {}) {
  let query = supabase
    .from('songs')
    .select(`
      id, title, status, created_at, album_id,
      created_by,
      creator:profiles!songs_created_by_fkey(username, display_name, city, main_instrument),
      contributions(id, type, instrument, user_id, audio_path, lyrics_text,
        author:profiles!contributions_user_id_fkey(username, display_name))
    `)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.albumId) query = query.eq('album_id', filters.albumId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(enrichSong).filter(s => applyClientFilters(s, filters));
}

function enrichSong(s) {
  const audios = (s.contributions || []).filter(c => c.type === 'audio');
  const lyrics = (s.contributions || []).filter(c => c.type === 'lyrics');
  const instruments = [...new Set(audios.map(a => a.instrument).filter(Boolean))];
  const participants = new Set();
  (s.contributions || []).forEach(c => c.user_id && participants.add(c.user_id));
  if (s.created_by) participants.add(s.created_by);

  return {
    ...s,
    audioCount: audios.length,
    hasLyrics: lyrics.length > 0,
    instruments,
    participantCount: participants.size,
    missingInstrument: audios.length < 2,
    missingLyrics: lyrics.length === 0,
  };
}

function applyClientFilters(song, filters) {
  if (filters.missingInstrument && !song.missingInstrument) return false;
  if (filters.missingLyrics && !song.missingLyrics) return false;
  if (filters.instrument && !song.instruments.includes(filters.instrument)) return false;
  return true;
}

export async function getSong(id) {
  const { data, error } = await supabase
    .from('songs')
    .select(`
      id, title, status, created_at, album_id, created_by,
      creator:profiles!songs_created_by_fkey(username, display_name, city, main_instrument),
      contributions(id, type, instrument, audio_path, lyrics_text, user_id, created_at,
        author:profiles!contributions_user_id_fkey(username, display_name))
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return enrichSong(data);
}

export async function updateSongTitle(songId, newTitle) {
  if (!newTitle?.trim()) throw new Error('Título não pode estar vazio');
  const { data, error } = await supabase
    .from('songs')
    .update({ title: newTitle.trim(), updated_at: new Date().toISOString() })
    .eq('id', songId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createSong(title) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Não autenticado');

  const { data: album } = await supabase
    .from('albums')
    .select('id')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('songs')
    .insert({ title, created_by: user.id, album_id: album?.id || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addAudioContribution(songId, instrument, file) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Não autenticado');

  const ext = file.name.split('.').pop();
  const path = `${songId}/${user.id}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from('contributions')
    .insert({
      song_id: songId,
      user_id: user.id,
      type: 'audio',
      instrument,
      audio_path: path,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addLyricsContribution(songId, text) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('contributions')
    .insert({ song_id: songId, user_id: user.id, type: 'lyrics', lyrics_text: text })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function getAudioUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function subscribeToSongChanges(onChange, onContributionInsert) {
  return supabase
    .channel('songs-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, (payload) => {
      onChange(payload);
      if (payload.eventType === 'INSERT' && onContributionInsert) {
        onContributionInsert(payload.new);
      }
    })
    .subscribe();
}
