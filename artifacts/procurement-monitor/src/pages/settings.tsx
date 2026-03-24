import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetConfig, useUpdateConfig, AppConfig } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Save, Key, Mail, Search, Clock, ShieldCheck, AlertCircle } from "lucide-react";

export default function Settings() {
  const { data: config, isLoading } = useGetConfig();
  const updateMutation = useUpdateConfig();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<AppConfig | null>(null);

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  if (isLoading || !formData) return <Layout><div className="p-8 text-center animate-pulse">Loading settings...</div></Layout>;

  const handleSave = () => {
    updateMutation.mutate({ data: formData }, {
      onSuccess: () => toast({ title: "Settings saved successfully" }),
      onError: () => toast({ title: "Error saving settings", variant: "destructive" })
    });
  };

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">System Configuration</h1>
            <p className="text-muted-foreground mt-1">Manage integration keys, engine parameters, and notifications.</p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            className="shadow-lg shadow-primary/20 hover-elevate hover:-translate-y-0.5 transition-all"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <div className="grid gap-6">
          {/* SAM.gov Integration */}
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="h-1 bg-primary w-full"></div>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="w-5 h-5 text-primary" /> SAM.gov API Integration
              </CardTitle>
              <CardDescription>Connection status for the federal procurement data feed.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/50">
                {formData.samApiKeyConfigured ? (
                  <><ShieldCheck className="w-6 h-6 text-green-500" /> <div><p className="font-bold text-foreground">API Key Configured & Active</p><p className="text-sm text-muted-foreground">The matching engine is authenticated.</p></div></>
                ) : (
                  <><AlertCircle className="w-6 h-6 text-red-500" /> <div><p className="font-bold text-foreground">API Key Missing</p><p className="text-sm text-muted-foreground">Please configure the SAM_API_KEY environment variable.</p></div></>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Matching Engine */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="w-5 h-5 text-primary" /> Engine Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-sm font-semibold">Match Threshold</label>
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-primary font-bold">
                      {(formData.matchThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="1" step="0.05"
                    value={formData.matchThreshold}
                    onChange={e => setFormData({...formData, matchThreshold: parseFloat(e.target.value)})}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">Minimum score required to trigger an alert.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold">Default Scan Window (Days)</label>
                  <Input 
                    type="number" 
                    value={formData.scanWindowDays}
                    onChange={e => setFormData({...formData, scanWindowDays: parseInt(e.target.value) || 30})}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Global Keywords & NAICS */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="w-5 h-5 text-primary" /> Target Definitions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold">Global NAICS Codes</label>
                  <textarea 
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={formData.naicsCodes.join('\n')}
                    onChange={e => setFormData({...formData, naicsCodes: e.target.value.split('\n').map(s=>s.trim()).filter(Boolean)})}
                    placeholder="541511&#10;541512"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold">Global Keywords</label>
                  <textarea 
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={formData.searchKeywords.join('\n')}
                    onChange={e => setFormData({...formData, searchKeywords: e.target.value.split('\n').map(s=>s.trim()).filter(Boolean)})}
                    placeholder="contract management&#10;software"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5 text-primary" /> Automation Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/30 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={formData.scheduleEnabled}
                    onChange={e => setFormData({...formData, scheduleEnabled: e.target.checked})}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="font-semibold text-sm">Enable Daily Background Scans</p>
                    <p className="text-xs text-muted-foreground">Automatically run the engine via node-cron.</p>
                  </div>
                </label>
                
                {formData.scheduleEnabled && (
                  <div className="space-y-2 pt-2 animate-in slide-in-from-top-2">
                    <label className="text-sm font-semibold">Execution Time</label>
                    <Input 
                      type="time" 
                      value={formData.scheduleTime}
                      onChange={e => setFormData({...formData, scheduleTime: e.target.value})}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Email */}
            <Card className="border-border/50 shadow-sm opacity-60 hover:opacity-100 transition-opacity">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mail className="w-5 h-5 text-primary" /> Email Notifications <span className="text-[10px] uppercase bg-muted px-2 py-0.5 rounded ml-2 tracking-wider">Beta</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <label className="flex items-center gap-3 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/30 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={formData.emailEnabled}
                    onChange={e => setFormData({...formData, emailEnabled: e.target.checked})}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="font-semibold text-sm">Send Alert Digests</p>
                    <p className="text-xs text-muted-foreground">Deliver high-priority alerts to team.</p>
                  </div>
                </label>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// Temporary import fix for Target
import { Target } from "lucide-react";
