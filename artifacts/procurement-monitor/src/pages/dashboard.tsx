import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetAlertStats, useListAlerts, useGetAlertBreakdown } from "@workspace/api-client-react";
import { format, isValid } from "date-fns";
import {
  ExternalLink, Filter, TrendingUp, Building2, AlertTriangle, Target,
  Search, ArrowUpDown, ArrowUp, ArrowDown, X, CheckCircle2, XCircle, Minus, Zap,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Alert, AlertBreakdown } from "@workspace/api-client-react";

type SortKey = "timestamp" | "watchlistPriority" | "watchlistAgency" | "matchScore" | "responseDeadline";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2, LOW: 3 };

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-destructive/10 text-destructive border-destructive/20",
    MEDIUM: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    WATCH: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    LOW: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${styles[priority] ?? styles.LOW}`}>
      {priority}
    </span>
  );
}

function safeFormatDate(value: string | null | undefined, fmt: string): string {
  if (!value) return "N/A";
  const d = new Date(value);
  return isValid(d) ? format(d, fmt) : "N/A";
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="inline w-3.5 h-3.5 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="inline w-3.5 h-3.5 ml-1 text-primary" />
    : <ArrowDown className="inline w-3.5 h-3.5 ml-1 text-primary" />;
}

function MatchBar({ score, onClick }: { score: number; onClick: () => void }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-slate-400";
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 group/bar cursor-pointer hover:opacity-80 transition-opacity"
      title="Click to see match breakdown"
    >
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-medium group-hover/bar:underline">{pct}%</span>
    </button>
  );
}

function BreakdownDrawer({
  alertId,
  onClose,
}: {
  alertId: number;
  onClose: () => void;
}) {
  const { data: bd, isLoading } = useGetAlertBreakdown(alertId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Match Score Breakdown</h2>
            <p className="text-xs text-slate-500 mt-0.5">How the score was calculated</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-slate-400 text-sm">Loading breakdown…</div>
          </div>
        ) : bd ? (
          <BreakdownContent bd={bd} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-slate-500 text-sm">No breakdown data available</div>
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownContent({ bd }: { bd: AlertBreakdown }) {
  const totalPct = Math.round(bd.matchScore * 100);
  const basePct = Math.round(bd.baseScore * 100);
  const bonusPct = Math.round(bd.globalKeywordBonus * 100);

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* Opportunity header */}
      <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 space-y-1">
        <div className="text-xs text-slate-500 uppercase tracking-wide">Opportunity</div>
        <div className="text-sm font-semibold text-slate-100 leading-snug">{bd.opportunityTitle}</div>
        <div className="text-xs text-slate-400">Matched to watchlist: <span className="text-slate-200">{bd.watchlistAgency}</span></div>
      </div>

      {/* Final score */}
      <div className="rounded-lg bg-slate-800 border border-slate-700 p-4">
        <div className="flex items-end gap-3 mb-3">
          <span className="text-4xl font-black text-slate-100">{totalPct}%</span>
          <span className="text-slate-400 text-sm mb-1">total match score</span>
        </div>
        <div className="space-y-2">
          <ScoreRow label="Best search term match" value={basePct} color="bg-blue-500" max={100} />
          {bd.globalKeywordBonus > 0 && (
            <ScoreRow label="Global keyword bonus" value={bonusPct} color="bg-emerald-500" max={20} />
          )}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Score = max(per-term word overlap) + global keyword bonus (up to +20%), capped at 100%.
          Only the title text is used in this reconstruction — the original scan also checked description and org path.
        </p>
      </div>

      {/* Per-term breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
          Search Term Analysis
        </h3>
        <div className="space-y-3">
          {bd.termBreakdowns.map((tb) => {
            const pct = Math.round(tb.termScore * 100);
            return (
              <div
                key={tb.term}
                className={`rounded-lg border p-4 space-y-2 ${
                  tb.isBestTerm
                    ? "border-blue-600 bg-blue-950/40"
                    : "border-slate-700 bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-slate-200">"{tb.term}"</span>
                  <div className="flex items-center gap-2">
                    {tb.isBestTerm && (
                      <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded font-medium">
                        best match
                      </span>
                    )}
                    <span className={`text-sm font-bold ${pct > 0 ? "text-blue-400" : "text-slate-500"}`}>
                      {pct}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tb.termWords.map((word) => {
                    const matched = tb.matchedWords.includes(word);
                    return (
                      <span
                        key={word}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          matched
                            ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700"
                            : "bg-slate-800 text-slate-500 border border-slate-700"
                        }`}
                      >
                        {matched ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {word}
                      </span>
                    );
                  })}
                </div>
                {tb.termWords.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {tb.matchedWords.length}/{tb.termWords.length} words matched in opportunity text
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global keyword bonus */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
          Global Keyword Bonus
        </h3>
        <div className={`rounded-lg border p-4 ${bd.globalKeywordsMatched.length > 0 ? "border-emerald-700 bg-emerald-950/30" : "border-slate-700 bg-slate-800/50"}`}>
          {bd.globalKeywordsMatched.length > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-300 font-medium">+{bonusPct}% bonus applied</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {bd.globalKeywordsMatched.map((kw) => (
                  <span key={kw} className="text-xs bg-emerald-900/60 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded">
                    "{kw}"
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                At least one configured global keyword was found in the opportunity title.
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-500">No global keywords matched — no bonus applied</span>
            </div>
          )}
        </div>
      </div>

      {/* Why we lost context */}
      {bd.watchlistReason && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wide">Why We Lost</h3>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-sm text-slate-300">{bd.watchlistReason}</p>
            {bd.watchlistNotes && (
              <p className="text-xs text-slate-500 mt-2">{bd.watchlistNotes}</p>
            )}
          </div>
        </div>
      )}

      {/* Opportunity words used */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wide">
          Opportunity Title Words
        </h3>
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-700 bg-slate-800/30 p-3">
          {bd.oppWordsUsed.length === 0 ? (
            <span className="text-xs text-slate-500">No words extracted</span>
          ) : (
            bd.oppWordsUsed.map((w) => (
              <span key={w} className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded font-mono">
                {w}
              </span>
            ))
          )}
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Words &gt;2 chars extracted from opportunity title (stopwords not removed)
        </p>
      </div>
    </div>
  );
}

function ScoreRow({ label, value, color, max }: { label: string; value: number; color: string; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-44 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-200 w-10 text-right">+{value}%</span>
    </div>
  );
}

function sortAlerts(alerts: Alert[], key: SortKey, dir: SortDir): Alert[] {
  return [...alerts].sort((a, b) => {
    let cmp = 0;
    if (key === "watchlistPriority") {
      cmp = (PRIORITY_ORDER[a.watchlistPriority] ?? 99) - (PRIORITY_ORDER[b.watchlistPriority] ?? 99);
    } else if (key === "matchScore") {
      cmp = parseFloat(a.matchScore) - parseFloat(b.matchScore);
    } else if (key === "timestamp") {
      cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    } else if (key === "responseDeadline") {
      const aT = a.responseDeadline ? new Date(a.responseDeadline).getTime() : Infinity;
      const bT = b.responseDeadline ? new Date(b.responseDeadline).getTime() : Infinity;
      cmp = aT - bT;
    } else if (key === "watchlistAgency") {
      cmp = a.watchlistAgency.localeCompare(b.watchlistAgency);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);

  const { data: stats, isLoading: statsLoading } = useGetAlertStats();
  const { data: alertsRes, isLoading: alertsLoading } = useListAlerts();

  const alerts = alertsRes?.data ?? [];

  const filteredAlerts = alerts.filter(
    a =>
      a.opportunityTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.watchlistAgency.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedAlerts = sortAlerts(filteredAlerts, sortKey, sortDir);

  const handleSort = (col: SortKey) => {
    if (col === sortKey) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  };

  const thClass = "px-6 py-4 font-semibold cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <Layout>
      <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">

        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time SAM.gov procurement alerts matching your watchlist.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Alerts", value: stats?.totalAlerts ?? 0, icon: Target, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "High Priority", value: stats?.highPriorityAlerts ?? 0, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
            { label: "Unique Agencies", value: stats?.uniqueAgencies ?? 0, icon: Building2, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "Pipeline TCV", value: formatCurrency(stats?.totalPipelineTcv ?? 0), icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" },
          ].map((stat, i) => (
            <Card key={i} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  {statsLoading ? (
                    <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/50 shadow-lg">
          <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Recent Alerts</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click any match % to see the score breakdown</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search agencies or titles..."
                  className="pl-9 bg-muted/50 border-border/50"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" className="shrink-0">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                <tr>
                  <th className={thClass} onClick={() => handleSort("timestamp")}>
                    Date <SortIcon col="timestamp" sortKey={sortKey} sortDir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort("watchlistPriority")}>
                    Priority <SortIcon col="watchlistPriority" sortKey={sortKey} sortDir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort("watchlistAgency")}>
                    Agency <SortIcon col="watchlistAgency" sortKey={sortKey} sortDir={sortDir} />
                  </th>
                  <th className="px-6 py-4 font-semibold">Opportunity Title</th>
                  <th className="px-6 py-4 font-semibold">Sol #</th>
                  <th className={thClass} onClick={() => handleSort("responseDeadline")}>
                    Deadline <SortIcon col="responseDeadline" sortKey={sortKey} sortDir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => handleSort("matchScore")}>
                    Match % <SortIcon col="matchScore" sortKey={sortKey} sortDir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {alertsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse bg-muted/10">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-6 py-4"><div className="h-4 bg-muted rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : sortedAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No alerts found. Run a scan to populate results.
                    </td>
                  </tr>
                ) : (
                  sortedAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      className={`hover:bg-muted/30 transition-colors group ${selectedAlertId === alert.id ? "bg-muted/20" : ""}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-muted-foreground">
                        {safeFormatDate(alert.postedDate, "MMM d, yyyy")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PriorityBadge priority={alert.watchlistPriority} />
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {alert.watchlistAgency}
                      </td>
                      <td className="px-6 py-4 max-w-md">
                        <a
                          href={alert.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline inline-flex items-start gap-1"
                        >
                          <span className="line-clamp-2">{alert.opportunityTitle}</span>
                          <ExternalLink className="w-3 h-3 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {alert.solicitationNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {safeFormatDate(alert.responseDeadline, "MMM d, yyyy")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <MatchBar
                          score={parseFloat(alert.matchScore)}
                          onClick={() => setSelectedAlertId(alert.id === selectedAlertId ? null : alert.id)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {selectedAlertId !== null && (
        <BreakdownDrawer
          alertId={selectedAlertId}
          onClose={() => setSelectedAlertId(null)}
        />
      )}
    </Layout>
  );
}
