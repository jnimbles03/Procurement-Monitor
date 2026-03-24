import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetWinBackReadiness,
  useGetCompetitorBreakdown,
  useGetMatchScoreDistribution,
  useGetTcvByPriority,
} from "@workspace/api-client-react";
import type { WinBackEntry, CompetitorBreakdownPoint } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Zap, AlertTriangle, TrendingUp, Users, Brain, Clock, CheckCircle2, HelpCircle } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "hsl(0, 84%, 60%)",
  MEDIUM: "hsl(38, 92%, 50%)",
  WATCH: "hsl(221, 83%, 53%)",
  LOW: "hsl(215, 16%, 47%)",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  ACT_NOW: { label: "ACT NOW", bg: "bg-red-950", text: "text-red-300", border: "border-red-700" },
  IMMINENT: { label: "IMMINENT", bg: "bg-amber-950", text: "text-amber-300", border: "border-amber-700" },
  PREPARE: { label: "PREPARE", bg: "bg-blue-950", text: "text-blue-300", border: "border-blue-700" },
  PLAN: { label: "PLAN", bg: "bg-slate-800", text: "text-slate-300", border: "border-slate-600" },
  EXPIRED: { label: "EXPIRED", bg: "bg-slate-900", text: "text-slate-500", border: "border-slate-700" },
};

// Competitive advantage ratings per dimension (1–5, higher = stronger DocuSign advantage)
const PLAYBOOK_RATINGS: Record<string, { cost: number; esign: number; compliance: number; integrations: number; govPresence: number; angle: string }> = {
  Adobe:               { cost: 2, esign: 4, compliance: 3, integrations: 5, govPresence: 5, angle: "Lead with CLM + compliance automation — Adobe lacks native contract lifecycle." },
  IronClad:            { cost: 3, esign: 5, compliance: 5, integrations: 4, govPresence: 4, angle: "Emphasize Forms + government identity verification — IronClad has no public-sector UX." },
  "Madison Cloud":     { cost: 3, esign: 5, compliance: 4, integrations: 5, govPresence: 4, angle: "Highlight FedRAMP ATO at scale — Madison Cloud can't match enterprise SLA." },
  Nintex:              { cost: 3, esign: 5, compliance: 4, integrations: 3, govPresence: 3, angle: "Lead with eSign reliability + audit trail — Nintex signatures fail compliance audits." },
  Authorium:           { cost: 2, esign: 5, compliance: 4, integrations: 5, govPresence: 4, angle: "Show breadth: grants + contracts + permits — Authorium locks agencies into one workflow." },
  DocaPost:            { cost: 3, esign: 4, compliance: 5, integrations: 4, govPresence: 5, angle: "FedRAMP + US data residency are hard requirements — DocaPost has no US FedRAMP." },
  "Global Solutions Group": { cost: 2, esign: 4, compliance: 3, integrations: 5, govPresence: 4, angle: "DocuSign roadmap + Salesforce/ServiceNow integrations far outpace a regional reseller." },
};

const PLAYBOOK_DIMS = [
  { key: "cost" as const,         label: "Cost",         tip: "DocuSign's cost advantage vs incumbent's licensing model" },
  { key: "esign" as const,        label: "eSign Depth",  tip: "How much more capable our e-signature workflow is" },
  { key: "compliance" as const,   label: "Compliance",   tip: "FedRAMP, security certifications, US data residency advantage" },
  { key: "integrations" as const, label: "Integrations", tip: "Platform connections: Salesforce, ServiceNow, Workday, etc." },
  { key: "govPresence" as const,  label: "Gov Presence", tip: "Public sector market footprint and reference customers" },
];

const SCORE_LABELS: Record<number, { label: string; bg: string; text: string }> = {
  5: { label: "Strong",   bg: "rgba(34,197,94,0.25)",  text: "#4ade80" },
  4: { label: "Good",     bg: "rgba(34,197,94,0.12)",  text: "#86efac" },
  3: { label: "Neutral",  bg: "rgba(234,179,8,0.18)",  text: "#fbbf24" },
  2: { label: "Weak",     bg: "rgba(249,115,22,0.18)", text: "#fb923c" },
  1: { label: "None",     bg: "rgba(239,68,68,0.18)",  text: "#f87171" },
};

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

// ─── Tooltip ────────────────────────────────────────────────────────────────

function InfoTooltip({ content }: { content: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-block ml-1.5 align-middle">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
        aria-label="More information"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 border border-slate-600 text-xs text-slate-200 rounded-lg p-3 shadow-2xl leading-relaxed pointer-events-none">
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
        </span>
      )}
    </span>
  );
}

// ─── TCV Heatmap ─────────────────────────────────────────────────────────────

function heatBg(val: number, max: number, hue: string): string {
  const t = max > 0 ? Math.min(1, val / max) : 0;
  return `hsla(${hue}, 80%, 55%, ${0.1 + t * 0.55})`;
}

function TcvHeatmap({
  data,
  winBack,
}: {
  data: CompetitorBreakdownPoint[];
  winBack: WinBackEntry[];
}) {
  const real = data.filter((c) => !["N/A", "Will Not Disclose", "Unknown"].includes(c.competitor));
  const maxTcv = Math.max(...real.map((c) => c.totalTcv));
  const maxCount = Math.max(...real.map((c) => c.count));

  const openNowByComp: Record<string, number> = {};
  for (const e of winBack) {
    if (e.status === "ACT_NOW" && e.competitor) {
      openNowByComp[e.competitor] = (openNowByComp[e.competitor] ?? 0) + 1;
    }
  }
  const maxOpen = Math.max(1, ...Object.values(openNowByComp));

  const avgTcvByComp = real.map((c) => c.totalTcv / c.count);
  const maxAvg = Math.max(...avgTcvByComp);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wide">
            <th className="text-left px-4 py-2 font-semibold">Incumbent</th>
            <th className="text-center px-4 py-2 font-semibold">
              TCV at Risk
              <InfoTooltip content="Total contract value of deals lost to this incumbent — the revenue recoverable if DocuSign wins the rebid." />
            </th>
            <th className="text-center px-4 py-2 font-semibold">Deals Lost</th>
            <th className="text-center px-4 py-2 font-semibold">Avg Deal Size</th>
            <th className="text-center px-4 py-2 font-semibold">
              Windows Open
              <InfoTooltip content="How many accounts lost to this incumbent are currently in an active rebid window — immediate opportunity to win back." />
            </th>
          </tr>
        </thead>
        <tbody>
          {real.map((c, i) => {
            const avgTcv = c.totalTcv / c.count;
            const openNow = openNowByComp[c.competitor] ?? 0;
            return (
              <tr key={c.competitor} className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-100">{c.competitor}</td>
                <td className="px-3 py-2">
                  <div
                    className="rounded px-3 py-2 text-center font-mono font-bold text-sm"
                    style={{ background: heatBg(c.totalTcv, maxTcv, "0"), color: "#fca5a5" }}
                  >
                    {fmt(c.totalTcv)}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div
                    className="rounded px-3 py-2 text-center font-bold text-sm"
                    style={{ background: heatBg(c.count, maxCount, "25"), color: "#fcd34d" }}
                  >
                    {c.count}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div
                    className="rounded px-3 py-2 text-center font-mono text-sm"
                    style={{ background: heatBg(avgTcv, maxAvg, "200"), color: "#93c5fd" }}
                  >
                    {fmt(avgTcv)}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div
                    className="rounded px-3 py-2 text-center font-bold text-sm"
                    style={{
                      background: openNow > 0 ? heatBg(openNow, maxOpen, "0") : "rgba(100,100,100,0.08)",
                      color: openNow > 0 ? "#fca5a5" : "#475569",
                    }}
                  >
                    {openNow > 0 ? `${openNow} open` : "—"}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-4 mt-3 px-4">
        <span className="text-xs text-slate-600">Intensity:</span>
        {[
          { label: "Low", opacity: 0.12 },
          { label: "Med", opacity: 0.35 },
          { label: "High", opacity: 0.65 },
        ].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-6 h-3 rounded" style={{ background: `hsla(0,80%,55%,${s.opacity})` }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Playbook Heatmap ─────────────────────────────────────────────────────────

function PlaybookHeatmap({ competitors }: { competitors: CompetitorBreakdownPoint[] }) {
  const real = competitors.filter((c) => !["N/A", "Will Not Disclose", "Unknown"].includes(c.competitor));
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-semibold w-36">Incumbent</th>
              {PLAYBOOK_DIMS.map((d) => (
                <th key={d.key} className="text-center px-2 py-2 font-semibold">
                  <span className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                    {d.label}
                    <InfoTooltip content={d.tip} />
                  </span>
                </th>
              ))}
              <th className="text-left px-4 py-2 font-semibold">Winning Angle</th>
            </tr>
          </thead>
          <tbody>
            {real.map((c) => {
              const pb = PLAYBOOK_RATINGS[c.competitor];
              return (
                <tr key={c.competitor} className="border-t border-slate-800 hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-100 text-sm">{c.competitor}</div>
                    <div className="text-xs text-slate-500">{c.count} deal{c.count > 1 ? "s" : ""} · {fmt(c.totalTcv)}</div>
                  </td>
                  {pb ? PLAYBOOK_DIMS.map((d) => {
                    const score = pb[d.key];
                    const cfg = SCORE_LABELS[score] ?? SCORE_LABELS[3];
                    const cellKey = `${c.competitor}-${d.key}`;
                    return (
                      <td key={d.key} className="px-2 py-2 text-center relative">
                        <div
                          onMouseEnter={() => setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          className="rounded px-2 py-2 text-xs font-semibold cursor-default transition-transform hover:scale-105 mx-auto"
                          style={{ background: cfg.bg, color: cfg.text, minWidth: "60px" }}
                        >
                          {cfg.label}
                        </div>
                      </td>
                    );
                  }) : (
                    <td colSpan={5} className="px-4 py-3 text-xs text-slate-600">No data</td>
                  )}
                  <td className="px-4 py-3 text-xs text-emerald-400 max-w-xs leading-relaxed">
                    {pb?.angle}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-4 flex-wrap">
        <span className="text-xs text-slate-600">DocuSign advantage:</span>
        {[5, 4, 3, 2, 1].map((score) => {
          const cfg = SCORE_LABELS[score];
          return (
            <span key={score} className="flex items-center gap-1.5 text-xs">
              <span className="w-8 h-3 rounded" style={{ background: cfg.bg }} />
              <span style={{ color: cfg.text }}>{cfg.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-600" : score >= 55 ? "bg-amber-600" : score >= 40 ? "bg-blue-600" : "bg-slate-600";
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${color} text-white text-sm font-bold`}>
      {score}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PLAN;
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function AlertSignal({ count, score }: { count: number; score: number | null }) {
  if (count === 0) return <span className="text-slate-500 text-xs">No signals</span>;
  const pct = score != null ? Math.round(score * 100) : 0;
  const color = pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-slate-400";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {count} signal{count > 1 ? "s" : ""} · {pct}%
      <InfoTooltip content="SAM.gov opportunities matching this account's search terms. Match % = how closely the opportunity title overlaps the search terms, plus a global keyword bonus of up to +20%." />
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0"
      style={{ backgroundColor: PRIORITY_COLORS[priority] ?? "#6b7280" }}
    />
  );
}

function WinBackRow({ entry, rank }: { entry: WinBackEntry; rank: number }) {
  return (
    <tr className={`border-b border-slate-800 hover:bg-slate-800/50 ${entry.status === "EXPIRED" ? "opacity-50" : ""}`}>
      <td className="px-4 py-3 text-slate-500 text-sm w-8">{rank}</td>
      <td className="px-4 py-3 w-10"><ScoreBadge score={entry.winBackScore} /></td>
      <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
      <td className="px-4 py-3 min-w-[200px]">
        <div className="flex items-center text-sm font-medium text-slate-100">
          <PriorityDot priority={entry.priority} />
          {entry.agency}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 ml-3.5">{entry.state}</div>
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-200">{fmt(entry.tcv)}</td>
      <td className="px-4 py-3 text-sm text-slate-300">{entry.competitor || "—"}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{entry.urgencyLabel}</td>
      <td className="px-4 py-3">
        <AlertSignal count={entry.alertCount} score={entry.bestMatchScore ?? null} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-400 max-w-[280px]">{entry.actionHint}</td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { data: winBack = [], isLoading: wbLoading } = useGetWinBackReadiness();
  const { data: competitors = [] } = useGetCompetitorBreakdown();
  const { data: scoreDistribution = [] } = useGetMatchScoreDistribution();
  const { data: tcvByPriority = [] } = useGetTcvByPriority();

  const actNow = winBack.filter((e) => e.status === "ACT_NOW");
  const imminent = winBack.filter((e) => e.status === "IMMINENT");
  const withAlerts = winBack.filter((e) => e.alertCount > 0);
  const totalTcv = winBack.filter((e) => e.status !== "EXPIRED").reduce((s, e) => s + e.tcv, 0);

  const realCompetitors = competitors.filter(
    (c) => !["N/A", "Will Not Disclose", "Unknown"].includes(c.competitor)
  );

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Win-Back Intelligence</h1>
          <p className="text-slate-400 mt-1">
            Patterns from 21 lost deals — ranked by rebound opportunity and procurement signal strength
          </p>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-4 h-4 text-red-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Windows Open Now</span>
              </div>
              <div className="text-3xl font-bold text-red-400">{actNow.length}</div>
              <div className="text-xs text-slate-500 mt-1">accounts in active rebid window</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Opening &lt;90 Days</span>
              </div>
              <div className="text-3xl font-bold text-amber-400">{imminent.length}</div>
              <div className="text-xs text-slate-500 mt-1">windows opening imminently</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">
                  Active Signals
                  <InfoTooltip content="Alert Signal Quality measures how well SAM.gov procurement opportunities match the search terms for each watchlist account. Higher scores (80%+) indicate the opportunity closely matches the language of your lost deal, signaling a likely rebid." />
                </span>
              </div>
              <div className="text-3xl font-bold text-emerald-400">{withAlerts.length}</div>
              <div className="text-xs text-slate-500 mt-1">accounts with SAM.gov procurement signals</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">
                  Pipeline at Stake
                  <InfoTooltip content="Pipeline TCV (Total Contract Value) — the total dollar value of all contracts from lost deals that are currently in or approaching a rebid window. Winning these back represents recoverable revenue." />
                </span>
              </div>
              <div className="text-3xl font-bold text-blue-400">{fmt(totalTcv)}</div>
              <div className="text-xs text-slate-500 mt-1">total TCV across open windows</div>
            </CardContent>
          </Card>
        </div>

        {/* Win-Back Scoreboard */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Target className="w-5 h-5 text-red-400" />
              Win-Back Scoreboard
              <span className="text-sm font-normal text-slate-400 ml-2">
                — all 21 accounts ranked by composite opportunity score
              </span>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Score combines: Urgency (40 pts) + Procurement Signal (30 pts) + Federal Intel (20 pts) + Deal Value (10 pts)
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {wbLoading ? (
              <div className="p-8 text-center text-slate-500">Loading win-back data…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Score</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Account</th>
                      <th className="px-4 py-2 text-left">
                        TCV
                        <InfoTooltip content="Total Contract Value — the dollar size of the original deal lost to the incumbent. Higher TCV = more revenue at stake in the rebid." />
                      </th>
                      <th className="px-4 py-2 text-left">Incumbent</th>
                      <th className="px-4 py-2 text-left">Rebid Window</th>
                      <th className="px-4 py-2 text-left">
                        SAM.gov Signals
                        <InfoTooltip content="Active procurement signals detected on SAM.gov matching this account's search terms. The match % shows how closely the opportunity language aligns with the lost deal. Click the match % on the Dashboard to see a full breakdown." />
                      </th>
                      <th className="px-4 py-2 text-left">Recommended Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winBack.map((entry, i) => (
                      <WinBackRow key={entry.id} entry={entry} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Displacement Playbook Heatmap — full width */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-400" />
              Competitive Displacement Heatmap
            </CardTitle>
            <p className="text-xs text-slate-500">
              DocuSign's advantage strength across key dimensions vs each incumbent — green = strong, red = weak
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <PlaybookHeatmap competitors={realCompetitors} />
          </CardContent>
        </Card>

        {/* Bottom row: TCV heatmap + right charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* TCV at risk heatmap */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                TCV at Risk by Incumbent
                <InfoTooltip content="Pipeline TCV grouped by the vendor that won each deal. Darker cells = higher value. 'Windows Open' shows how many of those accounts are currently accepting bids." />
              </CardTitle>
              <p className="text-xs text-slate-500">Cell intensity reflects relative magnitude — hover rows for context</p>
            </CardHeader>
            <CardContent className="pt-0">
              <TcvHeatmap data={competitors} winBack={winBack} />
            </CardContent>
          </Card>

          {/* Right column */}
          <div className="space-y-6">
            {/* Alert Signal Quality */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Alert Signal Quality
                  <InfoTooltip content="Alert Signal Quality is the distribution of SAM.gov match scores across all detected alerts. A score of 80–100% means the opportunity text closely overlaps with your watchlist search terms — a strong procurement signal. Scores below 40% are noise." />
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Match % distribution across {scoreDistribution.reduce((s, d) => s + d.count, 0)} SAM.gov alerts
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {scoreDistribution.map((bucket) => {
                    const total = scoreDistribution.reduce((s, d) => s + d.count, 0);
                    const pct = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
                    const color =
                      bucket.minScore >= 90 ? "bg-emerald-500" :
                      bucket.minScore >= 70 ? "bg-blue-500" :
                      bucket.minScore >= 50 ? "bg-amber-500" :
                      bucket.minScore >= 30 ? "bg-orange-600" : "bg-slate-600";
                    return (
                      <div key={bucket.range} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-16 text-right">{bucket.range}</span>
                        <div className="flex-1 bg-slate-800 rounded h-5 overflow-hidden">
                          <div className={`h-full ${color} rounded`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-300 w-16">
                          {bucket.count} alert{bucket.count !== 1 ? "s" : ""} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Higher match scores indicate stronger procurement signal alignment with your deal history.
                </p>
              </CardContent>
            </Card>

            {/* TCV by Priority Tier */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Lost Deal Value by Priority Tier
                  <InfoTooltip content="Priority Tier is the strategic grouping of each watchlist account: HIGH = largest/most urgent accounts (top 5 by TCV or strategic fit), MEDIUM = active pursuit, WATCH = long-horizon but high value, LOW = small deals or low strategic fit." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={tcvByPriority} margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="#334155" />
                    <XAxis dataKey="priority" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                    <RechartTooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
                      formatter={(v: number) => [fmt(v), "TCV"]}
                    />
                    <Bar dataKey="tcv" radius={[4, 4, 0, 0]}>
                      {tcvByPriority.map((d) => (
                        <Cell key={d.priority} fill={PRIORITY_COLORS[d.priority] ?? "#6b7280"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
