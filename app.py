import asyncio
import os
import sys
import traceback
from contextlib import asynccontextmanager

# Psycopg's async pool requires a selector loop on Windows. Set the policy
# before backend resources are imported or FastAPI starts its lifespan.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import uvicorn
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from backend import (
    close_ag_ui_backend_resources,
    close_backend_resources,
    open_ag_ui_backend_resources,
    resume_travel_agent,
    run_travel_agent,
)

# This is kept from the original project to allow the existing synchronous
# agent functions to call async MCP helpers inside FastAPI.
import nest_asyncio

nest_asyncio.apply()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        ag_ui_graph = await asyncio.create_task(open_ag_ui_backend_resources())
    except Exception as exc:
        print(f"AG-UI initialization error: {exc}; falling back to MemorySaver.")
        from langgraph.checkpoint.memory import MemorySaver
        from backend import graph
        ag_ui_graph = graph.compile(checkpointer=MemorySaver())

    if not any(getattr(route, "path", None) == "/ag-ui" for route in app.routes):
        add_langgraph_fastapi_endpoint(
            app=app,
            agent=LangGraphAGUIAgent(
                name="tripmate",
                description=(
                    "A multi-agent travel planner for flights, Indian trains and "
                    "buses, hotels, weather, budgets, itineraries, guardrails, "
                    "and human review."
                ),
                graph=ag_ui_graph,
            ),
            path="/ag-ui",
            tags=["AG-UI"],
        )
    try:
        yield
    finally:
        try:
            await asyncio.create_task(close_ag_ui_backend_resources())
        except Exception:
            pass
        try:
            close_backend_resources()
        except Exception:
            pass


app = FastAPI(
    title="Meridian Atelier API",
    description=(
        "Autonomous Multi-Agent Travel Concierge Engine with Real-Time "
        "Transport Intelligence and Human Discretion"
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://127.0.0.1:3000",
        "https://meridian-travel-atelier.vercel.app",
        "https://frontend-opal-psi-78.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TravelRequest(BaseModel):
    message: str
    thread_id: str | None = None


class ApprovalRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    approved: bool
    feedback: str = ""


@app.get("/", include_in_schema=False)
async def home():
    return RedirectResponse(url=FRONTEND_URL)


@app.post("/api/travel")
async def travel_planner(request_data: TravelRequest):
    try:
        user_message = request_data.message.strip()

        if not user_message:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Message cannot be empty.",
                },
            )

        result = run_travel_agent(
            user_input=user_message,
        )

        return JSONResponse(
            content={
                "success": True,
                **result,
            }
        )

    except Exception as exc:
        print("ERROR:", exc)
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(exc),
            },
        )


@app.post("/api/travel/approve")
async def approve_travel_plan(request_data: ApprovalRequest):
    try:
        if not request_data.approved and not request_data.feedback.strip():
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Please provide revision feedback when rejecting the draft.",
                },
            )

        result = resume_travel_agent(
            thread_id=request_data.thread_id,
            approved=request_data.approved,
            feedback=request_data.feedback,
        )

        return JSONResponse(
            content={
                "success": True,
                **result,
            }
        )

    except Exception as exc:
        print("APPROVAL ERROR:", exc)
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(exc),
            },
        )


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "Meridian Atelier API is running",
        "features": [
            "supervisor_agent",
            "input_guardrail",
            "human_in_the_loop",
            "india_train_mcp",
            "india_bus_mcp",
            "india_rail_mcp",
            "india_transit_mcp",
        ],
    }


@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(content={})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=False,
    )
