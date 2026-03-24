import { Layout } from "@/components/layout";
import {
  useGetAlertsOverTime,
  useGetAlertsByPriority,
  useGetTopAgencies,
  useGetRebidTimeline,
  useGetPipelineKpis,
  useGetTcvByPriority,
  useGetCompetitorBreakdown,
  useGetMatchScoreDistribution,
  useGetFederalExpiry,
} from "@workspace/api-client-react";
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { format, differenceInDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, AlertTriangle, Target, Calendar, Building2, Clock } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "hsl(0, 84%, 60%)",
  MEDIUM: "hsl(38, 92%, 50%)",
  WATCH: "hsl(221, 83%, 53%)",
  LOW: "hsl(215, 16%, 47%)",
};

const PRIORITY_BG: Record<string, string> = {
  HIGH: "bg-red-500/10 text-red-600 border-red-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  WATCH: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  LOW: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${PRIORITY_BG[priority] ?? PRIORITY_BG.LOW}`}>
      {priority}
    </span>
  );
}

function ChartTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border/50 px-3 py-2 rounded-lg shadow-xl text-sm">
      {label && <p className="font-semibold mb-1 text-foreground">{String(label)}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="font-medium" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" && entry.name?.toString().includes("$")
            ? formatCurrency(entry.value)
            : String(entry.value)}
        </p>
      ))}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl bg-muted/60 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface GanttEntry {
  agency: string;
  timeRange: number[];
  priority: string;
  status: string;
}

function GanttTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as GanttEntry;
  return (
    <div className="bg-popover border border-border/50 p-3 rounded-lg shadow-xl">
      <p className="font-bold text-sm mb-1 text-foreground">{data.agency}</p>
      <p className="text-xs text-muted-foreground">
        {format(new Date(data.timeRange[0]), "MMM d, yyyy")} — {format(new Date(data.timeRange[1]), "MMM d, yyyy")}
      </p>
      <p className="text-xs mt-1">
        Priority: <span className="font-bold" style={{ color: PRIORITY_COLORS[data.priority] }}>{data.priority}</span>
      </p>
    </div>
  );
}

export default function Analytics() {
  const { data: kpis } = useGetPipelineKpis();
  const { data: timeData } = useGetAlertsOverTime({ days: 90 });
  const { data: priorityData } = useGetAlertsByPriority();
  const { data: agencyData } = useGetTopAgencies({ limit: 8 });
  const { data: timelineData } = useGetRebidTimeline();
  const { data: tcvByPriority } = useGetTcvByPriority();
  const { data: competitors } = useGetCompetitorBreakdown();
  const { data: scoreDistribution } = useGetMatchScoreDistribution();
  const { data: federalExpiry } = useGetFederalExpiry();

  const ganttData: GanttEntry[] = (timelineData ?? [])
    .filter((d) => d.rebidWindowStart && d.rebidWindowEnd)
    .map((d) => ({
      agency: d.agency.length > 22 ? d.agency.substring(0, 22) + "…" : d.agency,
      timeRange: [new Date(d.rebidWindowStart!).getTime(), new Date(d.rebidWindowEnd!).getTime()],
      priority: d.priority,
      status: d.status,
    }));

  const avgScore = kpis ? Math.round(kpis.avgMatchScore * 100) : 0;
  const nextRebidLabel = kpis?.nextRebidDays != null
    ? kpis.nextRebidDays <= 0 ? "Active now" : `${kpis.nextRebidDays}d away`
    : "—";

  const competitorFiltered = (competitors ?? []).filter(
    (c) => !["N/A", "Unknown", "Will Not Disclose"].includes(c.competitor)
  );

  return (
    <Layout>
      <div className="p-8 space-y-7 animate-in fade-in duration-700">
        <div>
          <h1 className="text-3xl font-bold">Analytics & Intelligence</h1>
          <p className="text-muted-foreground mt-1">Macro trends, pipeline value, and competitive intelligence.</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            icon={TrendingUp}
            label="Pipeline TCV"
            value={kpis ? formatCurrency(kpis.totalTcv) : "—"}
            sub={`${kpis?.watchlistCount ?? 0} accounts`}
            color="text-primary"
          />
          <KpiCard
            icon={Target}
            label="Total Alerts"
            value={kpis ? String(kpis.totalAlerts) : "—"}
            sub="matched opportunities"
            color="text-blue-500"
          />
          <KpiCard
            icon={AlertTriangle}
            label="HIGH Priority"
            value={kpis ? String(kpis.highPriorityAlerts) : "—"}
            sub="alerts this scan"
            color="text-red-500"
          />
          <KpiCard
            icon={Building2}
            label="Avg Match Score"
            value={kpis ? `${avgScore}%` : "—"}
            sub="across all alerts"
            color="text-amber-500"
          />
          <KpiCard
            icon={Calendar}
            label="Next Rebid Window"
            value={nextRebidLabel}
            sub={`${kpis?.activeRebidCount ?? 0} windows open`}
            color="text-green-500"
          />
        </div>

        {/* Row 1: Alert Volume + TCV by Priority */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Card className="border-border/50 shadow-md lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Alert Volume — Last 90 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val: string) => format(new Date(val + "T00:00:00"), "MMM d")}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false} dy={8}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false} allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone" dataKey="count" name="Alerts"
                      stroke="hsl(var(--primary))" strokeWidth={2.5}
                      dot={{ r: 4, fill: "hsl(var(--primary))", stroke: "white", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: "hsl(var(--primary))", stroke: "white", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Pipeline TCV by Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tcvByPriority} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="priority"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatCurrency(v)}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false} width={52}
                    />
                    <Tooltip
                      content={(props) => {
                        if (!props.active || !props.payload?.length) return null;
                        const p = props.payload[0];
                        return (
                          <div className="bg-popover border border-border/50 px-3 py-2 rounded-lg shadow-xl text-sm">
                            <p className="font-semibold text-foreground mb-1">{String(props.label)} Priority</p>
                            <p style={{ color: PRIORITY_COLORS[String(props.label)] ?? PRIORITY_COLORS.LOW }}>
                              {formatCurrency(Number(p.value))}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="tcv" name="TCV" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {(tcvByPriority ?? []).map((entry, i) => (
                        <Cell key={i} fill={PRIORITY_COLORS[entry.priority] ?? PRIORITY_COLORS.LOW} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Priority Donut + Competitor Intelligence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Alert Distribution by Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="h-[200px] w-[200px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={priorityData} cx="50%" cy="50%"
                        innerRadius={60} outerRadius={85}
                        paddingAngle={4} dataKey="count" nameKey="priority" stroke="none"
                      >
                        {(priorityData ?? []).map((entry, i) => (
                          <Cell key={i} fill={PRIORITY_COLORS[entry.priority] ?? PRIORITY_COLORS.LOW} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={(props) => {
                          if (!props.active || !props.payload?.length) return null;
                          const p = props.payload[0];
                          return (
                            <div className="bg-popover border border-border/50 px-3 py-2 rounded-lg shadow-xl text-sm">
                              <p style={{ color: PRIORITY_COLORS[String(p.name)] ?? PRIORITY_COLORS.LOW }} className="font-bold">
                                {String(p.name)}
                              </p>
                              <p className="text-foreground">{String(p.value)} alerts</p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-3 flex-1">
                  {(priorityData ?? []).map((entry) => {
                    const total = (priorityData ?? []).reduce((s, e) => s + e.count, 0);
                    const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
                    return (
                      <div key={entry.priority} className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: PRIORITY_COLORS[entry.priority] ?? PRIORITY_COLORS.LOW }}
                        />
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-foreground">{entry.priority}</span>
                            <span className="text-muted-foreground">{entry.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: PRIORITY_COLORS[entry.priority] ?? PRIORITY_COLORS.LOW,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Competitor Intelligence</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Deals lost by incumbent vendor — sorted by TCV at risk</p>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={competitorFiltered}
                    layout="vertical"
                    margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="competitor" type="category"
                      axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))", fontWeight: 500 }}
                      width={90}
                    />
                    <Tooltip
                      content={(props) => {
                        if (!props.active || !props.payload?.length) return null;
                        const p = props.payload[0].payload as { competitor: string; count: number; totalTcv: number };
                        return (
                          <div className="bg-popover border border-border/50 px-3 py-2 rounded-lg shadow-xl text-sm">
                            <p className="font-semibold text-foreground mb-1">{p.competitor}</p>
                            <p className="text-primary">{formatCurrency(p.totalTcv)} TCV</p>
                            <p className="text-muted-foreground">{p.count} deal{p.count !== 1 ? "s" : ""} lost</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="totalTcv" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20}>
                      {competitorFiltered.map((_, i) => (
                        <Cell
                          key={i}
                          fill={`hsl(var(--primary) / ${Math.max(0.4, 1 - i * 0.12)})`}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Match Score Distribution */}
        <Card className="border-border/50 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Match Score Distribution</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">How closely each SAM.gov alert matches your watchlist criteria</p>
          </CardHeader>
          <CardContent>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={scoreDistribution}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                  barCategoryGap="25%"
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis
                    type="number" allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    dataKey="range" type="category"
                    axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--foreground))", fontWeight: 500 }}
                    width={62}
                  />
                  <Tooltip
                    content={(props) => {
                      if (!props.active || !props.payload?.length) return null;
                      return (
                        <div className="bg-popover border border-border/50 px-3 py-2 rounded-lg shadow-xl text-sm">
                          <p className="font-semibold text-foreground">{String(props.label)} match</p>
                          <p className="text-primary">{String(props.payload[0].value)} alerts</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Alerts" radius={[0, 4, 4, 0]} barSize={22}>
                    {(scoreDistribution ?? []).map((entry, i) => {
                      const score = entry.minScore;
                      const color = score >= 90 ? PRIORITY_COLORS.HIGH
                        : score >= 70 ? PRIORITY_COLORS.MEDIUM
                        : score >= 50 ? PRIORITY_COLORS.WATCH
                        : PRIORITY_COLORS.LOW;
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Row 4: Top Agencies + Rebid Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Most Active Agencies</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Alert frequency per watchlist account</p>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agencyData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      dataKey="agency" type="category" axisLine={false} tickLine={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground))", fontWeight: 500 }}
                      width={138}
                      tickFormatter={(v: string) => v.length > 20 ? v.substring(0, 20) + "…" : v}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted)/0.5)" }} />
                    <Bar dataKey="count" name="Alerts" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Rebid Window Calendar</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Estimated procurement windows by account</p>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ganttData}
                    layout="vertical"
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      domain={["dataMin - 5184000000", "dataMax + 5184000000"]}
                      tickFormatter={(v: number) => format(new Date(v), "MMM yy")}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false} orientation="top"
                    />
                    <YAxis
                      dataKey="agency" type="category" axisLine={false} tickLine={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground))", fontWeight: 500 }}
                      width={130}
                    />
                    <Tooltip content={<GanttTooltip />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
                    <Bar dataKey="timeRange" radius={3} barSize={14}>
                      {ganttData.map((entry, i) => (
                        <Cell key={i} fill={PRIORITY_COLORS[entry.priority] ?? PRIORITY_COLORS.LOW} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 5: Federal Contract Expiry Table */}
        <Card className="border-border/50 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Federal Contract Expiry Watch
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comparable USASpending.gov contracts — expiry signals recompete timing
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-6">Agency</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-3">Priority</th>
                    <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-3">TCV</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-3">Incumbent</th>
                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-3">Contract End</th>
                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-3">Potential End</th>
                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-6">Days to Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {(federalExpiry ?? []).map((entry) => {
                    const urgency = entry.daysToExpiry != null
                      ? entry.daysToExpiry < 90 ? "text-red-600 font-bold"
                      : entry.daysToExpiry < 365 ? "text-amber-600 font-semibold"
                      : "text-muted-foreground"
                      : "text-muted-foreground";

                    return (
                      <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-6 font-medium text-foreground">{entry.agency}</td>
                        <td className="py-3 px-3"><PriorityBadge priority={entry.priority} /></td>
                        <td className="py-3 px-3 text-right text-muted-foreground font-mono text-xs">
                          {entry.tcv ? formatCurrency(entry.tcv) : "—"}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground max-w-[180px] truncate" title={entry.usaSpendingRecipient ?? ""}>
                          {entry.usaSpendingRecipient
                            ? entry.usaSpendingRecipient.length > 22
                              ? entry.usaSpendingRecipient.substring(0, 22) + "…"
                              : entry.usaSpendingRecipient
                            : <span className="text-muted-foreground/40 italic">No match</span>}
                        </td>
                        <td className="py-3 px-3 text-center text-muted-foreground font-mono text-xs">
                          {entry.usaSpendingContractEnd
                            ? format(new Date(entry.usaSpendingContractEnd + "T00:00:00"), "MMM d, yyyy")
                            : "—"}
                        </td>
                        <td className="py-3 px-3 text-center text-muted-foreground font-mono text-xs">
                          {entry.usaSpendingPotentialEnd
                            ? format(new Date(entry.usaSpendingPotentialEnd + "T00:00:00"), "MMM d, yyyy")
                            : "—"}
                        </td>
                        <td className={`py-3 px-6 text-center font-mono text-xs ${urgency}`}>
                          {entry.daysToExpiry != null
                            ? entry.daysToExpiry < 0
                              ? "Expired"
                              : `${entry.daysToExpiry.toLocaleString()}d`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {(federalExpiry ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                        No federal contract data yet — run a USASpending lookup from the Watchlist page
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
