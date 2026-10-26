import {
  CopilotRuntime,
  InMemoryAgentRunner,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { LangGraphHttpAgent } from "@copilotkit/runtime/langgraph";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const agentUrl =
  process.env.AG_UI_AGENT_URL ||
  (process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/ag-ui`
    : "http://localhost:8000/ag-ui");

const tripMateAgent = new LangGraphHttpAgent({
  url: agentUrl,
  description: "Meridian multi-agent travel planner",
});

const runtime = new CopilotRuntime({
  agents: {
    tripmate: tripMateAgent,
  },
  runner: new InMemoryAgentRunner(),
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  activateChannels: false,
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
