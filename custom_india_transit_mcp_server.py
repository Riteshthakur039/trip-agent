import os
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

mcp = FastMCP("India Transit MCP Server")

RAILRADAR_API_KEY = os.getenv("RAILRADAR_API_KEY")
TRANSITLAND_API_KEY = os.getenv("TRANSITLAND_API_KEY")

RAILRADAR_BASE_URL = "https://api.railradar.in/v1"
TRANSITLAND_BASE_URL = "https://transit.land/api/v2/rest"
REQUEST_TIMEOUT_SECONDS = 20


def _get_api_key(name: str, value: str | None) -> str:
    key = (value or "").strip()
    if not key or key.lower().startswith("replace_with_"):
        raise RuntimeError(
            f"{name} is not configured. Replace its placeholder in the project .env file."
        )
    return key


def _request_json(
    provider: str,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        response = requests.get(
            url,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        failed_response = getattr(exc, "response", None)
        details = (
            f" Response: {failed_response.text[:500]}"
            if failed_response is not None
            else ""
        )
        raise RuntimeError(f"{provider} request failed: {exc}.{details}") from exc
    except ValueError as exc:
        raise RuntimeError(f"{provider} returned invalid JSON.") from exc

    if not isinstance(payload, dict):
        raise RuntimeError(f"{provider} returned an unexpected response.")
    return payload


@mcp.tool()
def get_live_train_status(
    train_number: str,
    journey_date: str = "",
) -> dict[str, Any]:
    """Return real-time running status for a five-digit Indian train number."""
    train_number = train_number.strip()
    if not train_number.isdigit() or len(train_number) != 5:
        raise ValueError("train_number must be a five-digit Indian train number")

    params: dict[str, Any] = {
        "haltsOnly": "true",
        "includeCoordinates": "false",
    }
    if journey_date.strip():
        params["date"] = journey_date.strip()

    payload = _request_json(
        "RailRadar",
        f"{RAILRADAR_BASE_URL}/trains/{quote(train_number)}/live",
        headers={
            "Authorization": (
                "Bearer " + _get_api_key("RAILRADAR_API_KEY", RAILRADAR_API_KEY)
            )
        },
        params=params,
    )

    data = payload.get("data", payload)
    if not isinstance(data, dict):
        return {"provider": "RailRadar", "raw": payload}

    route = data.get("route", [])
    upcoming_stops = []
    if isinstance(route, list):
        upcoming_stops = [
            stop
            for stop in route
            if isinstance(stop, dict) and stop.get("status") != "departed"
        ][:8]

    return {
        "provider": "RailRadar",
        "is_live": data.get("isLive"),
        "train_number": data.get("trainNumber", train_number),
        "train_name": data.get("trainName"),
        "start_date": data.get("startDate"),
        "last_updated_at": data.get("lastUpdatedAt"),
        "status": data.get("status"),
        "delay_minutes": data.get("delayMinutes"),
        "current_location": data.get("currentLocation"),
        "previous_halt": data.get("previousHalt"),
        "next_halt": data.get("nextHalt"),
        "exceptions": data.get("exceptions", []),
        "upcoming_stops": upcoming_stops,
    }


@mcp.tool()
def get_live_bus_departures(
    stop_name: str,
    next_minutes: int = 60,
    limit: int = 10,
) -> dict[str, Any]:
    """
    Find an Indian bus stop and return upcoming departures.

    Real-time estimates are included only when that operator publishes a
    GTFS-Realtime TripUpdates feed; otherwise scheduled times are returned.
    """
    stop_name = stop_name.strip()
    if not stop_name:
        raise ValueError("stop_name cannot be empty")

    next_minutes = max(5, min(next_minutes, 240))
    limit = max(1, min(limit, 20))
    api_key = _get_api_key("TRANSITLAND_API_KEY", TRANSITLAND_API_KEY)
    headers = {"apikey": api_key}

    stops_payload = _request_json(
        "Transitland",
        f"{TRANSITLAND_BASE_URL}/stops",
        headers=headers,
        params={
            "search": stop_name,
            "served_by_route_type": 3,
            "include_routes": "true",
            "limit": 25,
        },
    )

    stops = stops_payload.get("stops", [])
    india_stops = [
        stop
        for stop in stops
        if isinstance(stop, dict)
        and (stop.get("place") or {}).get("adm0_iso") == "IN"
    ]

    if not india_stops:
        return {
            "provider": "Transitland",
            "query": stop_name,
            "message": (
                "No covered Indian bus stop was found. Transitland availability "
                "depends on the local operator publishing GTFS data."
            ),
            "departures": [],
        }

    stop = india_stops[0]
    stop_key = stop.get("onestop_id") or stop.get("id")
    departures_payload = _request_json(
        "Transitland",
        f"{TRANSITLAND_BASE_URL}/stops/{quote(str(stop_key), safe='')}/departures",
        headers=headers,
        params={
            "next": next_minutes * 60,
            "limit": limit,
            "include_alerts": "true",
        },
    )

    departures: list[dict[str, Any]] = []
    for departure_stop in departures_payload.get("stops", []):
        if not isinstance(departure_stop, dict):
            continue
        for departure in departure_stop.get("departures", []):
            if not isinstance(departure, dict):
                continue
            trip = departure.get("trip") or {}
            route = trip.get("route") or {}
            if route.get("route_type") not in (None, 3):
                continue
            departure_time = departure.get("departure") or {}
            arrival_time = departure.get("arrival") or {}
            departures.append(
                {
                    "route": (
                        route.get("route_short_name")
                        or route.get("route_long_name")
                        or route.get("route_id")
                    ),
                    "headsign": (
                        departure.get("stop_headsign")
                        or trip.get("trip_headsign")
                    ),
                    "scheduled_departure": (
                        departure_time.get("scheduled_local")
                        or departure.get("departure_time")
                    ),
                    "estimated_departure": departure_time.get("estimated_local"),
                    "estimated_arrival": arrival_time.get("estimated_local"),
                    "delay_seconds": departure_time.get("delay"),
                    "estimated_delay_seconds": departure_time.get(
                        "estimated_delay"
                    ),
                    "schedule_relationship": departure.get("schedule_relationship"),
                    "realtime_timestamp": trip.get("timestamp"),
                    "alerts": trip.get("alerts", []),
                }
            )
            if len(departures) >= limit:
                break
        if len(departures) >= limit:
            break

    return {
        "provider": "Transitland",
        "query": stop_name,
        "stop": {
            "name": stop.get("stop_name"),
            "code": stop.get("stop_code"),
            "onestop_id": stop.get("onestop_id"),
            "place": stop.get("place"),
        },
        "realtime_available": any(
            item.get("estimated_departure") or item.get("realtime_timestamp")
            for item in departures
        ),
        "departures": departures,
        "coverage_note": (
            "Live estimates are available only when the local operator publishes "
            "GTFS-Realtime TripUpdates; otherwise times are scheduled."
        ),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
