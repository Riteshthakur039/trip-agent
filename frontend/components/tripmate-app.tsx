"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CopilotChat,
  CopilotKit,
  UseAgentUpdate,
  useAgent,
  useConfigureSuggestions,
  useInterrupt,
} from "@copilotkit/react-core/v2";
import {
  Bot,
  Bus,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CloudSun,
  Copy,
  CreditCard,
  Download,
  EyeOff,
  FileText,
  Hotel,
  Loader2,
  Map,
  Menu,
  MessageCircle,
  Moon,
  Plane,
  Route,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  TrainFront,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BudgetAllocationCard,
  FlightBoardingPass,
  LuxuryHotelPass,
  WeatherHorizonCard,
  parseBudgetToNumber,
} from "./visual-passes";

const JourneyMap = dynamic(
  () => import("./journey-map").then((mod) => mod.JourneyMap),
  {
    ssr: false,
    loading: () => (
      <div className="journey-map-wrapper" style={{ minHeight: "340px", display: "grid", placeItems: "center" }}>
        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Loading Route Cartography…</span>
      </div>
    ),
  }
);

const AGENT_META = {
  flight_agent: { label: "Flights", icon: Plane },
  train_agent: { label: "India Rail", icon: TrainFront },
  bus_agent: { label: "India Bus", icon: Bus },
  hotel_agent: { label: "Stays", icon: Hotel },
  weather_agent: { label: "Weather", icon: CloudSun },
  budget_agent: { label: "Budget", icon: CircleDollarSign },
  itinerary_agent: { label: "Itinerary", icon: Route },
} as const;

type AgentName = keyof typeof AGENT_META;

type TripState = {
  user_query?: string;
  guardrail_allowed?: boolean;
  guardrail_reason?: string;
  selected_agents?: string[];
  supervisor_reasoning?: string;
  trip_constraints?: Record<string, unknown>;
  flight_results?: string;
  train_results?: string;
  bus_results?: string;
  hotel_results?: string;
  weather_results?: string;
  budget_results?: string;
  itinerary?: string;
  approval_request?: string;
  approved?: boolean;
  final_response?: string;
  llm_calls?: number;
};

type ApprovalPayload = {
  question?: string;
  message?: string;
  draft_itinerary?: string;
  approval_request?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function unwrapApprovalPayload(eventValue: unknown, interrupt: unknown): ApprovalPayload {
  const typedInterrupt = interrupt as {
    message?: string;
    metadata?: { langgraph?: { raw?: ApprovalPayload } };
  } | null;
  const raw = typedInterrupt?.metadata?.langgraph?.raw;
  if (raw && typeof raw === "object") return raw;
  if (eventValue && typeof eventValue === "object") return eventValue as ApprovalPayload;
  return { message: typedInterrupt?.message };
}

function ApprovalGate({
  payload,
  onResolve,
}: {
  payload: ApprovalPayload;
  onResolve: (result: { approved: boolean; feedback: string }) => Promise<unknown>;
}) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(approved: boolean) {
    if (!approved && !feedback.trim()) return;
    setSubmitting(true);
    try {
      await onResolve({ approved, feedback: feedback.trim() });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="approval-gate">
      <div className="approval-gate__top">
        <span className="approval-icon"><UserCheck size={19} /></span>
        <div>
          <span className="eyebrow">Human checkpoint</span>
          <h3>Your draft is ready for review</h3>
        </div>
      </div>
      <p>
        {payload.approval_request || payload.message || payload.question ||
          "Approve this itinerary or describe what you want changed."}
      </p>
      {payload.draft_itinerary && (
        <details className="draft-preview">
          <summary>Preview generated itinerary</summary>
          <div className="markdown compact-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {payload.draft_itinerary}
            </ReactMarkdown>
          </div>
        </details>
      )}
      <textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder="Optional for approval. Required when requesting a revision…"
        rows={3}
      />
      <div className="approval-actions">
        <button
          type="button"
          className="button primary approval-btn-primary"
          onClick={() => submit(true)}
          disabled={submitting}
          aria-label="Approve itinerary and finish"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Approving…</span>
            </>
          ) : (
            <>
              <Check size={18} strokeWidth={2.75} />
              <span>Approve &amp; finish</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="button secondary approval-btn-secondary"
          onClick={() => submit(false)}
          disabled={submitting || !feedback.trim()}
          aria-label="Revise plan with feedback"
        >
          <Sparkles size={17} />
          <span>Revise plan</span>
        </button>
      </div>
    </section>
  );
}

function AgentRail({ state, isRunning }: { state: TripState; isRunning: boolean }) {
  const selected = state.selected_agents ?? [];

  return (
    <div className="agent-rail">
      {(Object.entries(AGENT_META) as [AgentName, (typeof AGENT_META)[AgentName]][]).map(
        ([name, meta]) => {
          const Icon = meta.icon;
          const enabled = selected.includes(name);
          const resultKey = name.replace("_agent", "_results") as keyof TripState;
          const completed = Boolean(state[resultKey]) || (name === "itinerary_agent" && state.itinerary);
          return (
            <div className={`agent-item ${enabled ? "selected" : ""}`} key={name}>
              <span className="agent-icon"><Icon size={17} /></span>
              <div>
                <strong>{meta.label}</strong>
                <small>{completed ? "Completed" : enabled && isRunning ? "In pipeline" : enabled ? "Ready" : "Standby"}</small>
              </div>
              <span className={`agent-state ${completed ? "done" : enabled ? "queued" : ""}`}>
                {completed ? <Check size={12} /> : null}
              </span>
            </div>
          );
        },
      )}
    </div>
  );
}

function getSampleItinerary(destination: string, budget: string): string {
  const destLower = destination.toLowerCase();
  if (
    destLower.includes("uttar") ||
    destLower.includes("khand") ||
    destLower.includes("rishikesh") ||
    destLower.includes("haridwar") ||
    destLower.includes("dehradun")
  ) {
    return `### Day 1 · Delhi to Rishikesh / Gateway to Uttarakhand
- **06:30 AM**: Board **UTC Janrath / Volvo AC Express (UK-07-PA-2180)** at ISBT Kashmiri Gate (Bay 7 · Ticket: ₹650).
- **11:15 AM**: Arrival at Rishikesh ISBT · Transfer & check-in to **Ganga Valley Riverside Homestay / GMVN Lodge** in Tapovan (₹2,000/night · holy river & mountain view).
- **02:00 PM**: Walk across Laxman Jhula & Ram Jhula suspension bridges; explore vibrant riverside cafes.
- **06:00 PM**: Attend the sacred **Maha Ganga Aarti** at Triveni Ghat with floating diyas and spiritual chants.

### Day 2 · Neer Garh Waterfalls, Beatles Ashram & Forest Trail
- **08:00 AM**: Scenic morning hike to **Neer Garh Waterfall** with emerald mountain pools.
- **12:30 PM**: Organic Garhwali Thali lunch at Tapovan health cafe (₹350).
- **03:00 PM**: Visit the historic **Beatles Ashram (Chaurasi Kutia)** inside Rajaji Tiger Reserve boundary.
- **07:00 PM**: Traditional Ayurvedic dinner and riverfront evening tea.

### Day 3 · White-Water Rapid Breeze & Return to Delhi
- **08:30 AM**: Optional Grade-III river rafting session from Shivpuri to NIM Beach or leisurely beach walk.
- **01:00 PM**: Souvenir shopping at Rishikesh market (brass bells, rudraksha & Garhwali organic honey).
- **03:30 PM**: Board return **UTC AC Deluxe Coach** from Rishikesh ISBT back to New Delhi (Ticket: ₹650).
- **08:30 PM**: Safe arrival at ISBT Kashmiri Gate, Delhi.
- **Total Trip Cost**: **~₹6,800** · *Comfortably within your ${budget} budget!*`;
  }

  return `### Day 1 · Scenic Mountain Ascent: Chandigarh to Shimla
- **07:30 AM**: Board **HRTC Himgaura AC Deluxe Bus (HP-63-4412)** at ISBT Sector 43, Chandigarh (Bay 12 · Fare: ₹420).
- **11:15 AM**: Arrival at Shimla ISBT (Tutikandi) · Short transfer & check-in to **HPTDC Hotel Peterhof / Pineview Cedar Homestay** near Mall Road (₹1,800/night · clean, hot geyser & pine valley view).
- **02:00 PM**: Leisurely walk through historic British-era Mall Road, Gaiety Theatre & Scandal Point.
- **06:30 PM**: Golden sunset tea and hot local snacks at The Ridge overlooking the Shivalik peaks.

### Day 2 · Cedar Forest Trail, Jakhu Peak & Return
- **08:30 AM**: Morning pine forest trail up to Jakhu Temple & ropeway point.
- **12:30 PM**: Traditional Himachali Dham lunch & artisan shopping at Lakkar Bazaar (₹300).
- **03:30 PM**: Visit Viceregal Lodge (Indian Institute of Advanced Study) and heritage lawns.
- **06:00 PM**: Return **HRTC AC Deluxe Bus** from Shimla ISBT back to Chandigarh (Ticket: ₹420).
- **Total Trip Cost**: **~₹4,200** · *Comfortably within your ₹5,000 budget!*`;
}

function parseTripProfile(state: TripState) {
  const query = state.user_query || "";
  const constraints = state.trip_constraints || {};
  const itinerary = state.final_response || state.itinerary || "";
  const textBlob = `${query} ${itinerary}`.toLowerCase();

  // Extract explicit route from query text: "from [origin] to [destination]"
  const routeMatch = query.match(
    /\bfrom\s+([^\n,;]+?)\s+to\s+([^\n,;]+?)(?=\s+(?:via|by|for|on|with|under|within|during|using)\b|[,;.]|$)/i
  );
  const explicitOrigin = routeMatch ? routeMatch[1].trim() : "";
  const explicitDestination = routeMatch ? routeMatch[2].trim() : "";

  // 1. Budget extraction
  const budgetRaw = String(constraints.budget || "").trim();
  const budgetNum = parseBudgetToNumber(budgetRaw && budgetRaw !== "undefined" ? budgetRaw : query);
  const budget = `₹${budgetNum.toLocaleString("en-IN")}`;

  // 2. Origin & Destination extraction
  let origin = String(constraints.origin || "").trim();
  let destination = String(constraints.destination || "").trim();

  if (!origin || origin.toLowerCase() === "india" || origin === "undefined") {
    if (explicitOrigin) {
      origin = explicitOrigin.charAt(0).toUpperCase() + explicitOrigin.slice(1);
    } else if (textBlob.includes("delhi")) {
      origin = "New Delhi";
    } else if (textBlob.includes("chandigarh")) {
      origin = "Chandigarh";
    } else if (textBlob.includes("mumbai")) {
      origin = "Mumbai";
    } else if (textBlob.includes("bengaluru") || textBlob.includes("bangalore")) {
      origin = "Bengaluru";
    } else {
      origin = "New Delhi";
    }
  }

  if (!destination || destination === "undefined") {
    if (explicitDestination) {
      destination = explicitDestination.charAt(0).toUpperCase() + explicitDestination.slice(1);
    } else if (
      textBlob.includes("uttar") ||
      textBlob.includes("khand") ||
      textBlob.includes("rishikesh") ||
      textBlob.includes("haridwar") ||
      textBlob.includes("dehradun") ||
      textBlob.includes("mussoorie") ||
      textBlob.includes("nainital")
    ) {
      destination = "Uttarakhand";
    } else if (textBlob.includes("shimla")) {
      destination = "Shimla";
    } else if (textBlob.includes("manali")) {
      destination = "Manali";
    } else if (textBlob.includes("agra")) {
      destination = "Agra";
    } else if (textBlob.includes("jaipur")) {
      destination = "Jaipur";
    } else if (textBlob.includes("goa")) {
      destination = "Goa";
    } else if (textBlob.includes("tokyo")) {
      destination = "Tokyo";
    } else {
      destination = explicitDestination || "Uttarakhand";
    }
  }

  // 3. Overland / Road / Hill Station detection
  const overlandPlaces = [
    "uttarakhand",
    "rishikesh",
    "haridwar",
    "dehradun",
    "mussoorie",
    "nainital",
    "corbett",
    "jimcorbett",
    "auli",
    "kedarnath",
    "badrinath",
    "shimla",
    "manali",
    "chandigarh",
    "kalka",
    "agra",
    "jaipur",
    "dharamshala",
    "kasauli",
    "amritsar",
    "pune",
  ];
  const internationalKeywords = [
    "japan", "tokyo", "kyoto", "osaka", "singapore", "dubai", "thailand", "bangkok",
    "bali", "indonesia", "vietnam", "paris", "london", "europe", "usa", "america",
    "maldives", "malaysia", "switzerland", "nepal", "bhutan", "sri lanka", "korea", "seoul"
  ];
  const isInternational = internationalKeywords.some(
    (k) => destination.toLowerCase().includes(k) || origin.toLowerCase().includes(k) || textBlob.includes(k)
  );

  let isOverland = false;
  if (!isInternational) {
    const hasLiveBusOrTrain =
      Boolean(state.bus_results && /(?:ASTC|UTC|HRTC|Janrath|Volvo|Bus\s*Operator)/i.test(state.bus_results)) ||
      Boolean(state.train_results && /(?:Express|Rajdhani|Shatabdi|Train\s*No)/i.test(state.train_results));

    isOverland =
      overlandPlaces.includes(destination.toLowerCase()) ||
      overlandPlaces.includes(origin.toLowerCase()) ||
      hasLiveBusOrTrain ||
      (!textBlob.includes("flight") && !textBlob.includes("airplane") && (textBlob.includes("bus") || textBlob.includes("train")));
  }

  return { origin, destination, budget, isOverland };
}

function PlanCanvas({ state, isDark = true }: { state: TripState; isDark?: boolean }) {
  const content = state.final_response || state.itinerary;
  const [copied, setCopied] = useState(false);
  const [viewTab, setViewTab] = useState<"visual" | "passes" | "document">("visual");
  const [previewMode, setPreviewMode] = useState(false);

  const { origin, destination, budget, isOverland } = parseTripProfile(state);
  const activeContent = content || (previewMode ? getSampleItinerary(destination, budget) : "");

  if (!activeContent) {
    return (
      <section className="empty-plan">
        <span><Map size={24} /></span>
        <div style={{ flex: 1 }}>
          <h3>Your itinerary canvas is ready</h3>
          <p>Start a conversation and your interactive journey map, boarding passes, and bespoke blueprint will render here automatically.</p>
        </div>
        <button
          type="button"
          className="button secondary"
          style={{ gap: 8, whiteSpace: "nowrap" }}
          onClick={() => setPreviewMode(true)}
        >
          <Sparkles size={16} className="text-emerald" /> Preview Visual Studio
        </button>
      </section>
    );
  }

  async function copyPlan() {
    await navigator.clipboard.writeText(activeContent || "");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const isAdvisory = state.guardrail_allowed === false || activeContent.includes("### ⚠️");

  if (isAdvisory) {
    return (
      <section className="plan-canvas">
        <div className="section-heading">
          <div>
            <span className="eyebrow" style={{ color: "#f59e0b" }}>Reality Check &amp; Feasibility Notice</span>
            <h2>Travel Advisory &amp; Real Costs</h2>
          </div>
          <div className="heading-actions">
            <button className="icon-button labeled" onClick={copyPlan}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy Advisory"}
            </button>
          </div>
        </div>

        <div
          style={{
            margin: "12px 0 20px 0",
            padding: "16px 20px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(239, 68, 68, 0.05))",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(245, 158, 11, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f59e0b",
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text)" }}>
              Financial &amp; Route Reality Guardrail
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              The requested parameters cannot be safely booked in the physical world. Review the verified breakdown and alternative recommendations below.
            </p>
          </div>
        </div>

        <article className="markdown plan-document" style={{ maxWidth: "100%" }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
        </article>
      </section>
    );
  }

  return (
    <section className="plan-canvas">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{content ? (state.final_response ? "Curated Itinerary" : "Draft Intelligence") : "Studio Preview Mode"}</span>
          <h2>Your Travel Blueprint</h2>
        </div>

        <div className="plan-tab-group">
          <button
            type="button"
            className={`plan-tab-pill ${viewTab === "visual" ? "active" : ""}`}
            onClick={() => setViewTab("visual")}
          >
            <Map size={14} />
            <span>Visual Journey &amp; Map</span>
          </button>
          <button
            type="button"
            className={`plan-tab-pill ${viewTab === "passes" ? "active" : ""}`}
            onClick={() => setViewTab("passes")}
          >
            <CreditCard size={14} />
            <span>Digital Passes</span>
          </button>
          <button
            type="button"
            className={`plan-tab-pill ${viewTab === "document" ? "active" : ""}`}
            onClick={() => setViewTab("document")}
          >
            <FileText size={14} />
            <span>Blueprint Document</span>
          </button>
        </div>

        <div className="heading-actions">
          {previewMode && !content && (
            <button
              type="button"
              className="icon-button labeled"
              onClick={() => setPreviewMode(false)}
              title="Close Preview Mode"
            >
              <EyeOff size={15} /> Exit Preview
            </button>
          )}
          <button className="icon-button labeled" onClick={copyPlan}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="icon-button labeled" onClick={() => window.print()}>
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      {viewTab === "visual" && (
        <div className="visual-journey-container">
          <JourneyMap
            origin={origin}
            destination={destination}
            itineraryText={activeContent}
            isDark={isDark}
          />

          <div className="visual-widgets-grid">
            <FlightBoardingPass
              flightData={state.flight_results}
              busData={state.bus_results}
              itineraryText={activeContent}
              constraints={state.trip_constraints}
              origin={origin}
              destination={destination}
              isOverland={isOverland}
              totalBudget={budget}
            />
            <LuxuryHotelPass
              hotelData={state.hotel_results}
              itineraryText={activeContent}
              destination={destination}
              totalBudget={budget}
            />
          </div>

          <div className="visual-widgets-grid">
            <WeatherHorizonCard
              weatherData={state.weather_results}
              itineraryText={activeContent}
              destination={destination}
            />
            <BudgetAllocationCard
              budgetData={state.budget_results}
              itineraryText={activeContent}
              totalBudget={budget}
              isOverland={isOverland}
              destination={destination}
            />
          </div>

          <div className="timeline-section">
            <div className="section-subheading">
              <span className="eyebrow">Curated Schedule</span>
              <h3>Detailed Itinerary Breakdown</h3>
            </div>
            <article className="markdown plan-document-compact">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
            </article>
          </div>
        </div>
      )}

      {viewTab === "passes" && (
        <div className="passes-view-container">
          <FlightBoardingPass
            flightData={state.flight_results}
            busData={state.bus_results}
            itineraryText={activeContent}
            constraints={state.trip_constraints}
            origin={origin}
            destination={destination}
            isOverland={isOverland}
            totalBudget={budget}
          />
          <LuxuryHotelPass
            hotelData={state.hotel_results}
            itineraryText={activeContent}
            destination={destination}
            totalBudget={budget}
          />
          <WeatherHorizonCard
            weatherData={state.weather_results}
            itineraryText={activeContent}
            destination={destination}
          />
          <BudgetAllocationCard
            budgetData={state.budget_results}
            itineraryText={activeContent}
            totalBudget={budget}
            isOverland={isOverland}
            destination={destination}
          />
        </div>
      )}

      {viewTab === "document" && (
        <article className="markdown plan-document">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
        </article>
      )}
    </section>
  );
}

function Workspace() {
  const [dark, setDark] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(true);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const { agent } = useAgent({
    agentId: "tripmate",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
    throttleMs: 100,
  });
  const state = (agent.state ?? {}) as TripState;
  const planReady = Boolean(state.final_response);

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Japan · 7 days",
        message: "Plan a premium 7-day Japan trip from Delhi under INR 2 lakh with flights, hotels, weather and a balanced itinerary.",
      },
      {
        title: "Live train status",
        message: "Check live running status for Indian train 12951 and explain the next halt and current delay.",
      },
      {
        title: "Bengaluru buses",
        message: "Show upcoming buses from Majestic Bengaluru and clearly identify live versus scheduled departures.",
      },
    ],
    available: "always",
  });

  useInterrupt({
    agentId: "tripmate",
    render: ({ event, interrupt, resolve }) => (
      <ApprovalGate
        payload={unwrapApprovalPayload(event.value, interrupt)}
        onResolve={(result) => resolve(result)}
      />
    ),
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (planReady) setConversationOpen(false);
  }, [planReady]);

  useEffect(() => {
    let active = true;

    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health");
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          if (data.ok || data.status === "ok") {
            setBackendOnline(true);
            return;
          }
        }
      } catch {
        // Fallback to direct API_URL check
      }

      try {
        const direct = await fetch(`${API_URL}/health`);
        if (!active) return;
        setBackendOnline(direct.ok);
      } catch {
        if (!active) return;
        setBackendOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const selectedCount = state.selected_agents?.length ?? 0;
  const progress = useMemo(() => {
    if (!selectedCount) return 0;
    const resultKeys = ["flight_results", "train_results", "bus_results", "hotel_results", "weather_results", "budget_results", "itinerary"] as const;
    const complete = resultKeys.filter((key) => Boolean(state[key])).length;
    return Math.min(100, Math.round((complete / selectedCount) * 100));
  }, [selectedCount, state]);

  function showConversation() {
    setConversationOpen(true);
    window.setTimeout(() => {
      document.getElementById("copilot")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><Route size={23} /></span>
          <div><strong>Meridian</strong><small>Bespoke travel atelier</small></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}><X size={19} /></button>
        </div>

        <nav>
          <a className="active" href="#copilot"><Sparkles size={18} /> Travel copilot</a>
          <a href="#mission"><Zap size={18} /> Mission control</a>
          <a href="#itinerary"><Map size={18} /> Itinerary</a>
        </nav>

        <div className="sidebar-spacer" />
        <div className="stack-card">
          <span className="eyebrow">Private Concierge</span>
          <strong>Autonomous Collective</strong>
          <p>Real-time transit intelligence, boutique curation, and bespoke human discretion.</p>
        </div>
        <div className="sidebar-footer">
          <span className={`connection-dot ${backendOnline === false ? "offline" : ""}`} />
          {backendOnline === null ? "Checking services" : backendOnline ? "All systems online" : "Backend offline"}
        </div>
      </aside>

      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div>
            <span className="breadcrumb">Workspace <ChevronRight size={13} /> New journey</span>
            <h1>Good day, traveller.</h1>
          </div>
          <div className="topbar-actions">
            <span className="live-pill"><span /> Concierge active</span>
            <button className="theme-toggle" onClick={() => setDark((value) => !value)} aria-label="Toggle theme">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <section className="hero-panel">
          <div>
            <span className="hero-kicker"><Sparkles size={15} /> Travel intelligence, orchestrated</span>
            <h2>One conversation.<br /><em>Every detail handled.</em></h2>
            <p>Plan from India with real-time transport signals, INR-first budgeting and a human checkpoint before anything becomes final.</p>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span className="orbit-center"><Bot size={26} /></span>
            <span className="orbit-dot dot-plane"><Plane size={15} /></span>
            <span className="orbit-dot dot-train"><TrainFront size={15} /></span>
            <span className="orbit-dot dot-hotel"><Hotel size={15} /></span>
          </div>
        </section>

        <section className="stat-grid">
          <div className="stat-card"><ShieldCheck size={20} /><div><small>Safety layer</small><strong>{state.guardrail_allowed === false ? "Blocked" : state.guardrail_allowed ? "Passed" : "Ready"}</strong></div></div>
          <div className="stat-card"><Zap size={20} /><div><small>Agents selected</small><strong>{selectedCount || "Dynamic"}</strong></div></div>
          <div className="stat-card"><CircleDollarSign size={20} /><div><small>Default currency</small><strong>{String(state.trip_constraints?.currency ?? "INR")}</strong></div></div>
          <div className="stat-card"><UserCheck size={20} /><div><small>Human review</small><strong>{state.approved ? "Approved" : "Enabled"}</strong></div></div>
        </section>

        {!conversationOpen && (
          <section className={`conversation-summary ${planReady ? "plan-ready" : ""}`} id="copilot">
            <span className="conversation-summary__icon">
              {planReady ? <CheckCircle2 size={21} /> : <MessageCircle size={21} />}
            </span>
            <div>
              <span className="eyebrow">{planReady ? "Itinerary complete" : "Conversation paused"}</span>
              <h2>{planReady ? "Your plan is ready" : "Travel copilot is hidden"}</h2>
              <p>
                {planReady
                  ? "The conversation is tucked away so you can focus on your itinerary."
                  : "Your messages and agent progress are preserved."}
              </p>
            </div>
            <button className="conversation-toggle" onClick={showConversation} aria-expanded={false}>
              <MessageCircle size={17} /> Show conversation
            </button>
          </section>
        )}

        {planReady && <div id="itinerary"><PlanCanvas state={state} isDark={dark} /></div>}

        <div className={`dashboard-grid ${conversationOpen ? "" : "conversation-collapsed"}`}>
          {conversationOpen && <section className="chat-card" id="copilot">
            <div className="section-heading chat-heading">
              <div>
                <span className="eyebrow">Private Consultation</span>
                <h2>Travel copilot</h2>
              </div>
              <div className="chat-heading-actions">
                <span className={`working-badge ${agent.isRunning ? "working" : ""}`}>
                  <span /> {agent.isRunning ? "Agents working" : "Ready"}
                </span>
                <button
                  className="chat-visibility-button"
                  onClick={() => setConversationOpen(false)}
                  aria-label="Hide travel conversation"
                  aria-expanded={true}
                >
                  <EyeOff size={15} /> Hide
                </button>
              </div>
            </div>
            <div className="chat-surface">
              <CopilotChat agentId="tripmate" className="tripmate-chat" throttleMs={100} />
            </div>
          </section>}

          <aside className="mission-card" id="mission">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Live orchestration</span>
                <h2>Mission control</h2>
              </div>
              <span className="progress-number">{progress}%</span>
            </div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>

            <div className={`guardrail-card ${state.guardrail_allowed === false ? "blocked" : ""}`}>
              {state.guardrail_allowed === false ? <X size={18} /> : <ShieldCheck size={18} />}
              <div>
                <strong>{state.guardrail_allowed === false ? "Request blocked" : "Travel guardrail"}</strong>
                <p>{state.guardrail_reason || state.supervisor_reasoning || "Your request will be checked before specialist agents run."}</p>
              </div>
            </div>

            <AgentRail state={state} isRunning={agent.isRunning} />

            {state.trip_constraints && (
              <div className="constraint-grid">
                {Object.entries(state.trip_constraints).filter(([, value]) => value && String(value).length).slice(0, 4).map(([key, value]) => (
                  <div key={key}><small>{key.replaceAll("_", " ")}</small><strong>{Array.isArray(value) ? value.join(", ") : String(value)}</strong></div>
                ))}
              </div>
            )}
          </aside>
        </div>

        {!planReady && <div id="itinerary"><PlanCanvas state={state} isDark={dark} /></div>}

        <footer className="app-footer">
          <span>Meridian Atelier</span>
          <span>Curated Transit · Boutique Stays · Dynamic Climate · Private Discretion</span>
        </footer>
      </main>
    </div>
  );
}

export function MeridianApp() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="tripmate" useSingleEndpoint={false}>
      <Workspace />
    </CopilotKit>
  );
}

export const TripMateApp = MeridianApp;
