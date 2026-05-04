import { supabase } from './supabase.js';

const COVERS_BUCKET = 'covers';

export async function getActiveAlbum() {
  const { data, error } = await supabase
    .from('albums')
    .select('*')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  // Sem álbum activo — cria automaticamente para a aplicação não bloquear
  const { data: created, error: insErr } = await supabase
    .from('albums')
    .insert({ name: 'Volume I', status: 'active' })
    .select()
    .single();
  if (insErr) throw insErr;
  return created;
}

export async function getAlbumDetails(albumId) {
  const { data: album, error: albumErr } = await supabase
    .from('albums')
    .select('*')
    .eq('id', albumId)
    .single();
  if (albumErr) throw albumErr;

  const { data: songs, error: songsErr } = await supabase
    .from('songs')
    .select(`
      id, title, status, created_at,
      created_by,
      creator:profiles!songs_created_by_fkey(id, username, display_name, city, main_instrument),
      contributions(user_id, type, instrument,
        author:profiles!contributions_user_id_fkey(id, username, display_name, city, main_instrument))
    `)
    .eq('album_id', albumId)
    .order('created_at', { ascending: true });
  if (songsErr) throw songsErr;

  // Compositores únicos = criadores + contribuintes
  const composersMap = new Map();
  (songs || []).forEach(s => {
    if (s.creator?.id) composersMap.set(s.creator.id, { ...s.creator, contributions: 0 });
    (s.contributions || []).forEach(c => {
      if (c.author?.id) {
        const existing = composersMap.get(c.author.id);
        if (existing) {
          existing.contributions += 1;
        } else {
          composersMap.set(c.author.id, { ...c.author, contributions: 1 });
        }
      }
    });
  });
  const composers = Array.from(composersMap.values())
    .sort((a, b) => b.contributions - a.contributions);

  return { ...album, songs: songs || [], composers };
}

export async function updateAlbumCover(albumId, file) {
  if (!file.type.startsWith('image/')) throw new Error('Apenas imagens são permitidas');
  const ext = file.name.split('.').pop();
  const path = `${albumId}/cover-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from('albums')
    .update({ cover_path: path })
    .eq('id', albumId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAlbumName(albumId, name) {
  if (!name?.trim()) throw new Error('Nome não pode estar vazio');
  const { data, error } = await supabase
    .from('albums')
    .update({ name: name.trim() })
    .eq('id', albumId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function getAlbumCoverUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function listAllAlbums() {
  const { data: albums, error } = await supabase
    .from('albums')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const enriched = await Promise.all((albums || []).map(async (album) => {
    const details = await getAlbumDetails(album.id);
    return details;
  }));
  return enriched;
}

export async function closeAlbum(albumId, bandName) {
  if (!bandName?.trim()) throw new Error('Nome da banda em falta');
  const { data, error } = await supabase
    .from('albums')
    .update({
      status: 'closed',
      band_name: bandName.trim(),
      closed_at: new Date().toISOString(),
    })
    .eq('id', albumId)
    .select()
    .single();
  if (error) throw error;

  // Calcular nome do próximo álbum
  const { data: existing } = await supabase
    .from('albums')
    .select('name')
    .order('created_at', { ascending: false });
  const next = nextVolumeName(existing || []);

  // Cria o próximo álbum activo
  const { data: newAlbum, error: insErr } = await supabase
    .from('albums')
    .insert({ name: next, status: 'active' })
    .select()
    .single();
  if (insErr) throw insErr;

  return { closed: data, opened: newAlbum };
}

function nextVolumeName(albums) {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const used = new Set();
  albums.forEach(a => {
    const m = (a.name || '').match(/^Volume\s+(.+)$/i);
    if (m) used.add(m[1].trim().toUpperCase());
  });
  for (const r of romans) {
    if (!used.has(r)) return `Volume ${r}`;
  }
  return `Volume ${albums.length + 1}`;
}
