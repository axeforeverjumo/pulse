# core-web

React + TypeScript frontend for Core — the all-in-one productivity platform.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your Supabase credentials

# Start dev server
npm run dev
```

App runs at `http://localhost:5173`

## Tech Stack

- **React 19** with TypeScript
- **Vite 7** for builds and HMR
- **Tailwind 4** for styling
- **Zustand** for state management (8 stores with persistence)
- **React Router 7** for routing
- **TipTap** (ProseMirror) for rich text editing
- **@dnd-kit** for drag and drop
- **motion** for animations
- **Supabase JS** for auth and realtime subscriptions

## Project Structure

```
src/
├── api/
│   └── client.ts          # Central API client with auth
├── components/
│   ├── Calendar/           # Calendar views and event management
│   ├── Chat/               # AI chat interface
│   ├── Dashboard/          # Unified dashboard
│   ├── Documents/          # Rich text editor
│   ├── Email/              # Email client UI
│   ├── Files/              # File browser and upload
│   ├── Messages/           # Team messaging (channels, threads)
│   ├── Projects/           # Kanban boards
│   ├── Sidebar/            # App navigation
│   └── ...                 # 34 component modules total
├── hooks/                  # Custom React hooks
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── sentry.ts           # Error tracking (optional)
│   └── posthog.ts          # Analytics (optional)
├── stores/                 # Zustand state stores
│   ├── authStore.ts        # Auth state and JWT
│   ├── emailStore.ts       # Email state and sync
│   ├── calendarStore.ts    # Calendar events
│   ├── conversationStore.ts # AI chat conversations
│   ├── messagesStore.ts    # Team messaging
│   ├── filesStore.ts       # File management
│   └── workspaceStore.ts   # Workspace and member state
├── types/                  # TypeScript type definitions
├── utils/                  # Shared utilities
├── App.tsx                 # Root component with routing
└── main.tsx                # Entry point
```

## Key Patterns

- **Stale-while-revalidate**: All stores serve cached data instantly, then refresh in the background
- **Optimistic updates**: Email and messages update the UI before the API confirms
- **Per-workspace caching**: Each workspace has its own cache for instant switching
- **Central API client**: `src/api/client.ts` handles auth headers, base URL, and error handling
- **Single realtime channel**: One Supabase channel (`global-realtime`) handles all realtime updates

## Environment Variables

See [`.env.example`](./.env.example) for all available variables. Only `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` are required.

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # Type check + production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Design System

- Custom Tailwind theme with Chivo Mono font
- Design tokens defined in `src/index.css`
- See [designguide.mdx](./designguide.mdx) and [designtokens.mdx](./designtokens.mdx) for the full system
