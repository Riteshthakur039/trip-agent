# TripMate AI

TripMate AI is a multi-agent travel-planning application built with LangGraph,
FastAPI, AG-UI, CopilotKit, Next.js, and React. It plans trips from an
India-first perspective, uses INR as the default currency, can consult flight,
weather, hotel, Indian train, and Indian bus data sources, and pauses for human
approval before producing the final itinerary.

## Main features

- Conversational travel planning with streamed AG-UI events.
- Dynamic supervisor that selects only the agents required for a request.
- Travel-domain input guardrail.
- Flight search with a default departure airport of Delhi (`DEL`).
- Indian train status and bus departure MCP tools.
- Weather, hotel, budget, and itinerary agents.
- Human-in-the-loop approval and revision cycle.
- PostgreSQL LangGraph checkpoints with an in-memory fallback.
- Responsive React interface with dark/light themes and itinerary export.
- Backward-compatible REST endpoints in addition to the AG-UI endpoint.

## Architecture

```mermaid
flowchart LR
    U[Browser] --> F[Next.js + React frontend]
    F --> CK[CopilotKit runtime\n/api/copilotkit]
    CK --> AG[FastAPI AG-UI endpoint\n/ag-ui]
    AG --> LG[LangGraph travel graph]
    LG --> LLM[Groq LLM]
    LG --> MCP[MCP clients]
    MCP --> T[Tavily]
    MCP --> A[AviationStack]
    MCP --> W[OpenWeather]
    MCP --> R[RailRadar]
    MCP --> B[TransitLand]
    LG --> PG[(PostgreSQL checkpoints)]
```

The Next.js application is the user-facing interface. CopilotKit translates
chat interactions into AG-UI events and streams LangGraph state back to React.
FastAPI also keeps the original REST workflow available for non-AG-UI clients.

## Agent workflow

```mermaid
flowchart TD
    Q[User request] --> G[Input guardrail]
    G -->|Blocked| X[Safe rejection]
    G -->|Allowed| S[Supervisor]
    S --> D{Selected specialist agents}
    D --> F[Flight]
    D --> T[Indian train]
    D --> B[Indian bus]
    D --> H[Hotel]
    D --> W[Weather]
    D --> C[Budget]
    F --> I[Itinerary]
    T --> I
    B --> I
    H --> I
    W --> I
    C --> I
    I --> R{Human review}
    R -->|Approve| Final[Final itinerary]
    R -->|Revision feedback| Revise[Revise itinerary]
    Revise --> R
```

The specialist nodes run in the order configured in `AGENT_ORDER`, but only
agents selected by the supervisor are executed. The itinerary agent is always
included so specialist results can be combined into one draft.

## Technology stack

### Backend

- Python 3.11
- FastAPI and Uvicorn
- LangGraph and LangChain
- Groq chat models
- AG-UI LangGraph adapter
- CopilotKit Python integration
- PostgreSQL and `langgraph-checkpoint-postgres`
- Model Context Protocol (MCP)

### Frontend

- Next.js 16
- React 19 and TypeScript
- CopilotKit React v2
- AG-UI protocol
- Lucide React icons
- React Markdown and GitHub-flavored Markdown
- Custom responsive CSS

## Project structure

```text
trip Agent/
├── app.py                         # FastAPI app, API routes, CORS and AG-UI endpoint
├── backend.py                     # LangGraph state, agents, routing, HITL and checkpoints
├── mcp_client.py                  # MCP server definitions and tool wrappers
├── custom_weather_mcp_server.py   # Local OpenWeather MCP server
├── custom_india_transit_mcp_server.py
│                                    # Local train and bus MCP server
├── tools/
│   ├── flight_tool.py             # Airport resolution and flight formatting
│   └── tavily_tool.py             # Direct Tavily helper
├── frontend/
│   ├── app/
│   │   ├── api/copilotkit/[[...slug]]/route.ts
│   │   │                              # CopilotKit-to-AG-UI runtime bridge
│   │   ├── globals.css             # Theme and responsive application styles
│   │   ├── layout.tsx              # Root layout and metadata
│   │   └── page.tsx                # Main page
│   ├── components/
│   │   └── tripmate-app.tsx        # Chat, mission control, HITL and itinerary UI
│   ├── .env.local.example          # Frontend environment template
│   ├── package.json                # Frontend dependencies and commands
│   └── README.md                   # Frontend-specific documentation
├── requirements.txt               # Python dependencies
├── dockerfile                     # Backend container image
├── .dockerignore
├── .env                           # Local secrets; never commit this file
├── test_flight_defaults.py         # India/Delhi route default tests
└── README.md
```

Generated directories such as `.venv`, `frontend/node_modules`,
`frontend/.next`, `__pycache__`, and `.pytest_cache` are not part of the source
structure.

## Prerequisites

- Python 3.11
- Node.js 20 or newer
- npm
- PostgreSQL database URL
- Groq API key
- `uv`/`uvx` when using the AviationStack MCP package
- Provider API keys for the external tools you want to enable

## Environment variables

Create `.env` in the project root. Do not commit real secrets.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-20b

DEFAULT_ORIGIN_IATA=DEL
DEFAULT_CURRENCY=INR

TAVILY_API_KEY=your_tavily_key
AVIATIONSTACK_API_KEY=your_aviationstack_key
OPENWEATHER_API_KEY=your_openweather_key
RAILRADAR_API_KEY=your_railradar_key
TRANSITLAND_API_KEY=your_transitland_key

FRONTEND_URL=http://localhost:3000

# Optional LangSmith tracing
LANGSMITH_TRACING=false
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=tripmate
```

`AVIATION_STACK_API_KEY` is also accepted as an alternative spelling for the
AviationStack key. Placeholder train or bus keys are rejected with a readable
configuration error.

### Variable reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | LangGraph PostgreSQL checkpoint storage. |
| `GROQ_API_KEY` | Yes | Authentication for the Groq-hosted LLM. |
| `GROQ_MODEL` | No | Model name; defaults to `openai/gpt-oss-20b`. |
| `DEFAULT_ORIGIN_IATA` | No | Default departure airport; defaults to `DEL`. |
| `DEFAULT_CURRENCY` | No | Default budget currency; defaults to `INR`. |
| `TAVILY_API_KEY` | For hotel/web search | Tavily MCP search access. |
| `AVIATIONSTACK_API_KEY` | For live flights | AviationStack MCP access. |
| `OPENWEATHER_API_KEY` | For weather | Current weather and forecast data. |
| `RAILRADAR_API_KEY` | For trains | Indian train-status provider access. |
| `TRANSITLAND_API_KEY` | For buses | Bus departure provider access. |
| `FRONTEND_URL` | No | Allowed frontend origin and backend redirect target. |
| `LANGSMITH_*` | No | Optional LangGraph/LangChain observability. |

## Local installation

### 1. Create and activate the Python environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Install the frontend

```powershell
cd frontend
npm install
cd ..
```

### 3. Start the backend

```powershell
python app.py
```

The backend starts at <http://127.0.0.1:8000>. On Windows, prefer
`python app.py`; the application configures a selector event loop required by
Psycopg's asynchronous connection pool.

### 4. Start the frontend

Open a second terminal:

```powershell
cd frontend
npm run dev
```

Open <http://localhost:3000>.

## Local URLs

| URL | Purpose |
| --- | --- |
| <http://localhost:3000> | React travel-planning interface |
| <http://127.0.0.1:8000/docs> | FastAPI Swagger documentation |
| <http://127.0.0.1:8000/health> | Backend health check |
| `http://127.0.0.1:8000/ag-ui` | AG-UI streaming endpoint |
| `http://localhost:3000/api/copilotkit` | CopilotKit runtime endpoint |

## Frontend configuration

The frontend works with local defaults without an `.env.local` file. To
override them, copy `frontend/.env.local.example` to `frontend/.env.local`:

```dotenv
AG_UI_AGENT_URL=http://localhost:8000/ag-ui
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- `AG_UI_AGENT_URL` is server-only and tells the Next.js runtime where the
  FastAPI AG-UI agent is hosted.
- `NEXT_PUBLIC_API_URL` is used by the browser for the backend health check.

Restart the Next.js development server after changing these values.

## API reference

### `POST /api/travel`

Starts the compatibility REST workflow. The graph pauses when the itinerary is
ready for human review.

Request:

```json
{
  "message": "Plan a seven-day Japan trip from Delhi under INR 200000"
}
```

Important response fields:

```json
{
  "success": true,
  "thread_id": "user_...",
  "requires_approval": true,
  "approval_request": "Please review the itinerary...",
  "itinerary": "...",
  "selected_agents": ["flight_agent", "hotel_agent", "itinerary_agent"],
  "trip_constraints": {
    "origin": "India",
    "currency": "INR"
  }
}
```

Store the returned `thread_id`; it is required to resume the same graph.

### `POST /api/travel/approve`

Approves a draft or sends it back for revision.

Approve:

```json
{
  "thread_id": "user_...",
  "approved": true,
  "feedback": ""
}
```

Request a revision:

```json
{
  "thread_id": "user_...",
  "approved": false,
  "feedback": "Use fewer hotel changes and add one free afternoon."
}
```

Revision feedback is required when `approved` is `false`. A revised itinerary
returns to the human approval step.

### `POST /ag-ui`

Streams AG-UI protocol events for the CopilotKit frontend. It transports chat
messages, graph state snapshots, run status, and human-interrupt resolution.
Normally the frontend accesses it through the Next.js `/api/copilotkit` route
rather than calling it directly.

### `GET /health`

Returns backend status and the enabled high-level features.

## MCP integrations

| MCP server | Transport | Tools/use |
| --- | --- | --- |
| Tavily | Streamable HTTP | Hotel and general travel web search |
| AviationStack | `stdio` through `uvx` | Flight data |
| Weather | Local Python `stdio` | Current weather and forecast |
| India transit | Local Python `stdio` | Train status and bus departures |

`mcp_client.py` loads only the requested MCP server. Therefore, one unavailable
provider does not prevent unrelated tools from running. Agent functions also
return readable provider errors so the itinerary can continue with the data
that remains available.

## Human-in-the-loop behavior

1. The itinerary agent creates a draft.
2. LangGraph calls `interrupt()` with the draft and a response schema.
3. CopilotKit renders the approval card in React.
4. Approving routes the state to `final_agent`.
5. Rejecting requires feedback and routes to `revise_itinerary_agent`.
6. The revised draft pauses for approval again.
7. When the final response arrives, the frontend collapses the conversation and
   moves the finished plan into focus. The conversation remains available from
   the **Show conversation** button.

## Persistence

The synchronous REST graph and asynchronous AG-UI graph attempt to use the same
PostgreSQL database for LangGraph checkpoints. If PostgreSQL is unavailable at
startup, the application falls back to `MemorySaver` so the service can still
run.

The in-memory fallback has one important limitation: conversation checkpoints
are lost when the backend process restarts.

## Useful commands

Backend syntax check:

```powershell
python -m py_compile app.py backend.py mcp_client.py custom_weather_mcp_server.py custom_india_transit_mcp_server.py
```

Run tests after installing `pytest`:

```powershell
pip install pytest
pytest -q
```

Frontend type check and production build:

```powershell
cd frontend
npm run typecheck
npm run build
```

## Docker

The root `dockerfile` builds the FastAPI backend:

```powershell
docker build -f dockerfile -t tripmate-backend .
docker run --env-file .env -p 8000:8000 tripmate-backend
```

The frontend is currently run or deployed as a separate Next.js application.
Set its `AG_UI_AGENT_URL` to the publicly reachable backend `/ag-ui` URL.

## Troubleshooting

### Port 8000 cannot be opened

Check for a stale process:

```powershell
netstat -ano | findstr :8000
```

Stop only the confirmed process using that PID, or change the port in `app.py`
and update the frontend URLs.

### PostgreSQL connection errors

- Confirm `DATABASE_URL` uses the external PostgreSQL URL.
- Include SSL settings when required by the provider.
- Check that the hosted database is running and accepts your IP.
- When connection setup fails, TripMate logs the error and uses in-memory
  checkpoints for that process.

### Groq `413` or token-limit errors

The request is larger than the model or account token-per-minute limit. Keep
`GROQ_MODEL=openai/gpt-oss-20b`, reduce the amount of source material passed to
the final agent, wait for the rate window, or use a service tier with a larger
limit.

### Aviation MCP cannot start

Install `uv`, reopen the terminal, and verify:

```powershell
uvx --version
```

### Frontend reports that the backend is offline

- Confirm <http://127.0.0.1:8000/health> works.
- Confirm `NEXT_PUBLIC_API_URL` uses the correct backend address.
- Confirm `FRONTEND_URL` matches the browser origin allowed by FastAPI CORS.
- Restart both development servers after changing environment variables.

## Security notes

- Never commit `.env` or `.env.local`.
- Replace demo or placeholder provider keys before using live transit data.
- Treat external search and MCP output as untrusted data.
- Keep the input guardrail enabled.
- Do not expose PostgreSQL credentials to the browser or in
  `NEXT_PUBLIC_*` variables.

## Current defaults

| Setting | Default |
| --- | --- |
| Origin country | India |
| Origin airport | Delhi (`DEL`) |
| Currency | Indian rupee (`INR`) |
| LLM | `openai/gpt-oss-20b` through Groq |
| Backend port | `8000` |
| Frontend port | `3000` |

