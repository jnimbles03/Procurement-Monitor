import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useTriggerScan, useListScanLogs, useGetScanLog, getGetScanLogQueryKey } from "@workspace/api-client-react";
import { Play, Loader2, CheckCircle2, XCircle, Search, Clock, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

export default function RunScan() {
  const [scanDays, setScanDays] = useState(30);
  const [useKeywords, setUseKeywords] = useState(true);
  const [useNaics, setUseNaics] = useState(true);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  
  const { data: history, refetch: refetchHistory } = useListScanLogs({ limit: 5 });
  const triggerMutation = useTriggerScan({
    mutation: {
      onSuccess: (data) => {
        setActiveScanId(data.id);
        refetchHistory();
      }
    }
  });

  const [isPolling, setIsPolling] = useState(false);

  // Fetch active scan status
  const { data: activeScan, refetch: refetchActiveScan } = useGetScanLog(activeScanId || 0, {
    query: {
      queryKey: getGetScanLogQueryKey(activeScanId || 0),
      enabled: !!activeScanId,
    }
  });

  // Poll using setInterval when scan is running
  useEffect(() => {
    if (!activeScanId) return;
    if (activeScan?.status === 'completed' || activeScan?.status === 'failed') {
      setIsPolling(false);
      refetchHistory();
      return;
    }
    setIsPolling(true);
    const timer = setInterval(() => { void refetchActiveScan(); }, 2000);
    return () => clearInterval(timer);
  }, [activeScanId, activeScan?.status, refetchActiveScan, refetchHistory]);

  const handleStart = () => {
    triggerMutation.mutate({
      data: {
        scanWindowDays: scanDays,
        useKeywords,
        useNaics,
      }
    });
  };

  const isRunning = activeScan?.status === 'running' || triggerMutation.isPending;

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        <div>
          <h1 className="text-3xl font-bold">Run Scan</h1>
          <p className="text-muted-foreground mt-1">Manually trigger the SAM.gov matching engine.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Controls */}
          <Card className="col-span-1 shadow-md border-border/50">
            <CardHeader className="bg-muted/20 border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" /> Scan Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-foreground">Scan Window (Days)</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    type="number" 
                    value={scanDays} 
                    onChange={e => setScanDays(parseInt(e.target.value) || 30)}
                    className="pl-9 font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Look back period for SAM.gov notices.</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Search Strategies</p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="use-keywords" className="text-sm text-muted-foreground cursor-pointer">Keyword search</Label>
                  <Switch id="use-keywords" checked={useKeywords} onCheckedChange={setUseKeywords} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="use-naics" className="text-sm text-muted-foreground cursor-pointer">NAICS code search</Label>
                  <Switch id="use-naics" checked={useNaics} onCheckedChange={setUseNaics} />
                </div>
                {!useKeywords && !useNaics && (
                  <p className="text-xs text-destructive">At least one strategy must be enabled.</p>
                )}
              </div>

              <div className="pt-4 border-t border-border/50">
                <Button
                  className="w-full h-12 text-base font-bold shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
                  onClick={handleStart}
                  disabled={isRunning || (!useKeywords && !useNaics)}
                >
                  {isRunning ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Engine Running...</>
                  ) : (
                    <><Play className="w-5 h-5 mr-2 fill-current" /> Initialize Scan</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Log / Results */}
          <Card className="col-span-1 md:col-span-2 shadow-md border-border/50 bg-sidebar text-sidebar-foreground overflow-hidden">
            <CardHeader className="border-b border-sidebar-border/50 bg-sidebar/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-sidebar-primary-foreground">
                <Database className="w-5 h-5 text-primary" /> Engine Output
              </CardTitle>
              <CardDescription className="text-sidebar-foreground/60">Live feed from the matching service</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[300px] overflow-y-auto p-4 font-mono text-sm leading-relaxed">
                {activeScanId ? (
                  <div className="space-y-2 whitespace-pre-wrap text-sidebar-foreground/80">
                    {activeScan?.progressLog || "Initializing matching engine...\nConnecting to SAM.gov API...\n"}
                    {isRunning && (
                      <div className="flex items-center gap-2 text-primary mt-4 animate-pulse">
                        <span className="w-2 h-4 bg-primary inline-block animate-bounce" /> Processing...
                      </div>
                    )}
                    {activeScan?.status === 'completed' && (
                      <div className="mt-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Scan Completed Successfully</p>
                          <p className="text-xs mt-1">Found {activeScan.totalAlerts} alerts from {activeScan.totalOpportunities} opportunities.</p>
                        </div>
                      </div>
                    )}
                    {activeScan?.status === 'failed' && (
                      <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3">
                        <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Scan Failed</p>
                          <p className="text-xs mt-1">{activeScan.errorMessage || "Unknown error occurred"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-sidebar-foreground/40 italic">
                    Engine idle. Ready for manual trigger.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <div className="pt-8">
          <h3 className="text-xl font-bold mb-4">Recent Scans</h3>
          <div className="grid grid-cols-1 gap-3">
            {history?.map(log => (
              <div key={log.id} className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  {log.status === 'completed' ? <CheckCircle2 className="text-green-500 w-5 h-5" /> : 
                   log.status === 'failed' ? <XCircle className="text-red-500 w-5 h-5" /> : 
                   <Loader2 className="text-primary w-5 h-5 animate-spin" />}
                  <div>
                    <p className="font-semibold">Automated SAM.gov Engine Run</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(log.startedAt), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground font-medium mb-0.5">Processed</p>
                    <p className="font-mono font-bold">{log.totalOpportunities}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="text-center">
                    <p className="text-muted-foreground font-medium mb-0.5">Alerts</p>
                    <p className="font-mono font-bold text-primary">{log.totalAlerts}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
