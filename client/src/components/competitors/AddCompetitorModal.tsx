import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { Check, ChevronLeft, ChevronRight, Swords, X } from "lucide-react";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AddCompetitorModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = ["Identity", "Spaces", "Solutions", "Intelligence"];

function hexWithAlpha(hex: string, alpha: number): string {
  const h = (hex ?? "#64748b").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function AddCompetitorModal({ open, onClose }: AddCompetitorModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [vendorType, setVendorType] = useState("");
  const [pricingPosition, setPricingPosition] = useState("");
  const [deploymentModel, setDeploymentModel] = useState("");
  const [companySizeBand, setCompanySizeBand] = useState("");
  const [selectedSpaces, setSelectedSpaces] = useState<number[]>([]);
  const [selectedSolutions, setSelectedSolutions] = useState<number[]>([]);
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [counterPositioning, setCounterPositioning] = useState("");
  const [notes, setNotes] = useState("");

  const { data: spaces = [] } = useQuery<any[]>({
    queryKey: ["/api/technology-spaces"],
    queryFn: () => fetch("/api/technology-spaces").then((r) => r.json()),
  });

  const { data: solutions = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const competitor = await apiRequest("POST", "/api/competitors", {
        name,
        websiteUrl: websiteUrl || null,
        vendorType: vendorType || null,
        pricingPosition: pricingPosition || null,
        deploymentModel: deploymentModel || null,
        companySizeBand: companySizeBand || null,
        strengths: strengths || null,
        weaknesses: weaknesses || null,
        counterPositioning: counterPositioning || null,
        notes: notes || null,
      });

      await Promise.all([
        ...selectedSpaces.map((spaceId, i) =>
          apiRequest("POST", `/api/competitors/${competitor.id}/spaces`, {
            spaceId,
            isPrimary: i === 0,
          })
        ),
        ...selectedSolutions.map((solutionId) =>
          apiRequest("POST", `/api/competitors/${competitor.id}/solutions`, { solutionId })
        ),
      ]);

      return competitor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/analytics/summary"] });
      handleClose();
    },
  });

  function handleClose() {
    setStep(0);
    setName(""); setWebsiteUrl(""); setVendorType(""); setPricingPosition("");
    setDeploymentModel(""); setCompanySizeBand(""); setSelectedSpaces([]);
    setSelectedSolutions([]); setStrengths(""); setWeaknesses("");
    setCounterPositioning(""); setNotes("");
    onClose();
  }

  function toggleSpace(id: number) {
    setSelectedSpaces((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSolution(id: number) {
    setSelectedSolutions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const allSelected = solutions.length > 0 && solutions.every((s: any) => selectedSolutions.includes(s.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedSolutions([]);
    } else {
      setSelectedSolutions(solutions.map((s: any) => s.id));
    }
  };

  const canNext = step === 0 ? name.trim().length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Swords className="h-5 w-5" /> Add Competitor</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium transition-colors",
                    i === step
                      ? "text-blue-600 dark:text-blue-400"
                      : i < step
                      ? "text-green-600 dark:text-green-400 cursor-pointer"
                      : "text-gray-400"
                  )}
                >
                  <span className={cn(
                    "flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold border",
                    i === step
                      ? "border-primary bg-primary text-primary-foreground"
                      : i < step
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-gray-300 text-gray-400"
                  )}>
                    {i < step ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {s}
                </button>
                {i < STEPS.length - 1 && <div className={cn("h-px w-4", i < step ? "bg-green-400" : "bg-gray-200")} />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="py-2 min-h-[240px]">
          {/* Step 1: Identity */}
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CyberArk" autoFocus />
              </div>
              <div>
                <Label>Website URL</Label>
                <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://cyberark.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vendor Type</Label>
                  <Select value={vendorType} onValueChange={setVendorType}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {["Platform", "Point Product", "Suite", "MSP/MSSP", "Federal", "Education", "State/Local", "Other"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pricing Position</Label>
                  <Select value={pricingPosition} onValueChange={setPricingPosition}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {["Budget", "Mid", "Premium", "Opaque"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Deployment</Label>
                  <Select value={deploymentModel} onValueChange={setDeploymentModel}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {["SaaS", "Hybrid", "On-Prem", "Hosted", "Containerized"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Company Size</Label>
                  <Select value={companySizeBand} onValueChange={setCompanySizeBand}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {["Startup", "SMB", "Mid-Market", "Enterprise", "Large Enterprise"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Spaces */}
          {step === 1 && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Select the technology spaces this competitor operates in.
              </p>
              <div className="flex flex-wrap gap-2">
                {spaces.map((s: any) => {
                  const selected = selectedSpaces.includes(s.id);
                  const hex = s.color && s.color.startsWith("#") ? s.color : "#64748b";
                  const chipStyle: React.CSSProperties = selected
                    ? { backgroundColor: hex, borderColor: hex, color: "#fff" }
                    : { borderColor: hexWithAlpha(hex, 0.35), backgroundColor: hexWithAlpha(hex, 0.08), color: hex };
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSpace(s.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                        selected ? "shadow-md" : ""
                      )}
                      style={chipStyle}
                    >
                      <span className="text-xs font-bold uppercase tracking-widest block">{s.code}</span>
                      <span className="text-xs font-normal">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Solutions */}
          {step === 2 && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Link this competitor to relevant solutions from solutions catalog.</p>
              <TooltipProvider>
                <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-1">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className={cn(
                      "inline-flex items-center rounded-full transition-all",
                      allSelected
                        ? "ring-2 ring-primary ring-offset-1"
                        : "opacity-70 hover:opacity-100"
                    )}
                  >
                    <AllSolutionsBadge />
                  </button>
                  {solutions.map((s: any) => {
                    const selected = selectedSolutions.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSolution(s.id)}
                        className={cn(
                          "inline-flex items-center rounded-full transition-all",
                          selected
                            ? "ring-2 ring-primary ring-offset-1"
                            : "opacity-70 hover:opacity-100"
                        )}
                      >
                        <SolutionBadge
                          solutionName={s.abbreviation || s.name}
                          solutionIcon={s.solutionIcon ?? null} solutionIconName={s.solutionIconName}
                        />
                      </button>
                    );
                  })}
                  {solutions.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No solutions configured yet.</p>
                  )}
                </div>
              </TooltipProvider>
            </div>
          )}

          {/* Step 4: Intelligence */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <Label>Strengths</Label>
                <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="What does this competitor do well?" rows={2} />
              </div>
              <div>
                <Label>Weaknesses</Label>
                <Textarea value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} placeholder="Where do they fall short?" rows={2} />
              </div>
              <div>
                <Label>Counter-Positioning</Label>
                <Textarea value={counterPositioning} onChange={(e) => setCounterPositioning(e.target.value)} placeholder="How do we position against them?" rows={2} />
              </div>
              <div>
                <Label>Internal Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional context..." rows={2} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}><X className="h-4 w-4 mr-1" />Cancel</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
                {mutation.isPending ? "Creating..." : <><Swords className="h-4 w-4 mr-1" />Create Competitor</>}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
