import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListWatchlistEntries, useCreateWatchlistEntry, useDeleteWatchlistEntry, WatchlistEntry, CreateWatchlistEntryInput } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Plus, Upload, Trash2, Pencil, Search, Building } from "lucide-react";
import { formatCurrency, calculateRebidStatus } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function StatusBadge({ status }: { status: "UPCOMING" | "ACTIVE" | "CLOSED" }) {
  const styles = {
    UPCOMING: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400",
    ACTIVE: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-400",
    CLOSED: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/20 dark:text-gray-400",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border uppercase ${styles[status]}`}>{status}</span>;
}

export default function Watchlist() {
  const { data: entries, isLoading } = useListWatchlistEntries();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateWatchlistEntryInput>>({
    priority: "MEDIUM",
    state: "TX",
    searchTerms: [],
    tcv: "0",
  });

  const createMutation = useCreateWatchlistEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
        setIsAddOpen(false);
        toast({ title: "Entry added", description: "Watchlist updated successfully." });
      },
      onError: () => toast({ title: "Error", description: "Failed to add entry.", variant: "destructive" })
    }
  });

  const deleteMutation = useDeleteWatchlistEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
        toast({ title: "Entry deleted" });
      }
    }
  });

  const filteredEntries = entries?.filter(e => 
    e.agency.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.competitor.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agency) return;
    
    createMutation.mutate({ data: formData as CreateWatchlistEntryInput });
  };

  return (
    <Layout>
      <div className="p-8 space-y-6 animate-in fade-in duration-500">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Watchlist</h1>
            <p className="text-muted-foreground mt-1">Manage target agencies, lost deals, and upcoming rebids.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="bg-background shadow-sm hover-elevate" onClick={() => toast({ title: "Import Successful", description: "Mock: Imported 21 records from Excel." })}>
              <Upload className="w-4 h-4 mr-2" /> Import Excel
            </Button>
            
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-md shadow-primary/20 hover-elevate hover:-translate-y-0.5 transition-transform">
                  <Plus className="w-4 h-4 mr-2" /> Add Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Add Watchlist Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Agency Name</label>
                      <Input required value={formData.agency || ''} onChange={e => setFormData({...formData, agency: e.target.value})} placeholder="e.g. Dept of Defense" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">State / Region</label>
                      <Input value={formData.state || ''} onChange={e => setFormData({...formData, state: e.target.value})} placeholder="e.g. TX, Federal" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Prior TCV ($)</label>
                      <Input type="number" required value={formData.tcv || ''} onChange={e => setFormData({...formData, tcv: e.target.value})} placeholder="500000" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Priority</label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={formData.priority}
                        onChange={e => setFormData({...formData, priority: e.target.value as any})}
                      >
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="WATCH">Watch</option>
                        <option value="LOW">Low</option>
                      </select>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">Keywords (comma separated)</label>
                      <Input value={formData.searchTerms?.join(', ') || ''} onChange={e => setFormData({...formData, searchTerms: e.target.value.split(',').map(s => s.trim())})} placeholder="software, IT services, cloud..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Incumbent / Competitor</label>
                      <Input value={formData.competitor || ''} onChange={e => setFormData({...formData, competitor: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Loss Reason</label>
                      <Input value={formData.reason || ''} onChange={e => setFormData({...formData, reason: e.target.value})} />
                    </div>
                  </div>
                  <DialogFooter className="mt-6">
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Saving..." : "Save Entry"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="border-border/50 shadow-md">
          <div className="p-4 border-b border-border/50 flex items-center bg-muted/20">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search watchlist..." 
                className="pl-9 bg-background border-border/50 shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4 font-semibold">Agency & Status</th>
                  <th className="px-6 py-4 font-semibold">TCV</th>
                  <th className="px-6 py-4 font-semibold">Competitor</th>
                  <th className="px-6 py-4 font-semibold">Rebid Window</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground animate-pulse">Loading entries...</td></tr>
                ) : filteredEntries.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No watchlist entries found.</td></tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const status = calculateRebidStatus(entry.rebidWindowStart, entry.rebidWindowEnd);
                    const isHigh = entry.priority === 'HIGH';
                    
                    return (
                      <tr key={entry.id} className={`hover:bg-muted/20 transition-colors ${isHigh ? 'bg-destructive/5' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${isHigh ? 'bg-destructive' : entry.priority === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                            <div>
                              <p className="font-bold text-foreground">{entry.agency}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{entry.state}</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{entry.reason}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {formatCurrency(entry.tcv)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Building className="w-4 h-4 opacity-50" />
                            <span>{entry.competitor || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5 items-start">
                            <StatusBadge status={status} />
                            <span className="text-xs text-muted-foreground font-mono">
                              {entry.rebidWindowStart ? format(new Date(entry.rebidWindowStart), 'MMM yyyy') : '?'} - 
                              {entry.rebidWindowEnd ? format(new Date(entry.rebidWindowEnd), 'MMM yyyy') : '?'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if(confirm('Delete this entry?')) deleteMutation.mutate({ id: entry.id });
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
