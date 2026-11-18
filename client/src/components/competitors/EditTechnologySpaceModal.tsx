import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Orbit, X } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";

interface TechnologySpace {
  id: number;
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
  color?: string;
}

interface EditTechnologySpaceModalProps {
  open: boolean;
  space: TechnologySpace | null;
  onClose: () => void;
}

export default function EditTechnologySpaceModal({ open, space, onClose }: EditTechnologySpaceModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");

  useEffect(() => {
    if (space) {
      setName(space.name);
      setDescription(space.description ?? "");
      const c = space.color ?? "#3b82f6";
      setColor(c.startsWith("#") ? c : "#3b82f6");
    }
  }, [space]);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/technology-spaces/${space!.id}`, {
        name: name.trim(),
        description: description.trim() || null,
        color,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technology-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/analytics/summary"] });
      onClose();
    },
  });

  const canSubmit = name.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Orbit className="h-5 w-5" />
            Edit Technology Space
            {space && (
              <Badge variant="outline" className="font-mono text-xs tracking-widest">
                {space.code}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Code</Label>
            <Input value={space?.code ?? ""} disabled className="opacity-60 font-mono" />
            <p className="text-[11px] text-gray-400 mt-1">Space code cannot be changed after creation.</p>
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
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "Saving..." : <><Orbit className="h-4 w-4 mr-1" />Save Changes</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
