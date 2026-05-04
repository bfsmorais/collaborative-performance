// Visualização rede neural / árvore genealógica das canções e participantes
// Usa vis-network global (carregado via <script> no HTML)

let currentNetwork = null;

const COLORS = {
  songInProgress: '#F4C842',
  songInProgressBorder: '#FFE89A',
  songComplete: '#6FE0B0',
  songCompleteBorder: '#A8F0CC',
  participant: '#E8EBF2',
  participantBorder: '#B4BFD4',
  edge: 'rgba(180, 191, 212, 0.35)',
  edgeHighlight: '#F4C842',
  fontPrimary: '#E8EBF2',
  fontSecondary: '#B4BFD4',
};

export function renderNetwork(songs, container, onNodeClick) {
  if (!window.vis) {
    container.innerHTML = '<p class="muted" style="text-align:center;padding:60px;">A carregar biblioteca de visualização...</p>';
    return;
  }

  const { nodes, edges } = buildGraph(songs);

  const data = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges),
  };

  const options = {
    nodes: {
      shape: 'dot',
      borderWidth: 2,
      shadow: { enabled: true, color: 'rgba(244,200,66,0.4)', size: 12, x: 0, y: 0 },
      font: {
        face: 'Inter, sans-serif',
        size: 13,
        color: COLORS.fontPrimary,
      },
    },
    edges: {
      color: { color: COLORS.edge, highlight: COLORS.edgeHighlight, hover: COLORS.edgeHighlight },
      width: 1,
      smooth: { enabled: true, type: 'continuous', roundness: 0.5 },
      hoverWidth: 1.5,
      selectionWidth: 2,
    },
    physics: {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -3000,
        centralGravity: 0.15,
        springLength: 140,
        springConstant: 0.04,
        damping: 0.4,
      },
      stabilization: { iterations: 200, fit: true },
    },
    interaction: {
      hover: true,
      tooltipDelay: 100,
      navigationButtons: false,
      zoomView: true,
      dragView: true,
    },
    layout: {
      improvedLayout: true,
    },
  };

  if (currentNetwork) {
    currentNetwork.destroy();
    currentNetwork = null;
  }

  currentNetwork = new vis.Network(container, data, options);

  currentNetwork.on('click', (params) => {
    if (params.nodes.length === 0) return;
    const nodeId = params.nodes[0];
    const node = data.nodes.get(nodeId);
    if (!onNodeClick) return;
    if (node?.type === 'song') {
      onNodeClick({ type: 'song', id: node.songId });
    } else if (node?.type === 'participant') {
      const userId = String(nodeId).replace(/^user:/, '');
      onNodeClick({ type: 'participant', id: userId });
    }
  });

  return currentNetwork;
}

export function highlightNode(nodeId) {
  if (!currentNetwork) return;
  try {
    currentNetwork.selectNodes([nodeId], true);
    currentNetwork.focus(nodeId, { scale: 1.1, animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  } catch (e) { /* nó não existe */ }
}

export function clearHighlight() {
  if (!currentNetwork) return;
  currentNetwork.unselectAll();
}

export function destroyNetwork() {
  if (currentNetwork) {
    currentNetwork.destroy();
    currentNetwork = null;
  }
}

function buildGraph(songs) {
  const nodes = [];
  const edges = [];
  const seenParticipants = new Map(); // user_id → node info
  const seenEdges = new Set();

  songs.forEach(song => {
    // Nó da canção
    const isComplete = song.status === 'complete';
    nodes.push({
      id: `song:${song.id}`,
      label: song.title,
      type: 'song',
      songId: song.id,
      title: songTooltip(song),
      color: {
        background: isComplete ? COLORS.songComplete : COLORS.songInProgress,
        border: isComplete ? COLORS.songCompleteBorder : COLORS.songInProgressBorder,
        highlight: {
          background: isComplete ? COLORS.songComplete : COLORS.songInProgress,
          border: '#FFFFFF',
        },
      },
      size: 18 + Math.min(song.audioCount * 3, 12),
      font: { face: 'Fraunces, serif', size: 15, color: COLORS.fontPrimary, strokeWidth: 0 },
    });

    // Participantes (criador + autores de contributos)
    const participants = new Map();
    if (song.creator && song.created_by) {
      participants.set(song.created_by, song.creator);
    }
    (song.contributions || []).forEach(c => {
      if (c.user_id && c.author) {
        participants.set(c.user_id, c.author);
      }
    });

    participants.forEach((profile, userId) => {
      const participantNodeId = `user:${userId}`;
      if (!seenParticipants.has(userId)) {
        seenParticipants.set(userId, profile);
        nodes.push({
          id: participantNodeId,
          label: profile.display_name || profile.username || '—',
          type: 'participant',
          title: participantTooltip(profile),
          color: {
            background: COLORS.participant,
            border: COLORS.participantBorder,
            highlight: { background: COLORS.participant, border: COLORS.songInProgress },
          },
          size: 10,
          font: { face: 'Inter, sans-serif', size: 12, color: COLORS.fontSecondary },
        });
      }

      // Edge canção ↔ participante
      const edgeKey = `${song.id}:${userId}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push({
          id: edgeKey,
          from: `song:${song.id}`,
          to: participantNodeId,
        });
      }
    });
  });

  return { nodes, edges };
}

export function pulseEdge(songId, userId) {
  if (!currentNetwork) return;
  const edges = currentNetwork.body.data.edges;
  const id = `${songId}:${userId}`;
  if (!edges.get(id)) return;

  // pico
  edges.update({
    id,
    color: { color: '#FFE89A', highlight: '#FFE89A' },
    width: 3.5,
    shadow: { enabled: true, color: 'rgba(244, 200, 66, 0.8)', size: 12 },
  });

  // mid-fade
  setTimeout(() => {
    edges.update({
      id,
      color: { color: COLORS.edgeHighlight, highlight: COLORS.edgeHighlight },
      width: 2,
      shadow: { enabled: true, color: 'rgba(244, 200, 66, 0.4)', size: 8 },
    });
  }, 500);

  // restore
  setTimeout(() => {
    edges.update({
      id,
      color: { color: COLORS.edge, highlight: COLORS.edgeHighlight, hover: COLORS.edgeHighlight },
      width: 1,
      shadow: { enabled: false },
    });
  }, 1100);
}

function songTooltip(song) {
  const tip = document.createElement('div');
  tip.style.fontFamily = 'Inter, sans-serif';
  tip.style.fontSize = '12px';
  tip.style.padding = '4px';
  tip.innerHTML = `
    <strong style="font-family:Fraunces,serif;font-size:14px;">${escapeHtml(song.title)}</strong><br>
    <span style="opacity:.75;">${song.status === 'complete' ? 'Completa' : 'Em desenvolvimento'}</span><br>
    ${song.audioCount} instrumento(s) · ${song.hasLyrics ? 'com letra' : 'sem letra'}<br>
    ${song.participantCount} participante(s)
  `;
  return tip;
}

function participantTooltip(profile) {
  const tip = document.createElement('div');
  tip.style.fontFamily = 'Inter, sans-serif';
  tip.style.fontSize = '12px';
  tip.style.padding = '4px';
  tip.innerHTML = `
    <strong>${escapeHtml(profile.display_name || profile.username)}</strong>
    ${profile.city ? `<br><span style="opacity:.75;">${escapeHtml(profile.city)}</span>` : ''}
    ${profile.main_instrument ? `<br><span style="opacity:.75;">${escapeHtml(profile.main_instrument)}</span>` : ''}
  `;
  return tip;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
