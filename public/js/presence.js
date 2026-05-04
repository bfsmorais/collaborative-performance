import { supabase } from './supabase.js';

export function joinSongPresence(songId, profile, onUsersChange) {
  if (!profile?.id) return null;

  const channel = supabase.channel(`song-presence-${songId}`, {
    config: { presence: { key: profile.id } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users = Object.values(state).flat();
      onUsersChange(users);
    })
    .on('presence', { event: 'join' }, () => {
      const state = channel.presenceState();
      onUsersChange(Object.values(state).flat());
    })
    .on('presence', { event: 'leave' }, () => {
      const state = channel.presenceState();
      onUsersChange(Object.values(state).flat());
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: profile.id,
          username: profile.username,
          display_name: profile.display_name || profile.username,
          joined_at: new Date().toISOString(),
        });
      }
    });

  return channel;
}

export async function leaveSongPresence(channel) {
  if (!channel) return;
  try {
    await channel.untrack();
    await supabase.removeChannel(channel);
  } catch (e) {
    console.warn('leaveSongPresence error', e);
  }
}
