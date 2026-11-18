import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";
import { Orbit, X } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";

interface AddTechnologySpaceModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AddTechnologySpaceModal({ open, onClose }: AddTechnologySpaceModalProps) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/technology-spaces", {
        code: code.toUpperCase().trim(),
        name: name.trim(),
        description: description.trim() || null,
        color,
        isActive: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technology-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/analytics/summary"] });
      handleClose();
    },
  });

  function handleClose() {
    setCode(""); setName(""); setDescription(""); setColor("#3b82f6");
    onClose();
  }

  const codeError = code.length > 0 && (code.length < 2 || code.length > 8);
  const canSubmit = code.trim().length >= 2 && name.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Orbit className="h-5 w-5" /> Add Technology Space
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>
              Code <span className="text-red-500">*</span>
              <span className="ml-1 text-xs text-gray-400 font-normal">(2–8 chars, e.g. ADS, PAM)</span>
            </Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PAM"
              maxLength={8}
              className={codeError ? "border-red-400" : ""}
            />
            {codeError && (
              <p className="text-xs text-red-500 mt-1">Code must be 2–8 characters</p>
            )}
          </div>
          <div>
            <Label>
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Privileged Access Management"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this technology space..."
              rows={2}
            />
          </div>
          <ColorPicker
            label="Color"
            value={color}
            onChange={setColor}
            size="md"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-1" />Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "Creating..." : <><Orbit className="h-4 w-4 mr-1" />Create Space</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
