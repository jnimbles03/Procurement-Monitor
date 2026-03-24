import { Layout } from "@/components/layout";
import { 
  useGetAlertsOverTime, 
  useGetAlertsByPriority, 
  useGetTopAgencies, 
  useGetRebidTimeline 
} from "@workspace/api-client-react";
import { 
  LineChart, Line, 
  BarChart, Bar, 
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'hsl(0, 84%, 60%)',
  MEDIUM: 'hsl(38, 92%, 50%)',
  WATCH: 'hsl(221, 83%, 53%)',
  LOW: 'hsl(215, 16%, 47%)'
};

function CustomTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border/50 p-3 rounded-lg shadow-xl">
        <p className="font-bold text-sm mb-1">{String(label)}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name}: {String(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

interface GanttEntry {
  agency: string;
  timeRange: number[];
  priority: string;
  status: string;
}

function GanttTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as GanttEntry;
    return (
      <div className="bg-popover border border-border/50 p-3 rounded-lg shadow-xl">
        <p className="font-bold text-sm mb-2 text-foreground">{data.agency}</p>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Start: <span className="font-medium text-foreground">{format(new Date(data.timeRange[0]), 'MMM d, yyyy')}</span></p>
          <p>End: <span className="font-medium text-foreground">{format(new Date(data.timeRange[1]), 'MMM d, yyyy')}</span></p>
          <p>Priority: <span className="font-bold" style={{ color: PRIORITY_COLORS[data.priority] }}>{data.priority}</span></p>
        </div>
      </div>
    );
  }
  return null;
}

export default function Analytics() {
  const { data: timeData } = useGetAlertsOverTime({ days: 90 });
  const { data: priorityData } = useGetAlertsByPriority();
  const { data: agencyData } = useGetTopAgencies({ limit: 8 });
  const { data: timelineData } = useGetRebidTimeline();

  const ganttData: GanttEntry[] = (timelineData || [])
    .filter(d => d.rebidWindowStart && d.rebidWindowEnd)
    .map(d => ({
      agency: d.agency.length > 20 ? d.agency.substring(0, 20) + '...' : d.agency,
      timeRange: [new Date(d.rebidWindowStart!).getTime(), new Date(d.rebidWindowEnd!).getTime()],
      priority: d.priority,
      status: d.status
    }));

  return (
    <Layout>
      <div className="p-8 space-y-6 animate-in fade-in duration-700">
        <div>
          <h1 className="text-3xl font-bold">Analytics & Intelligence</h1>
          <p className="text-muted-foreground mt-1">Macro trends across your public sector pipeline.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Alert Volume (Last 90 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val: string) => format(new Date(val), 'MMM d')}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      name="Alerts"
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, fill: "hsl(var(--primary))", stroke: "white", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Alert Distribution by Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={priorityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="priority"
                      stroke="none"
                    >
                      {priorityData?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.priority] ?? PRIORITY_COLORS.LOW} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Most Active Agencies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agencyData} layout="vertical" margin={{ top: 0, right: 20, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="agency" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 500 }}
                      width={120}
                    />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.5)' }} content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Alerts" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Rebid Windows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ganttData} layout="vertical" margin={{ top: 20, right: 20, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      type="number" 
                      domain={['dataMin - 2592000000', 'dataMax + 2592000000']}
                      tickFormatter={(val: number) => format(new Date(val), 'MMM yy')}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      orientation="top"
                    />
                    <YAxis 
                      dataKey="agency" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 500 }}
                      width={120}
                    />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.5)' }} content={<GanttTooltip />} />
                    <Bar dataKey="timeRange" radius={4} barSize={16}>
                      {ganttData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.priority] ?? PRIORITY_COLORS.LOW} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </Layout>
  );
}
