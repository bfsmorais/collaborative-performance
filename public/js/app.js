import { requireAuth, logout, getCurrentProfile } from './auth.js';
import {
  listSongs,
  createSong,
  updateSongTitle,
  getSong,
  addAudioContribution,
  addLyricsContribution,
  getAudioUrl,
  subscribeToSongChanges,
} from './songs.js';
import { listMessages, sendMessage, subscribeToMessages, unsubscribe } from './chat.js';
import { renderNetwork, destroyNetwork, highlightNode, clearHighlight, pulseEdge } from './network.js';
import { getUserDetails } from './users.js';
import { joinSongPresence, leaveSongPresence } from './presence.js';
import {
  getActiveAlbum,
  getAlbumDetails,
  updateAlbumCover,
  updateAlbumName,
  getAlbumCoverUrl,
  listAllAlbums,
  closeAlbum,
} from './albums.js';

const INSTRUMENTS = ['guitar', 'drums', 'bass', 'vocal', 'piano', 'other'];
const INSTRUMENT_LABEL = {
  guitar: 'Guitarra',
  drums: 'Bateria',
  bass: 'Baixo',
  vocal: 'Voz',
  piano: 'Piano',
  other: 'Outro',
};
const MAX_FILE_MB = 50;

let currentProfile = null;
let currentUserId = null;
let songsCache = [];
let activeAlbumId = null;
let activeChatChannel = null;
let activePresenceChannel = null;
let currentSong = null;
let currentView = 'list';
let currentFilterMode = 'songs';

(async function init() {
  const user = await requireAuth();
  currentUserId = user.id;
  currentProfile = await getCurrentProfile();
  document.getElementById('user-display').textContent =
    currentProfile?.display_name || currentProfile?.username || '';

  bindEvents();
  await refresh();
  subscribeToSongChanges(refresh, (newContribution) => {
    if (currentView === 'network' && newContribution.song_id && newContribution.user_id) {
      // Atrasar para garantir que o nó/edge já está no grafo após o refresh
      setTimeout(() => pulseEdge(newContribution.song_id, newContribution.user_id), 300);
    }
  });
})();

function bindEvents() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logout();
    window.location.href = 'index.html';
  });

  document.getElementById('new-song-btn').addEventListener('click', () => openModal('new-song-modal'));

  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', e => closeModal(e.target.closest('.modal')))
  );

  document.querySelectorAll('.modal').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) closeModal(m); })
  );

  document.getElementById('new-song-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await createSong(fd.get('title'));
      e.target.reset();
      closeModal(document.getElementById('new-song-modal'));
      await refresh();
      feedback('Música criada', 'success');
    } catch (err) {
      feedback('Erro: ' + err.message, 'error');
    }
  });

  ['filter-in-progress', 'filter-complete', 'filter-missing-lyrics', 'filter-missing-instrument', 'filter-album']
    .forEach(id => document.getElementById(id)?.addEventListener('change', () => {
      if (currentView === 'network') renderNetworkView();
      else if (currentView === 'albums') renderAlbumsView();
      else render();
    }));

  ['filter-album-search', 'filter-album-active', 'filter-album-closed']
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const evt = el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change';
      el.addEventListener(evt, () => renderAlbumsView());
    });

  document.querySelectorAll('.view-btn').forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  );

  document.querySelectorAll('.filter-tab').forEach(btn =>
    btn.addEventListener('click', () => switchFilterMode(btn.dataset.filterMode))
  );

  const albumCard = document.getElementById('album-card');
  albumCard.addEventListener('click', () => openAlbumModal());
  albumCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAlbumModal(); }
  });

  document.getElementById('close-album-btn').addEventListener('click', () => openModal('close-album-modal'));
  document.getElementById('close-album-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const active = await getActiveAlbum();
      const result = await closeAlbum(active.id, fd.get('band_name'));
      e.target.reset();
      closeModal(document.getElementById('close-album-modal'));
      await refresh();
      feedback(`Álbum fechado como "${result.closed.band_name}". ${result.opened.name} aberto.`, 'success');
    } catch (err) {
      feedback('Erro: ' + err.message, 'error');
    }
  });
}

async function openAlbumModal(albumId) {
  try {
    const targetId = albumId || (await getActiveAlbum()).id;
    const album = await getAlbumDetails(targetId);
    document.getElementById('album-modal-title').textContent = album.name || 'Álbum';
    document.getElementById('album-body').innerHTML = renderAlbumBody(album);
    bindAlbumEvents(album);
    openModal('album-modal');
  } catch (err) {
    feedback('Erro: ' + err.message, 'error');
  }
}

function renderAlbumBody(album) {
  const coverUrl = album.cover_path ? getAlbumCoverUrl(album.cover_path) : null;
  const completeCount = album.songs.filter(s => s.status === 'complete').length;

  return `
    <div class="album-layout">
      <div class="album-cover-area">
        ${coverUrl ? `
          <div class="album-cover-wrap">
            <img class="album-cover" src="${coverUrl}" alt="Capa do álbum">
            <button class="album-cover-change" id="change-cover-btn">Alterar capa</button>
          </div>
        ` : `
          <label class="album-cover-empty" id="cover-dropzone">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p class="dropzone-title"><strong>Adicionar capa</strong></p>
            <p class="dropzone-hint">JPG · PNG · WEBP · até 10 MB</p>
            <input type="file" name="cover" accept="image/*" id="cover-input">
          </label>
        `}
      </div>

      <div class="album-info">
        <div class="album-meta-row">
          <span class="muted small">Álbum activo</span>
        </div>
        <h2 class="album-title editable" id="album-title-edit">${escapeHtml(album.name || 'Sem nome')}</h2>
        <div class="album-stats">
          <div><strong>${completeCount}</strong><span> / 10 músicas</span></div>
          <div><strong>${album.composers.length}</strong><span> compositor${album.composers.length === 1 ? '' : 'es'}</span></div>
          <div><strong>${album.songs.length}</strong><span> em desenvolvimento</span></div>
        </div>
      </div>
    </div>

    <section class="composers-section">
      <h4>Compositores</h4>
      ${album.composers.length === 0 ? '<p class="muted small">Ainda sem compositores. Quem contribuir aparece aqui.</p>' : `
        <ul class="composers-list">
          ${album.composers.map(c => `
            <li class="composer-card">
              <span class="composer-avatar">${escapeHtml((c.display_name || c.username || '?').charAt(0).toUpperCase())}</span>
              <div class="composer-info">
                <strong>${escapeHtml(c.display_name || c.username)}</strong>
                <span class="muted small">
                  ${c.city ? escapeHtml(c.city) + ' · ' : ''}${c.contributions} contributo${c.contributions === 1 ? '' : 's'}
                </span>
              </div>
            </li>
          `).join('')}
        </ul>
      `}
    </section>

    <section class="album-songs-section">
      <h4>Músicas (${album.songs.length})</h4>
      ${album.songs.length === 0 ? '<p class="muted small">Sem músicas no álbum.</p>' : `
        <ul class="album-songs">
          ${album.songs.map(s => `
            <li class="album-song-row" data-song-id="${s.id}">
              <span class="track-number">${String(album.songs.indexOf(s) + 1).padStart(2, '0')}</span>
              <span class="track-title">${escapeHtml(s.title)}</span>
              <span class="badge ${s.status} small">${s.status === 'complete' ? 'Completa' : 'Em desenvolvimento'}</span>
            </li>
          `).join('')}
        </ul>
      `}
    </section>
  `;
}

function bindAlbumEvents(album) {
  const dropzone = document.getElementById('cover-dropzone');
  const coverInput = document.getElementById('cover-input');
  const changeBtn = document.getElementById('change-cover-btn');

  const handleCoverFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      feedback('Apenas imagens são permitidas', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      feedback('Imagem demasiado grande (max 10 MB)', 'error');
      return;
    }
    try {
      await updateAlbumCover(album.id, file);
      await openAlbumModal();
      feedback('Capa actualizada', 'success');
    } catch (err) {
      feedback('Erro: ' + err.message, 'error');
    }
  };

  if (coverInput) {
    coverInput.addEventListener('change', e => handleCoverFile(e.target.files?.[0]));
  }

  if (dropzone) {
    ['dragenter', 'dragover'].forEach(ev =>
      dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); })
    );
    ['dragleave', 'drop'].forEach(ev =>
      dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); })
    );
    dropzone.addEventListener('drop', e => handleCoverFile(e.dataTransfer.files?.[0]));
  }

  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', e => handleCoverFile(e.target.files?.[0]));
      input.click();
    });
  }

  // Editar nome do álbum (inline)
  const titleEl = document.getElementById('album-title-edit');
  if (titleEl) {
    titleEl.addEventListener('click', () => {
      if (titleEl.querySelector('input')) return;
      const original = titleEl.textContent;
      titleEl.innerHTML = `<input type="text" value="${escapeAttr(original)}" maxlength="80" class="title-edit-input album-title-input">`;
      const input = titleEl.querySelector('input');
      input.focus(); input.select();

      const cancel = () => { titleEl.textContent = original; };
      const save = async () => {
        const newName = input.value.trim();
        if (!newName || newName === original) { cancel(); return; }
        try {
          await updateAlbumName(album.id, newName);
          titleEl.textContent = newName;
          document.getElementById('album-modal-title').textContent = newName;
          feedback('Nome actualizado', 'success');
        } catch (err) {
          feedback('Erro: ' + err.message, 'error');
          cancel();
        }
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      input.addEventListener('blur', save);
    });
  }

  // Click numa canção do álbum abre o modal de detalhe
  document.querySelectorAll('.album-song-row').forEach(row =>
    row.addEventListener('click', async () => {
      await closeModal(document.getElementById('album-modal'));
      openSongDetail(row.dataset.songId);
    })
  );
}

function switchView(view) {
  try {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === view)
    );
    const listEl = document.getElementById('song-list');
    const networkEl = document.getElementById('network-view');
    const albumsEl = document.getElementById('albums-view');
    const emptyEl = document.getElementById('empty-state');

    if (listEl) listEl.hidden = view !== 'list';
    if (networkEl) networkEl.hidden = view !== 'network';
    if (albumsEl) albumsEl.hidden = view !== 'albums';
    if (emptyEl && view !== 'list') emptyEl.hidden = true;

    // Sincronizar filter mode com view
    const expectedMode = view === 'albums' ? 'albums' : 'songs';
    if (expectedMode !== currentFilterMode) {
      applyFilterMode(expectedMode);
    }

    if (view === 'network') renderNetworkView();
    else if (view === 'albums') { destroyNetwork(); renderAlbumsView(); }
    else { destroyNetwork(); render(); }
  } catch (err) {
    console.error('switchView error:', err);
    feedback('Erro ao mudar de vista: ' + err.message, 'error');
  }
}

function switchFilterMode(mode) {
  applyFilterMode(mode);
  // Sincronizar view com filter mode
  if (mode === 'albums' && currentView !== 'albums') {
    switchView('albums');
  } else if (mode === 'songs' && currentView === 'albums') {
    switchView('list');
  }
}

function applyFilterMode(mode) {
  currentFilterMode = mode;
  document.querySelectorAll('.filter-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.filterMode === mode)
  );
  const songsBlock = document.getElementById('filter-songs');
  const albumsBlock = document.getElementById('filter-albums');
  if (songsBlock) songsBlock.hidden = mode !== 'songs';
  if (albumsBlock) albumsBlock.hidden = mode !== 'albums';
}

function renderNetworkView() {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const filtered = getFilteredSongs();
  if (filtered.length === 0) {
    canvas.innerHTML = `<p class="muted" style="text-align:center;padding:80px;">${
      songsCache.length === 0
        ? 'Sem músicas para mostrar. Cria a primeira para começar a rede.'
        : 'Nenhuma música corresponde aos filtros activos.'
    }</p>`;
    return;
  }
  renderNetwork(filtered, canvas, (node) => {
    if (node.type === 'song') openSongDetail(node.id);
    else if (node.type === 'participant') openUserDetail(node.id);
  });
}

async function refresh() {
  try {
    const active = await getActiveAlbum().catch(() => null);
    activeAlbumId = active?.id || null;

    const label = document.getElementById('active-album-label');
    if (label) label.textContent = `${active?.name || '—'} · álbum activo`;

    songsCache = await listSongs();
    populateAlbumFilter();
    if (currentView === 'network') renderNetworkView();
    else if (currentView === 'albums') renderAlbumsView();
    else render();
  } catch (err) {
    console.error('refresh error', err);
    feedback('Erro ao carregar dados', 'error');
  }
}

function getActiveFilters() {
  return {
    inProgress: document.getElementById('filter-in-progress').checked,
    complete: document.getElementById('filter-complete').checked,
    missingLyrics: document.getElementById('filter-missing-lyrics').checked,
    missingInstrument: document.getElementById('filter-missing-instrument').checked,
    album: document.getElementById('filter-album')?.value || 'active',
  };
}

function getFilteredSongs() {
  const filters = getActiveFilters();
  let filtered = songsCache;

  // Filtro de álbum: 'active' = só activo, 'all' = todos, ou um id específico
  if (filters.album === 'active' && activeAlbumId) {
    filtered = filtered.filter(s => s.album_id === activeAlbumId);
  } else if (filters.album !== 'all' && filters.album !== 'active') {
    filtered = filtered.filter(s => s.album_id === filters.album);
  }

  if (filters.inProgress && !filters.complete) filtered = filtered.filter(s => s.status === 'in_progress');
  if (filters.complete && !filters.inProgress) filtered = filtered.filter(s => s.status === 'complete');
  if (filters.missingLyrics) filtered = filtered.filter(s => s.missingLyrics);
  if (filters.missingInstrument) filtered = filtered.filter(s => s.missingInstrument);
  return filtered;
}

async function populateAlbumFilter() {
  const select = document.getElementById('filter-album');
  if (!select) return;
  const previousValue = select.value;
  try {
    const albums = await listAllAlbums();
    select.innerHTML = `
      <option value="active">Álbum activo</option>
      <option value="all">Todos</option>
      ${albums.map(a => `<option value="${a.id}">${escapeHtml(a.name || '—')}${a.band_name ? ' · ' + escapeHtml(a.band_name) : ''}</option>`).join('')}
    `;
    if (previousValue && [...select.options].some(o => o.value === previousValue)) {
      select.value = previousValue;
    }
  } catch (err) { /* silencioso */ }
}

function render() {
  const filtered = getFilteredSongs();

  const list = document.getElementById('song-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';
  empty.hidden = filtered.length > 0;

  filtered.forEach(s => list.appendChild(renderSongCard(s)));

  const activeAlbumSongs = activeAlbumId
    ? songsCache.filter(s => s.album_id === activeAlbumId)
    : songsCache;
  const completeCount = activeAlbumSongs.filter(s => s.status === 'complete').length;
  document.getElementById('album-count').textContent = completeCount;
  document.getElementById('album-bar').style.width = Math.min(100, completeCount * 10) + '%';

  const banner = document.getElementById('album-ready-banner');
  if (banner) banner.hidden = completeCount < 10;
}

function renderSongCard(song) {
  const card = document.createElement('article');
  card.className = 'song-card';
  card.style.setProperty('--breath-delay', `${(Math.random() * 6).toFixed(2)}s`);
  card.innerHTML = `
    <header>
      <h4>${escapeHtml(song.title)}</h4>
      <span class="badge ${song.status}">${song.status === 'complete' ? 'Completa' : 'Em desenvolvimento'}</span>
    </header>
    <div class="song-meta">
      <div><strong>${song.audioCount}</strong> instrumento(s)</div>
      <div><strong>${song.hasLyrics ? '1' : '0'}</strong> letra</div>
      <div><strong>${song.participantCount}</strong> participante(s)</div>
    </div>
    <div class="song-instruments">
      ${song.instruments.map(i => `<span class="chip">${INSTRUMENT_LABEL[i] || i}</span>`).join('')}
      ${song.missingLyrics ? '<span class="chip chip-warn">Falta letra</span>' : ''}
      ${song.missingInstrument ? '<span class="chip chip-warn">Falta instrumento</span>' : ''}
    </div>
    <footer class="song-footer">
      <span class="muted small">por ${escapeHtml(song.creator?.display_name || '—')}</span>
      <button class="btn-link" data-open="${song.id}">Abrir →</button>
    </footer>
  `;
  card.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    openSongDetail(song.id);
  });
  card.querySelector('[data-open]').addEventListener('click', (e) => {
    e.stopPropagation();
    openSongDetail(song.id);
  });
  return card;
}

async function openUserDetail(userId) {
  try {
    const user = await getUserDetails(userId);
    document.getElementById('user-modal-title').textContent =
      user.display_name || user.username;
    document.getElementById('user-body').innerHTML = renderUserBody(user);

    document.querySelectorAll('#user-body [data-song-id]').forEach(row =>
      row.addEventListener('click', async () => {
        await closeModal(document.getElementById('user-modal'));
        openSongDetail(row.dataset.songId);
      })
    );

    if (currentView === 'network') {
      highlightNode(`user:${userId}`);
    }
    openModal('user-modal');
  } catch (err) {
    feedback('Erro: ' + err.message, 'error');
  }
}

function renderUserBody(user) {
  const initial = (user.display_name || user.username || '?').charAt(0).toUpperCase();
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return `
    <div class="user-header">
      <span class="user-avatar-large">${escapeHtml(initial)}</span>
      <div class="user-meta">
        <strong class="user-name">${escapeHtml(user.display_name || user.username)}</strong>
        <div class="user-tags">
          ${user.city ? `<span class="user-tag">📍 ${escapeHtml(user.city)}</span>` : ''}
          ${user.main_instrument ? `<span class="user-tag">🎵 ${escapeHtml(user.main_instrument)}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="user-stats">
      <div><strong>${user.songCount}</strong><span>música${user.songCount === 1 ? '' : 's'}</span></div>
      <div><strong>${user.contributionCount}</strong><span>contributo${user.contributionCount === 1 ? '' : 's'}</span></div>
    </div>

    <section class="detail-section">
      <h4>Participações</h4>
      ${user.songs.length === 0
        ? '<p class="muted small">Ainda sem participações.</p>'
        : `
          <ul class="user-songs">
            ${user.songs.map(s => `
              <li class="user-song-row" data-song-id="${s.id}">
                <span class="track-title">${escapeHtml(s.title)}</span>
                <span class="user-song-tags">
                  ${s.tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
                </span>
                <span class="badge ${s.status}">${s.status === 'complete' ? 'Completa' : 'Em desenvolvimento'}</span>
              </li>
            `).join('')}
          </ul>
        `
      }
    </section>

    ${memberSince ? `<p class="user-since muted small">Membro desde ${memberSince}</p>` : ''}
  `;
}

async function openSongDetail(songId) {
  try {
    const song = await getSong(songId);
    currentSong = song;
    document.getElementById('detail-title').textContent = song.title;
    document.getElementById('detail-body').innerHTML = renderSongDetailBody(song);

    const editBtn = document.getElementById('edit-title-btn');
    if (editBtn) {
      editBtn.hidden = song.created_by !== currentUserId;
    }

    bindSongDetailEvents(song);
    setupTitleEdit(song);
    setupPresence(song);
    openModal('song-detail-modal');
  } catch (err) {
    feedback('Erro: ' + err.message, 'error');
  }
}

function setupTitleEdit(song) {
  const titleEl = document.getElementById('detail-title');
  const btn = document.getElementById('edit-title-btn');
  if (!titleEl || !btn || song.created_by !== currentUserId) return;

  const startEdit = () => {
    if (titleEl.querySelector('input')) return;
    const original = titleEl.textContent;
    titleEl.innerHTML = `<input type="text" value="${escapeAttr(original)}" maxlength="100" class="title-edit-input">`;
    const input = titleEl.querySelector('input');
    input.focus();
    input.select();

    const cancel = () => { titleEl.textContent = original; };
    const save = async () => {
      const newTitle = input.value.trim();
      if (!newTitle || newTitle === original) { cancel(); return; }
      try {
        await updateSongTitle(song.id, newTitle);
        titleEl.textContent = newTitle;
        currentSong.title = newTitle;
        await refresh();
        feedback('Título actualizado', 'success');
      } catch (err) {
        feedback('Erro: ' + err.message, 'error');
        cancel();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', save);
  };

  btn.onclick = startEdit;
  titleEl.onclick = startEdit;
}

async function setupPresence(song) {
  if (activePresenceChannel) {
    await leaveSongPresence(activePresenceChannel);
    activePresenceChannel = null;
  }
  const profile = currentProfile || { id: currentUserId, username: 'eu' };
  activePresenceChannel = joinSongPresence(song.id, profile, renderPresenceList);
}

function renderPresenceList(users) {
  const container = document.getElementById('presence-list');
  if (!container) return;
  const others = users.filter(u => u.user_id !== currentUserId);
  if (others.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="presence-label">${others.length === 1 ? '1 a ver' : `${others.length} a ver`}</div>
    <div class="presence-avatars">
      ${others.slice(0, 5).map(u => avatarBadge(u)).join('')}
      ${others.length > 5 ? `<span class="presence-more">+${others.length - 5}</span>` : ''}
    </div>
  `;
}

function avatarBadge(user) {
  const name = user.display_name || user.username || '?';
  const initial = name.charAt(0).toUpperCase();
  return `
    <span class="presence-dot" title="${escapeAttr(name)} está a ver">
      <span class="presence-pulse"></span>
      ${escapeHtml(initial)}
    </span>
  `;
}

function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderSongDetailBody(song) {
  const audios = song.contributions.filter(c => c.type === 'audio');
  const lyrics = song.contributions.find(c => c.type === 'lyrics');

  return `
    <div class="detail-status">
      <span class="badge ${song.status}">${song.status === 'complete' ? 'Completa' : 'Em desenvolvimento'}</span>
      <span class="muted small">criada por ${escapeHtml(song.creator?.display_name || '—')}</span>
    </div>

    <section class="detail-section">
      <div class="instruments-header">
        <h4>Instrumentos (${audios.length})</h4>
        ${audios.length >= 2 ? `
          <button id="play-all-btn" class="btn-play-all" type="button" title="Tocar tudo" aria-label="Tocar tudo">
            <svg id="play-all-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>
        ` : ''}
      </div>
      ${audios.length === 0 ? '<p class="muted small">Ainda sem instrumentos.</p>' : ''}
      <ul class="contrib-list">
        ${audios.map(a => `
          <li data-instrument="${a.instrument}">
            <strong>${INSTRUMENT_LABEL[a.instrument] || a.instrument}</strong>
            <span class="muted small">por ${escapeHtml(a.author?.display_name || '—')}</span>
            ${a.audio_path ? `<audio controls src="${getAudioUrl(a.audio_path)}" data-track></audio>` : ''}
          </li>`).join('')}
      </ul>

      <form class="upload-form" data-song-id="${song.id}">
        <div class="field-instrument">
          <label>Instrumento</label>
          <select name="instrument" required>
            ${INSTRUMENTS.map(i => `<option value="${i}">${INSTRUMENT_LABEL[i]}</option>`).join('')}
          </select>
        </div>

        <div class="dropzone-wrapper">
          ${renderDropzoneEmpty()}
        </div>

        <button type="submit" class="btn-primary" disabled>Adicionar instrumento</button>
      </form>
    </section>

    <section class="detail-section">
      <h4>Letra</h4>
      ${lyrics ? `
        <article class="lyrics-block">
          <pre>${escapeHtml(lyrics.lyrics_text)}</pre>
          <span class="muted small">por ${escapeHtml(lyrics.author?.display_name || '—')}</span>
        </article>
      ` : `
        <form class="add-lyrics-form" data-song-id="${song.id}">
          <textarea name="text" required rows="6" placeholder="Escreve a letra da música..."></textarea>
          <button type="submit" class="btn-primary" style="margin-top:12px;">Adicionar letra</button>
        </form>
      `}
    </section>

    <section class="detail-section">
      <h4>Conversa</h4>
      <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
          <p class="chat-empty muted small">Sem mensagens ainda. Sê o primeiro a dizer algo.</p>
        </div>
        <form class="chat-input" id="chat-form">
          <input type="text" name="message" placeholder="Escreve uma mensagem..." autocomplete="off" required>
          <button type="submit" class="btn-primary" aria-label="Enviar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>
    </section>
  `;
}

function renderDropzoneEmpty() {
  return `
    <label class="dropzone" id="audio-dropzone">
      <svg class="dropzone-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M15 17h3a3 3 0 0 0 0-6h-.025a5.56 5.56 0 0 0 .025-.5A5.5 5.5 0 0 0 7.207 9.021C7.137 9.017 7.071 9 7 9a4 4 0 1 0 0 8h2.167M12 19v-9m0 0-2 2m2-2 2 2"/>
      </svg>
      <p class="dropzone-title"><strong>Clica para escolher</strong> ou arrasta um ficheiro</p>
      <p class="dropzone-hint">MP3 · WAV · M4A · OGG · até ${MAX_FILE_MB} MB</p>
      <input type="file" name="audio" accept="audio/*">
    </label>
  `;
}

function renderPreview(file) {
  const url = URL.createObjectURL(file);
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  return `
    <div class="preview-card">
      <div class="preview-header">
        <div class="preview-info">
          <span class="preview-info-icon">🎵</span>
          <div class="preview-info-text">
            <div class="preview-info-name">${escapeHtml(file.name)}</div>
            <div class="preview-info-meta">${sizeMB} MB · ${file.type || 'áudio'}</div>
          </div>
        </div>
        <button type="button" class="preview-remove" id="preview-remove" title="Remover">×</button>
      </div>
      <audio controls src="${url}"></audio>
    </div>
  `;
}

function bindSongDetailEvents(song) {
  const audioForm = document.querySelector('.upload-form');
  if (audioForm) bindUploadForm(audioForm, song);

  const lyricsForm = document.querySelector('.add-lyrics-form');
  if (lyricsForm) {
    lyricsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await addLyricsContribution(song.id, fd.get('text'));
        await openSongDetail(song.id);
        await refresh();
        feedback('Letra adicionada', 'success');
      } catch (err) {
        feedback('Erro: ' + err.message, 'error');
      }
    });
  }

  initChat(song.id);
  initPlayAll();
}

function initPlayAll() {
  const btn = document.getElementById('play-all-btn');
  if (!btn) return;
  const icon = document.getElementById('play-all-icon');
  let isPlaying = false;

  const setStopped = () => {
    isPlaying = false;
    btn.classList.remove('playing');
    btn.setAttribute('aria-label', 'Tocar tudo');
    btn.setAttribute('title', 'Tocar tudo');
    icon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
  };

  const setPlaying = () => {
    isPlaying = true;
    btn.classList.add('playing');
    btn.setAttribute('aria-label', 'Parar');
    btn.setAttribute('title', 'Parar');
    icon.innerHTML = '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>';
  };

  btn.addEventListener('click', async () => {
    const tracks = Array.from(document.querySelectorAll('audio[data-track]'));
    if (tracks.length === 0) return;

    if (isPlaying) {
      tracks.forEach(t => t.pause());
      setStopped();
      return;
    }

    tracks.forEach(t => { try { t.currentTime = 0; } catch (_) {} });

    setPlaying();
    const results = await Promise.allSettled(tracks.map(t => t.play()));
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed === tracks.length) {
      setStopped();
      feedback('Nenhuma faixa disponível para tocar', 'error');
      return;
    }
    if (failed > 0) {
      feedback(`${failed} faixa(s) indisponíveis — a tocar as restantes`, 'error');
    }

    const onTrackEnd = () => {
      if (tracks.every(t => t.ended || t.paused)) {
        setStopped();
        tracks.forEach(t => t.removeEventListener('ended', onTrackEnd));
      }
    };
    tracks.forEach(t => t.addEventListener('ended', onTrackEnd));
  });
}

async function initChat(songId) {
  // Limpa subscrição anterior se existir
  if (activeChatChannel) {
    await unsubscribe(activeChatChannel);
    activeChatChannel = null;
  }

  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  if (!messagesEl || !form) return;

  // Carrega histórico
  try {
    const messages = await listMessages(songId);
    renderChatMessages(messagesEl, messages);
  } catch (err) {
    console.error('listMessages error', err);
  }

  // Subscreve novas mensagens (realtime)
  activeChatChannel = subscribeToMessages(songId, (msg) => {
    appendChatMessage(messagesEl, msg);
    if (msg.user_id !== currentUserId) {
      playNotificationSound();
    }
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[name="message"]');
    const text = input.value;
    if (!text.trim()) return;
    input.value = '';
    try {
      await sendMessage(songId, text);
      // Não precisamos de adicionar manualmente — vem via realtime
    } catch (err) {
      feedback('Erro: ' + err.message, 'error');
      input.value = text;
    }
  });
}

function renderChatMessages(container, messages) {
  if (!messages.length) {
    container.innerHTML = '<p class="chat-empty muted small">Sem mensagens ainda. Sê o primeiro a dizer algo.</p>';
    return;
  }
  container.innerHTML = messages.map(messageHtml).join('');
  container.scrollTop = container.scrollHeight;
}

function appendChatMessage(container, msg) {
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();
  container.insertAdjacentHTML('beforeend', messageHtml(msg));
  container.scrollTop = container.scrollHeight;
}

const CHAT_USER_COLORS = [
  { name: '#7DD3FC', tint: 'rgba(125, 211, 252, 0.10)' },  // cyan
  { name: '#F9A8D4', tint: 'rgba(249, 168, 212, 0.10)' },  // pink
  { name: '#6FE0B0', tint: 'rgba(111, 224, 176, 0.10)' },  // green
  { name: '#C4B5FD', tint: 'rgba(196, 181, 253, 0.10)' },  // purple
  { name: '#FBBF77', tint: 'rgba(251, 191, 119, 0.10)' },  // orange
  { name: '#FCA5A5', tint: 'rgba(252, 165, 165, 0.10)' },  // soft red
];

function userColor(userId) {
  if (!userId) return CHAT_USER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CHAT_USER_COLORS[Math.abs(hash) % CHAT_USER_COLORS.length];
}

function messageHtml(msg) {
  const isMine = msg.user_id === currentUserId;
  const author = msg.author?.display_name || msg.author?.username || '—';
  const time = formatTime(msg.created_at);
  const color = userColor(msg.user_id);
  const styleAttr = !isMine ? `style="--user-color:${color.name};--user-tint:${color.tint};"` : '';
  return `
    <div class="chat-message ${isMine ? 'mine' : 'theirs'}" ${styleAttr}>
      ${!isMine ? `<div class="chat-author">${escapeHtml(author)}</div>` : ''}
      <div class="chat-bubble">${escapeHtml(msg.message)}</div>
      <div class="chat-time">${time}</div>
    </div>
  `;
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min`;
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function bindUploadForm(form, song) {
  const wrapper = form.querySelector('.dropzone-wrapper');
  const submitBtn = form.querySelector('button[type="submit"]');
  let selectedFile = null;

  function setupDropzone() {
    const dropzone = wrapper.querySelector('.dropzone');
    const input = wrapper.querySelector('input[type="file"]');

    if (!dropzone || !input) return;

    input.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    ['dragenter', 'dragover'].forEach(ev =>
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      })
    );
    ['dragleave', 'drop'].forEach(ev =>
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      })
    );
    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    });
  }

  function handleFile(file) {
    if (!file.type.startsWith('audio/')) {
      feedback('Só são aceites ficheiros de áudio', 'error');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      feedback(`Ficheiro demasiado grande (max ${MAX_FILE_MB} MB)`, 'error');
      return;
    }
    selectedFile = file;
    wrapper.innerHTML = renderPreview(file);
    submitBtn.disabled = false;

    const removeBtn = wrapper.querySelector('#preview-remove');
    if (removeBtn) removeBtn.addEventListener('click', resetDropzone);
  }

  function resetDropzone() {
    selectedFile = null;
    wrapper.innerHTML = renderDropzoneEmpty();
    submitBtn.disabled = true;
    setupDropzone();
  }

  setupDropzone();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      feedback('Selecciona um ficheiro primeiro', 'error');
      return;
    }
    const instrument = form.querySelector('select[name="instrument"]').value;
    submitBtn.disabled = true;
    submitBtn.textContent = 'A enviar...';
    try {
      await addAudioContribution(song.id, instrument, selectedFile);
      await openSongDetail(song.id);
      await refresh();
      feedback(`${INSTRUMENT_LABEL[instrument]} adicionada`, 'success');
    } catch (err) {
      feedback('Erro: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Adicionar instrumento';
    }
  });
}

function openModal(id) { document.getElementById(id).hidden = false; }
async function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  if (modal.id === 'user-modal') {
    if (currentView === 'network') clearHighlight();
  }
  if (modal.id === 'song-detail-modal') {
    document.querySelectorAll('#detail-body audio').forEach(a => {
      a.pause();
      a.currentTime = 0;
    });
    const playAllBtn = document.getElementById('play-all-btn');
    if (playAllBtn) playAllBtn.classList.remove('playing');

    if (activeChatChannel) {
      await unsubscribe(activeChatChannel);
      activeChatChannel = null;
    }
    if (activePresenceChannel) {
      await leaveSongPresence(activePresenceChannel);
      activePresenceChannel = null;
    }
    currentSong = null;
    const presenceEl = document.getElementById('presence-list');
    if (presenceEl) presenceEl.innerHTML = '';
  }
}

function feedback(message, type = 'success') {
  const existing = document.querySelector('.feedback');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `feedback ${type}`;
  el.textContent = message;
  document.body.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    el.style.transition = 'all .3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function renderAlbumsView() {
  const container = document.getElementById('albums-list');
  if (!container) return;
  container.innerHTML = '<p class="muted" style="text-align:center;padding:60px;">A carregar álbuns...</p>';
  try {
    const albums = await listAllAlbums();
    const filtered = applyAlbumFilters(albums);
    if (filtered.length === 0) {
      container.innerHTML = `<p class="muted" style="text-align:center;padding:60px;">${
        albums.length === 0 ? 'Sem álbuns ainda.' : 'Nenhum álbum corresponde aos filtros.'
      }</p>`;
      return;
    }
    container.innerHTML = filtered.map(albumCardHtml).join('');
    bindAlbumCardEvents();
  } catch (err) {
    container.innerHTML = `<p class="error" style="text-align:center;padding:40px;">Erro: ${escapeHtml(err.message)}</p>`;
  }
}

function applyAlbumFilters(albums) {
  const search = (document.getElementById('filter-album-search')?.value || '').trim().toLowerCase();
  const showActive = document.getElementById('filter-album-active')?.checked ?? true;
  const showClosed = document.getElementById('filter-album-closed')?.checked ?? true;

  return albums.filter(a => {
    if (a.status === 'active' && !showActive) return false;
    if (a.status === 'closed' && !showClosed) return false;
    if (search) {
      const haystack = `${a.name || ''} ${a.band_name || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function albumCardHtml(album) {
  const coverUrl = album.cover_path ? getAlbumCoverUrl(album.cover_path) : null;
  const completeCount = album.songs.filter(s => s.status === 'complete').length;
  const isClosed = album.status === 'closed';
  const closedDate = album.closed_at
    ? new Date(album.closed_at).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
    : null;

  return `
    <article class="album-card ${isClosed ? 'closed' : 'active'}" data-album-id="${album.id}" role="button" tabindex="0">
      <div class="album-card-cover">
        ${coverUrl
          ? `<img src="${coverUrl}" alt="">`
          : `<div class="album-card-placeholder">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="0.5" fill="currentColor"/></svg>
            </div>`
        }
        <span class="album-card-status">${isClosed ? 'Fechado' : 'Activo'}</span>
      </div>
      <div class="album-card-body">
        <h4 class="album-card-name">${escapeHtml(album.name || '—')}</h4>
        ${album.band_name ? `<p class="album-card-band">por <strong>${escapeHtml(album.band_name)}</strong></p>` : ''}
        <div class="album-card-stats">
          <span><strong>${completeCount}</strong>/10 músicas</span>
          <span>·</span>
          <span><strong>${album.composers.length}</strong> compositor${album.composers.length === 1 ? '' : 'es'}</span>
        </div>
        ${closedDate ? `<p class="muted small">Fechado em ${closedDate}</p>` : ''}
        <button class="btn-link album-card-toggle" data-album-id="${album.id}">▾ Ver músicas</button>
        <div class="album-card-tracklist" id="tracklist-${album.id}" hidden>
          ${album.songs.length === 0
            ? '<p class="muted small">Sem músicas.</p>'
            : `<ol class="album-tracklist">
                ${album.songs.map((s, i) => `
                  <li class="album-track" data-song-id="${s.id}">
                    <span class="track-number">${String(i + 1).padStart(2, '0')}</span>
                    <span class="track-title">${escapeHtml(s.title)}</span>
                    <span class="badge ${s.status} small">${s.status === 'complete' ? '✓' : '·'}</span>
                  </li>
                `).join('')}
              </ol>`
          }
        </div>
      </div>
    </article>
  `;
}

function bindAlbumCardEvents() {
  document.querySelectorAll('.album-card-toggle').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tracklist = document.getElementById(`tracklist-${btn.dataset.albumId}`);
      if (!tracklist) return;
      const isHidden = tracklist.hidden;
      tracklist.hidden = !isHidden;
      btn.textContent = isHidden ? '▴ Esconder músicas' : '▾ Ver músicas';
    })
  );

  document.querySelectorAll('.album-track').forEach(track =>
    track.addEventListener('click', (e) => {
      e.stopPropagation();
      openSongDetail(track.dataset.songId);
    })
  );

  document.querySelectorAll('.album-card[data-album-id]').forEach(card =>
    card.addEventListener('click', () => openAlbumModal(card.dataset.albumId))
  );
}

// Som de notificação sintetizado via Web Audio API (sem dependências)
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // Duas notas curtas em sucessão — ping suave
    [
      { freq: 880, start: 0, dur: 0.12 },   // A5
      { freq: 1318.5, start: 0.08, dur: 0.18 }, // E6
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch (e) {
    // Se o browser bloquear (autoplay policy), ignora silenciosamente
    console.debug('Notification sound blocked', e);
  }
}
