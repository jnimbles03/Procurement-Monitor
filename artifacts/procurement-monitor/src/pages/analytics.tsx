import { Layout } from "@/components/layout";
import {
  useGetWinBackReadiness,
  useGetCompetitorBreakdown,
  useGetMatchScoreDistribution,
  useGetTcvByPriority,
} from "@workspace/api-client-react";
import type { WinBackEntry } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target, Zap, AlertTriangle, TrendingUp, Users, Brain, Clock, CheckCircle2,
} from "lucide-react";

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

const COMPETITOR_PLAYBOOK: Record<string, { weakness: string; angle: string }> = {
  Adobe: {
    weakness: "High licensing cost, limited e-signature workflow depth",
    angle: "Lead with DocuSign CLM integration + compliance automation — Adobe lacks native contract lifecycle.",
  },
  IronClad: {
    weakness: "Contract-focused, weak on forms & citizen-facing workflows",
    angle: "Emphasize DocuSign Forms + government identity verification. IronClad has no public-sector UX story.",
  },
  "Madison Cloud": {
    weakness: "Niche federal integrator, limited commercial-grade scale",
    angle: "Highlight FedRAMP authorization + ATO track record at scale. Madison Cloud can't match enterprise SLA.",
  },
  Nintex: {
    weakness: "Workflow automation-first, e-signature is a bolt-on",
    angle: "Lead with eSign reliability and audit trail — Nintex customers report signature failures in compliance audits.",
  },
  Authorium: {
    weakness: "State/local grant-writing focus, narrow use-case",
    angle: "Show breadth: DocuSign handles grants AND contracts AND permits — Authorium locks agencies into one workflow.",
  },
  DocaPost: {
    weakness: "European vendor, limited US FedRAMP presence",
    angle: "FedRAMP + US data residency is a hard requirement. Emphasize FEDRAMP High impact level.",
  },
  "Global Solutions Group": {
    weakness: "Regional SI, limited product investment",
    angle: "DocuSign's product roadmap and Salesforce/ServiceNow integrations far outpace a reseller's offering.",
  },
};

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-red-600" : score >= 55 ? "bg-amber-600" : score >= 40 ? "bg-blue-600" : "bg-slate-600";
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
      {count} signal{count > 1 ? "s" : ""} · {pct}% match
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
      <td className="px-4 py-3 w-10">
        <ScoreBadge score={entry.winBackScore} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={entry.status} />
      </td>
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

export default function Analytics() {
  const { data: winBack = [], isLoading: wbLoading } = useGetWinBackReadiness();
  const { data: competitors = [] } = useGetCompetitorBreakdown();
  const { data: scoreDistribution = [] } = useGetMatchScoreDistribution();
  const { data: tcvByPriority = [] } = useGetTcvByPriority();

  const actNow = winBack.filter((e) => e.status === "ACT_NOW");
  const imminent = winBack.filter((e) => e.status === "IMMINENT");
  const withAlerts = winBack.filter((e) => e.alertCount > 0);
  const totalTcv = winBack.filter((e) => e.status !== "EXPIRED").reduce((s, e) => s + e.tcv, 0);
  const topEntry = winBack[0];

  const competitorChartData = competitors
    .filter((c) => !["N/A", "Will Not Disclose", "Unknown"].includes(c.competitor))
    .map((c) => ({ ...c, totalTcv: Math.round(c.totalTcv / 1000) }));

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
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-red-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Windows Open Now</span>
              </div>
              <div className="text-3xl font-bold text-red-400">{actNow.length}</div>
              <div className="text-xs text-slate-500 mt-1">accounts in active rebid window</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Opening &lt;90 Days</span>
              </div>
              <div className="text-3xl font-bold text-amber-400">{imminent.length}</div>
              <div className="text-xs text-slate-500 mt-1">windows opening imminently</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Active Signals</span>
              </div>
              <div className="text-3xl font-bold text-emerald-400">{withAlerts.length}</div>
              <div className="text-xs text-slate-500 mt-1">accounts with SAM.gov procurement signals</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Pipeline at Stake</span>
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
                      <th className="px-4 py-2 text-left">TCV</th>
                      <th className="px-4 py-2 text-left">Incumbent</th>
                      <th className="px-4 py-2 text-left">Rebid Window</th>
                      <th className="px-4 py-2 text-left">SAM.gov Signals</th>
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

        {/* Bottom row: Competitive Playbook + Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Competitive Playbook */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                Competitive Displacement Playbook
              </CardTitle>
              <p className="text-xs text-slate-500">How to unseat each incumbent — based on deal loss patterns</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {competitorChartData.map((c) => {
                const pb = COMPETITOR_PLAYBOOK[c.competitor];
                return (
                  <div key={c.competitor} className="rounded-lg border border-slate-700 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100">{c.competitor}</span>
                      <div className="flex gap-3 text-xs text-slate-400">
                        <span>{c.count} deal{c.count > 1 ? "s" : ""} lost</span>
                        <span className="font-mono text-slate-300">{fmt(c.totalTcv * 1000)}</span>
                      </div>
                    </div>
                    {pb ? (
                      <>
                        <div className="text-xs text-amber-400">
                          <span className="font-semibold">Their weakness:</span> {pb.weakness}
                        </div>
                        <div className="text-xs text-emerald-400">
                          <span className="font-semibold">Your angle:</span> {pb.angle}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">Build competitive intelligence from deal notes.</div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Right column: two charts stacked */}
          <div className="space-y-6">
            {/* TCV at risk per competitor */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  TCV at Risk by Incumbent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={competitorChartData}
                    layout="vertical"
                    margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#334155" />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `$${v}K`} />
                    <YAxis type="category" dataKey="competitor" tick={{ fill: "#94a3b8", fontSize: 11 }} width={100} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
                      formatter={(v: number) => [`$${v}K`, "TCV at risk"]}
                    />
                    <Bar dataKey="totalTcv" radius={[0, 4, 4, 0]}>
                      {competitorChartData.map((_, i) => (
                        <Cell key={i} fill={["hsl(0,84%,60%)", "hsl(38,92%,50%)", "hsl(221,83%,53%)", "hsl(271,81%,56%)", "hsl(160,84%,39%)", "hsl(199,89%,48%)"][i % 6]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Match score distribution — signal quality */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Alert Signal Quality
                </CardTitle>
                <p className="text-xs text-slate-500">Match score distribution across {scoreDistribution.reduce((s, d) => s + d.count, 0)} SAM.gov alerts</p>
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

            {/* TCV by priority */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Lost Deal Value by Priority Tier
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={tcvByPriority} margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="#334155" />
                    <XAxis dataKey="priority" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip
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
