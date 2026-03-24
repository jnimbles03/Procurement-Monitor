import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetAlertStats, useListAlerts } from "@workspace/api-client-react";
import { format } from "date-fns";
import { ExternalLink, Filter, TrendingUp, Building2, AlertTriangle, Target, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-destructive/10 text-destructive border-destructive/20",
    MEDIUM: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    WATCH: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    LOW: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  };
  
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${styles[priority] || styles.LOW}`}>
      {priority}
    </span>
  );
}

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: stats, isLoading: statsLoading } = useGetAlertStats();
  const { data: alertsRes, isLoading: alertsLoading } = useListAlerts();

  const alerts = alertsRes?.data || [];
  const filteredAlerts = alerts.filter(a => 
    a.opportunityTitle.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.watchlistAgency.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
        
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time SAM.gov procurement alerts matching your watchlist.</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Alerts", value: stats?.totalAlerts || 0, icon: Target, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "High Priority", value: stats?.highPriorityAlerts || 0, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
            { label: "Unique Agencies", value: stats?.uniqueAgencies || 0, icon: Building2, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "Pipeline TCV", value: formatCurrency(stats?.totalPipelineTcv || 0), icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" },
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

        {/* Table Section */}
        <Card className="border-border/50 shadow-lg">
          <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <h2 className="text-xl font-bold">Recent Alerts</h2>
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
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Priority</th>
                  <th className="px-6 py-4 font-semibold">Agency</th>
                  <th className="px-6 py-4 font-semibold">Opportunity Title</th>
                  <th className="px-6 py-4 font-semibold">Sol #</th>
                  <th className="px-6 py-4 font-semibold">Deadline</th>
                  <th className="px-6 py-4 font-semibold">Match %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {alertsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse bg-muted/10">
                      <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-20"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-16"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-32"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-48"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-24"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-20"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-12"></div></td>
                    </tr>
                  ))
                ) : filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No alerts found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-muted-foreground">
                        {format(new Date(alert.postedDate), 'MMM d, yyyy')}
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
                        {alert.responseDeadline ? format(new Date(alert.responseDeadline), 'MMM d, yyyy') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full" 
                              style={{ width: `${parseFloat(alert.matchScore) * 100}%` }}
                            />
                          </div>
                          <span className="font-medium">{(parseFloat(alert.matchScore) * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
