import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import {
  useListWatchlistEntries,
  useCreateWatchlistEntry,
  useUpdateWatchlistEntry,
  useDeleteWatchlistEntry,
  type WatchlistEntry,
} from "@workspace/api-client-react";
import { format, parseISO, isValid } from "date-fns";
import { Plus, Upload, Trash2, Pencil, Search, Building, Loader2, Database, ShieldCheck, ExternalLink } from "lucide-react";
import { formatCurrency, calculateRebidStatus } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type Priority = "HIGH" | "MEDIUM" | "WATCH" | "LOW";

interface EntryFormData {
  agency: string;
  state: string;
  tcv: string;
  priority: Priority;
  searchTerms: string[];
  competitor: string;
  reason: string;
  rebidWindowStart: string | null;
  rebidWindowEnd: string | null;
  notes: string;
}

const defaultForm = (): EntryFormData => ({
  agency: "",
  state: "",
  tcv: "0",
  priority: "MEDIUM",
  searchTerms: [],
  competitor: "",
  reason: "",
  rebidWindowStart: null,
  rebidWindowEnd: null,
  notes: "",
});

function entryToForm(entry: WatchlistEntry): EntryFormData {
  return {
    agency: entry.agency,
    state: entry.state,
    tcv: entry.tcv,
    priority: entry.priority as Priority,
    searchTerms: entry.searchTerms ?? [],
    competitor: entry.competitor,
    reason: entry.reason,
    rebidWindowStart: entry.rebidWindowStart ?? null,
    rebidWindowEnd: entry.rebidWindowEnd ?? null,
    notes: entry.notes ?? "",
  };
}

function StatusBadge({ status }: { status: "UPCOMING" | "ACTIVE" | "CLOSED" }) {
  const styles: Record<string, string> = {
    UPCOMING: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400",
    ACTIVE: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-400",
    CLOSED: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/20 dark:text-gray-400",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border uppercase ${styles[status]}`}>{status}</span>;
}

interface EntryFormProps {
  form: EntryFormData;
  onChange: (form: EntryFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  submitLabel: string;
}

function EntryForm({ form, onChange, onSubmit, isPending, submitLabel }: EntryFormProps) {
  const set = (patch: Partial<EntryFormData>) => onChange({ ...form, ...patch });

  return (
    <form onSubmit={onSubmit} className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Agency Name</label>
          <Input required value={form.agency} onChange={e => set({ agency: e.target.value })} placeholder="e.g. Dept of Defense" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">State / Region</label>
          <Input value={form.state} onChange={e => set({ state: e.target.value })} placeholder="e.g. TX, Federal" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Prior TCV ($)</label>
          <Input type="number" required value={form.tcv} onChange={e => set({ tcv: e.target.value })} placeholder="500000" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Priority</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={form.priority}
            onChange={e => set({ priority: e.target.value as Priority })}
          >
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="WATCH">Watch</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div className="col-span-2 space-y-2">
          <label className="text-sm font-medium">Keywords (comma separated)</label>
          <Input
            value={form.searchTerms.join(", ")}
            onChange={e => set({ searchTerms: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
            placeholder="software, IT services, cloud..."
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Incumbent / Competitor</label>
          <Input value={form.competitor} onChange={e => set({ competitor: e.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Loss Reason</label>
          <Input value={form.reason} onChange={e => set({ reason: e.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Rebid Window Start</label>
          <Input
            type="date"
            value={form.rebidWindowStart ?? ""}
            onChange={e => set({ rebidWindowStart: e.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Rebid Window End</label>
          <Input
            type="date"
            value={form.rebidWindowEnd ?? ""}
            onChange={e => set({ rebidWindowEnd: e.target.value || null })}
          />
        </div>
        <div className="col-span-2 space-y-2">
          <label className="text-sm font-medium">Notes</label>
          <Input value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="Optional notes..." />
        </div>
      </div>
      <DialogFooter className="mt-6">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function Watchlist() {
  const { data: entries, isLoading } = useListWatchlistEntries();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<EntryFormData>(defaultForm());

  const [editEntry, setEditEntry] = useState<WatchlistEntry | null>(null);
  const [editForm, setEditForm] = useState<EntryFormData>(defaultForm());

  const watchlistQueryKey = ["/api/watchlist"];

  const createMutation = useCreateWatchlistEntry({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: watchlistQueryKey });
        setIsAddOpen(false);
        setAddForm(defaultForm());
        toast({ title: "Entry added", description: "Watchlist updated successfully." });
      },
      onError: () => toast({ title: "Error", description: "Failed to add entry.", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateWatchlistEntry({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: watchlistQueryKey });
        setEditEntry(null);
        toast({ title: "Entry updated", description: "Changes saved successfully." });
      },
      onError: () => toast({ title: "Error", description: "Failed to update entry.", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteWatchlistEntry({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: watchlistQueryKey });
        toast({ title: "Entry deleted" });
      },
    },
  });

  const handleEnrichUSASpending = async () => {
    setIsEnriching(true);
    try {
      const resp = await fetch("/api/watchlist/enrich-usaspending", { method: "POST" });
      if (!resp.ok) throw new Error("Enrichment request failed");
      const result = await resp.json() as { enriched: number; notFound: number };
      await queryClient.invalidateQueries({ queryKey: watchlistQueryKey });
      toast({
        title: "USASpending lookup complete",
        description: `${result.enriched} federal contracts found, ${result.notFound} entries have no federal match.`,
      });
    } catch (err) {
      toast({ title: "Lookup failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setIsEnriching(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/watchlist/import", { method: "POST", body: formData });
      if (!resp.ok) {
        const text = await resp.text();
        let errMsg = "Import failed";
        try { errMsg = (JSON.parse(text) as { error?: string }).error ?? errMsg; } catch { /* non-JSON response */ }
        throw new Error(errMsg);
      }
      const result = await resp.json() as { imported: number };
      await queryClient.invalidateQueries({ queryKey: watchlistQueryKey });
      toast({ title: "Import successful", description: `${result.imported} entries imported.` });
    } catch (err) {
      toast({ title: "Import failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filteredEntries = (entries ?? []).filter(
    e =>
      e.agency.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.competitor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.agency) return;
    createMutation.mutate({ data: addForm });
  };

  const handleEdit = (entry: WatchlistEntry) => {
    setEditEntry(entry);
    setEditForm(entryToForm(entry));
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;
    updateMutation.mutate({ id: editEntry.id, data: editForm });
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              variant="outline"
              className="bg-background shadow-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Import Excel</>
              )}
            </Button>

            <Button
              variant="outline"
              className="bg-background shadow-sm border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={handleEnrichUSASpending}
              disabled={isEnriching}
              title="Query USASpending.gov to find real federal contract expiry dates for each entry"
            >
              {isEnriching ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning USASpending...</>
              ) : (
                <><Database className="w-4 h-4 mr-2" /> Lookup USASpending</>
              )}
            </Button>

            <Button
              className="shadow-md shadow-primary/20"
              onClick={() => {
                setAddForm(defaultForm());
                setIsAddOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Add Entry
            </Button>
          </div>
        </div>

        {/* Add Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add Watchlist Entry</DialogTitle>
            </DialogHeader>
            <EntryForm
              form={addForm}
              onChange={setAddForm}
              onSubmit={handleCreate}
              isPending={createMutation.isPending}
              submitLabel="Save Entry"
            />
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editEntry} onOpenChange={open => { if (!open) setEditEntry(null); }}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Edit Watchlist Entry</DialogTitle>
            </DialogHeader>
            <EntryForm
              form={editForm}
              onChange={setEditForm}
              onSubmit={handleUpdate}
              isPending={updateMutation.isPending}
              submitLabel="Update Entry"
            />
          </DialogContent>
        </Dialog>

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
                  <th className="px-6 py-4 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-500" />
                      Federal Intel
                    </div>
                  </th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground animate-pulse">Loading entries...</td></tr>
                ) : filteredEntries.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No watchlist entries found.</td></tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const status = calculateRebidStatus(entry.rebidWindowStart, entry.rebidWindowEnd);
                    const isHigh = entry.priority === "HIGH";
                    const hasUSA = !!entry.usaSpendingLookedUpAt;
                    const hasMatch = hasUSA && !!entry.usaSpendingAwardId;

                    const potentialEnd = entry.usaSpendingPotentialEnd;
                    const endDate = potentialEnd && isValid(parseISO(potentialEnd)) ? parseISO(potentialEnd) : null;
                    const isExpiringSoon = endDate && (endDate.getTime() - Date.now()) < 365 * 24 * 60 * 60 * 1000;

                    return (
                      <tr key={entry.id} className={`hover:bg-muted/20 transition-colors ${isHigh ? "bg-destructive/5" : ""}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${isHigh ? "bg-destructive" : entry.priority === "MEDIUM" ? "bg-amber-500" : "bg-blue-500"}`} />
                            <div>
                              <p className="font-bold text-foreground">{entry.agency}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{entry.state}</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{entry.reason}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium">{formatCurrency(entry.tcv)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Building className="w-4 h-4 opacity-50" />
                            <span>{entry.competitor || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5 items-start">
                            <StatusBadge status={status} />
                            <span className="text-xs text-muted-foreground font-mono">
                              {entry.rebidWindowStart ? format(new Date(entry.rebidWindowStart), "MMM yyyy") : "?"} -{" "}
                              {entry.rebidWindowEnd ? format(new Date(entry.rebidWindowEnd), "MMM yyyy") : "?"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 min-w-[180px]">
                          {!hasUSA ? (
                            <span className="text-xs text-muted-foreground italic">Not looked up</span>
                          ) : !hasMatch ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 inline-block" />
                              No federal match
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="text-xs font-semibold text-blue-700">
                                  {endDate ? (
                                    <span className={isExpiringSoon ? "text-amber-600 font-bold" : ""}>
                                      Expires {format(endDate, "MMM yyyy")}
                                    </span>
                                  ) : "Contract found"}
                                </span>
                              </div>
                              {entry.usaSpendingRecipient && (
                                <p className="text-xs text-muted-foreground truncate max-w-[160px]" title={entry.usaSpendingRecipient}>
                                  via {entry.usaSpendingRecipient}
                                </p>
                              )}
                              {entry.usaSpendingAwardId && (
                                <a
                                  href={`https://www.usaspending.gov/award/CONT_AWD_${entry.usaSpendingAwardId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
                                >
                                  {entry.usaSpendingAwardId} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => handleEdit(entry)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (confirm("Delete this entry?")) {
                                  deleteMutation.mutate({ id: entry.id });
                                }
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
