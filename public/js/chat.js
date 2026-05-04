import { supabase } from './supabase.js';

export async function listMessages(songId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(`
      id, message, created_at, user_id,
      author:profiles!chat_messages_user_id_fkey(username, display_name)
    `)
    .eq('song_id', songId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function sendMessage(songId, text) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Não autenticado');
  if (!text?.trim()) throw new Error('Mensagem vazia');

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ song_id: songId, user_id: user.id, message: text.trim() })
    .select(`
      id, message, created_at, user_id,
      author:profiles!chat_messages_user_id_fkey(username, display_name)
    `)
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToMessages(songId, onNewMessage) {
  const channel = supabase
    .channel(`chat-${songId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `song_id=eq.${songId}`,
    }, async (payload) => {
      const { data } = await supabase
        .from('chat_messages')
        .select(`
          id, message, created_at, user_id,
          author:profiles!chat_messages_user_id_fkey(username, display_name)
        `)
        .eq('id', payload.new.id)
        .single();
      if (data) onNewMessage(data);
    })
    .subscribe();

  return channel;
}

export async function unsubscribe(channel) {
  if (channel) await supabase.removeChannel(channel);
}
