# TripMate frontend

This directory contains the React/Next.js interface for TripMate AI. It uses
CopilotKit and the AG-UI protocol to communicate with the FastAPI/LangGraph
backend, display streamed graph state, and resolve human approval interrupts.

For complete backend, MCP, API, Docker, and environment documentation, see the
[project README](../README.md).

## Frontend architecture

```text
Browser
  └── TripMateApp (React client component)
        ├── CopilotChat
        ├── useAgent shared LangGraph state
        ├── useInterrupt approval UI
        ├── Mission control
        └── Itinerary renderer
              │
              ▼
Next.js /api/copilotkit
  └── CopilotRuntime + LangGraphHttpAgent
              │ AG-UI
              ▼
FastAPI http://localhost:8000/ag-ui
```

## Directory structure

```text
frontend/
├── app/
│   ├── api/copilotkit/[[...slug]]/route.ts  # CopilotKit runtime endpoint
│   ├── globals.css                           # Themes and responsive styles
│   ├── layout.tsx                            # Metadata and global CSS imports
│   └── page.tsx                              # Renders TripMateApp
├── components/
│   └── tripmate-app.tsx                      # Main application component
├── .env.local.example                        # Local URL configuration
├── next.config.ts                            # Next.js and Turbopack config
├── package.json                              # Dependencies and scripts
├── tsconfig.json                             # TypeScript configuration
└── README.md
```

## Main UI features

- Responsive desktop and mobile layout.
- Light and dark themes.
- CopilotKit chat with starter suggestions.
- Live backend availability indicator.
- Guardrail status and reason.
- Selected-agent mission control.
- Shared trip constraints such as origin and currency.
- Human approval and revision controls rendered from LangGraph interrupts.
- Markdown itinerary with tables and lists.
- Copy and print-to-PDF actions.
- Automatic conversation collapse when the final plan is ready.
- **Show conversation** control that preserves access to chat history.

## Important component APIs

### `CopilotKit`

Provides the frontend runtime context:

```tsx
<CopilotKit runtimeUrl="/api/copilotkit" agent="tripmate">
  <Workspace />
</CopilotKit>
```

### `CopilotChat`

Renders the chat history, suggestions, streamed messages, and composer:

```tsx
<CopilotChat agentId="tripmate" throttleMs={100} />
```

### `useAgent`

Subscribes the UI to LangGraph state and run-status changes:

```tsx
const { agent } = useAgent({
  agentId: "tripmate",
  updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
});
```

The UI consumes fields including:

```text
guardrail_allowed
guardrail_reason
selected_agents
trip_constraints
flight_results
train_results
bus_results
hotel_results
weather_results
budget_results
itinerary
approval_request
approved
final_response
llm_calls
```

### `useInterrupt`

Renders `ApprovalGate` when the backend pauses at the human-review node. The
component resolves the interrupt with:

```ts
{
  approved: boolean;
  feedback: string;
}
```

Feedback is required when the user requests a revision.

## Environment configuration

Local defaults are built in. To override them:

```powershell
Copy-Item .env.local.example .env.local
```

```dotenv
AG_UI_AGENT_URL=http://localhost:8000/ag-ui
NEXT_PUBLIC_API_URL=http://localhost:8000
```

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `AG_UI_AGENT_URL` | Next.js server only | Backend AG-UI endpoint used by `LangGraphHttpAgent`. |
| `NEXT_PUBLIC_API_URL` | Browser | Backend base URL used for the health indicator. |

Do not put secret API keys in `NEXT_PUBLIC_*` variables.

## Install and run

Start the backend from the project root:

```powershell
.\.venv\Scripts\python.exe app.py
```

Start the frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. FastAPI documentation is available at
<http://127.0.0.1:8000/docs>.

## npm commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server with Fast Refresh. |
| `npm run typecheck` | Run TypeScript checks without emitting files. |
| `npm run build` | Create and validate an optimized production build. |
| `npm run start` | Serve the previously generated production build. |

## Production build

```powershell
npm run typecheck
npm run build
npm run start
```

For deployment, set `AG_UI_AGENT_URL` to the backend's publicly accessible
`/ag-ui` URL. Set `NEXT_PUBLIC_API_URL` before building because public Next.js
environment values are included in the browser bundle.

## Styling

Global application styles are in `app/globals.css`. CopilotKit v2 styles are
imported in `app/layout.tsx`. TripMate adds scoped selectors around
`.tripmate-chat` to preserve spacing between approval controls and CopilotKit's
bottom-anchored composer.

Important responsive breakpoints:

- `1120px`: dashboard changes to a single-column layout.
- `820px`: sidebar becomes a mobile drawer.
- `540px`: cards, approval controls, and agent lists use compact mobile layouts.

## Troubleshooting

### Chat loads but the agent does not respond

- Start the Python backend.
- Open <http://127.0.0.1:8000/health>.
- Check `AG_UI_AGENT_URL`.
- Inspect the Next.js terminal for `/api/copilotkit` errors.

### The interface says “Backend offline”

- Check `NEXT_PUBLIC_API_URL`.
- Ensure the backend allows the frontend URL through CORS.
- Restart `npm run dev` after changing `.env.local`.

### Port 3000 is already in use

Use the existing Next.js server if it belongs to this project, stop the
confirmed process, or run a different port:

```powershell
npm run dev -- --port 3001
```

When changing the frontend port, also update `FRONTEND_URL` in the backend
environment.
