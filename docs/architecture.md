# Arquitectura — Collaborative Performance

Plataforma web de criação musical colaborativa.
Goal 2 — Artefact & Demo (Social & Collaborative Computing, MEI, UC, 2025/2026).

---

## Visão geral

```
┌──────────────────────────────────────────────────────────────────┐
│                          BROWSER (cliente)                       │
│                                                                  │
│  ┌────────────┐    ┌────────────┐                                │
│  │ index.html │    │ app.html   │                                │
│  │ (login)    │    │ (app)      │                                │
│  └────────────┘    └────────────┘                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ES Modules                                                  │ │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐                  │ │
│  │   │ auth.js  │  │ songs.js │  │ albums.js│                  │ │
│  │   └──────────┘  └──────────┘  └──────────┘                  │ │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐                  │ │
│  │   │ chat.js  │  │presence  │  │ network  │                  │ │
│  │   │          │  │   .js    │  │   .js    │                  │ │
│  │   └──────────┘  └──────────┘  └──────────┘                  │ │
│  │   ┌──────────────────────┐  ┌─────────────────────────────┐ │ │
│  │   │ supabase.js (cliente)│  │ app.js (orquestração)       │ │ │
│  │   └──────────────────────┘  └─────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────┐                                          │
│  │  vis-network (CDN) │  ← visualização rede neural              │
│  └────────────────────┘                                          │
│                                                                  │
│              ▼ HTTPS + WebSocket (realtime)                      │
└──────────────┼───────────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────────┐
│                        SUPABASE (BaaS)                           │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Auth     │  │ Postgres │  │ Storage  │  │ Realtime         │  │
│  │ (JWT)    │  │ (RLS)    │  │ (audio,  │  │ (chat + presence │  │
│  │          │  │          │  │  covers) │  │  + DB changes)   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Modelo de dados (Postgres)

```
profiles ──┬──< songs (created_by) >──── albums (active/closed) ──< storage.covers
           │
           ├──< contributions (user_id, song_id) ──< storage.audio
           │
           └──< chat_messages (user_id, song_id)
```

| Tabela | Função |
|---|---|
| `profiles` | Dados públicos do utilizador (estende `auth.users`); username, display_name, city, main_instrument |
| `albums` | Álbum colectivo (10 canções → fechado); cover_path para a capa em Storage |
| `songs` | Canção (estado: in_progress / complete); criada por um utilizador, pertence a um álbum |
| `contributions` | Áudio (instrumento) ou letra que pertence a uma canção |
| `chat_messages` | Mensagens síncronas por canção |

### Triggers SQL

| Trigger | Tabela | Função |
|---|---|---|
| `on_auth_user_created` | `auth.users` | Cria automaticamente um `profile` com username dos metadados |
| `on_contribution_change` | `contributions` | Recalcula o estado da canção: ≥2 áudios + ≥1 letra → `complete` |

### Row Level Security

| Tabela | Política base |
|---|---|
| `profiles` | Read all autenticados; INSERT/UPDATE só do próprio |
| `songs` | Read all; INSERT autenticados; UPDATE título só pelo criador |
| `contributions` | Read all; INSERT/UPDATE/DELETE só sobre os próprios |
| `chat_messages` | Read all; INSERT só em nome próprio |
| `albums` | Read all; INSERT/UPDATE permitido (gerido pela aplicação) |
| `storage.audio` | INSERT autenticados; SELECT público |
| `storage.covers` | INSERT autenticados; SELECT público |

A política base materializa a regra do conceito: *"os utilizadores apenas podem alterar ou remover os seus próprios contributos"*.

### Realtime activo

Três tabelas têm Realtime activo: `songs`, `contributions`, `chat_messages`. Permite que toda a UI se actualize ao vivo quando outro participante adiciona instrumento, letra, mensagem ou cria canção nova.

---

## Módulos do cliente

### `supabase.js`
Inicializa o cliente Supabase com a URL e a publishable key vindas de `config.js`.

### `auth.js`
- `register(email, password, username)` — cria conta + profile via trigger
- `login(email, password)` — sessão persistente
- `logout()`
- `getCurrentUser()` / `getCurrentProfile()`
- `requireAuth()` — guarda nas páginas protegidas

### `songs.js`
- `listSongs(filters)` — listagem enriquecida com criador, contributos e cálculo de "falta letra / falta instrumento"
- `getSong(id)` — detalhe completo com author de cada contributo
- `createSong(title)` — associa automaticamente ao álbum activo
- `updateSongTitle(id, title)` — só permitido ao criador (RLS)
- `addAudioContribution(songId, instrument, file)` — upload para `storage.audio` + INSERT na tabela
- `addLyricsContribution(songId, text)`
- `getAudioUrl(path)` — URL público do bucket
- `subscribeToSongChanges(callback)` — listener Realtime para songs+contributions

### `albums.js`
- `getActiveAlbum()` — devolve o álbum com `status = 'active'`
- `getAlbumDetails(id)` — junta canções + computa **compositores únicos** (DISTINCT criadores e contribuintes)
- `updateAlbumCover(id, file)` — upload para `storage.covers` + atualiza `cover_path`
- `updateAlbumName(id, name)`
- `getAlbumCoverUrl(path)`

### `chat.js`
- `listMessages(songId)` — histórico
- `sendMessage(songId, text)`
- `subscribeToMessages(songId, onNew)` — channel Realtime filtrado por `song_id`
- `unsubscribe(channel)`

### `presence.js`
- `joinSongPresence(songId, profile, onUsersChange)` — entra num channel de presence específico da canção; o tracker envia `user_id`, `username`, `display_name`, `joined_at`
- `leaveSongPresence(channel)` — untrack + remove channel ao fechar o modal

Os eventos `sync` / `join` / `leave` actualizam a lista de utilizadores em tempo real para todos os clientes ligados ao mesmo channel.

### `network.js`
- `renderNetwork(songs, container, onSongClick)` — constrói o grafo com vis-network
- Modela canções como nós dourados (em desenvolvimento) ou verdes (completas), participantes como nós brancos
- Edges canção ↔ participante para cada contributo distinto
- Layout force-directed (Barnes-Hut) para o grafo se reorganizar visualmente
- Tooltips com detalhe ao hover; click num nó-canção abre o modal de detalhe
- Tema dark constellation alinhado com o resto do CSS

### `app.js`
Orquestrador. Estado global:
- `currentProfile`, `currentUserId`
- `songsCache` (lista de canções)
- `activeChatChannel`, `activePresenceChannel` (cleanup ao fechar modais)
- `currentView` ('list' ou 'network')

Responsável pelo binding de eventos, switch de vistas, abrir/fechar modais e despachar para os módulos de negócio.

---

## Mapeamento conceito → implementação

| Conceito do Goal 1 | Concretização no código |
|---|---|
| **Shared object** (canção) | Tabela `songs` + `contributions` |
| **Awareness** | `presence.js` (quem está numa canção agora) + Realtime de `contributions` (quem acabou de contribuir) |
| **Articulation work** | Filtros (sem letra / falta instrumento) + estados visuais + chips de aviso nos cards |
| **Common ground** | `chat.js` por canção + visualização permanente do estado |
| **3 níveis de colaboração** | Coordenação (filtros, estados), Cooperação (adicionar contributo), Co-construção (chat + presence em simultâneo) |
| **Matriz Espaço-Tempo** | Same time / Same place: presence + chat. Same time / Different place: chat realtime de utilizadores em cidades diferentes (Tomás/Sofia/João). Different time: contributos assíncronos visíveis a todos |
| **Rede criativa em crescimento** | Vista "Rede" com vis-network — força-direcionada, refeita em realtime quando há contributos novos |
| **Compositores partilhados entre canções** | Lógica em `albums.js#getAlbumDetails` que faz DISTINCT de criadores + contribuintes |

---

## Cenário de demo

1. **Tomás** (browser 1) faz login, cria a canção "Manhã no Douro", adiciona riff de guitarra.
2. **João** (browser 2) faz login. Vê a canção na vista **Rede** (nó dourado ligado a "tomas"). Aplica filtro "Falta instrumento", abre, adiciona bateria.
3. **Sofia** (browser 3) abre a canção. Aparece bolinha verde no header (presence) — Tomás e João vêem que ela entrou. Sofia escreve a letra.
4. Trigger SQL marca canção como **completa** automaticamente. Contador do álbum vai a 1/10.
5. Os três escrevem no chat em tempo real para acertar arranjos.
6. Vista **Rede** mostra a constelação a crescer: 3 nós participantes ligados a 1 nó dourado-verde central.
7. Modal **Álbum**: capa carregada, "Volume I" com 3 compositores listados automaticamente.

---

## Stack / decisões

- **Vanilla JS sem build:** sem npm, sem framework. Curva de aprendizagem zero. Ficheiros pequenos, demonstráveis. ES Modules carregam directamente no browser.
- **Supabase:** elimina backend custom, auth, websockets, file storage e realtime. Tier gratuito é suficiente para o projecto.
- **vis-network via CDN UMD:** biblioteca standard de visualização de grafos; tema customizável; integra-se via `<script>` sem build.
- **Google Fonts (Fraunces + Inter):** serif elegante para títulos (alinhado com o tema constellation), sans neutro para corpo.
- **CSS Vanilla custom:** tema dark "constellation" coerente com a capa do Goal 1; paleta dourada `#F4C842` mantida; pontos como estrelas no fundo.

## Limitações assumidas

- Sem WebRTC (chamada áudio/vídeo) — substituída por chat realtime
- Sem editor de áudio integrado — apenas upload
- Sem moderação automática
- Versões alternativas mockadas visualmente, lógica completa fica fora de scope

## Configuração obrigatória

1. Conta Supabase + projecto
2. Aplicar `supabase/schema.sql`
3. Buckets `audio` e `covers` (Public) com policies de INSERT
4. `public/js/config.js` preenchido com SUPABASE_URL + SUPABASE_ANON_KEY
5. Servir `public/` com qualquer servidor estático (`python3 -m http.server` chega)
