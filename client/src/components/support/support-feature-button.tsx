import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { SupportFeatureDialog } from "./support-feature-dialog";
import { PocketKnife, Plus } from "lucide-react";

interface SupportFeatureButtonProps {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  text?: string;
  showIcon?: boolean;
  className?: string;
  projectId?: number;
  customerId?: number;
  onSuccess?: () => void;
}

export function SupportFeatureButton({
  variant = "default",
  size = "default",
  text = "Support & Features",
  showIcon = true,
  className,
  projectId,
  customerId,
  onSuccess
}: SupportFeatureButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        {showIcon && <PocketKnife className="h-4 w-4 mr-2" />}
        {text}
      </Button>
      
      <SupportFeatureDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        customerId={customerId}
        onSuccess={() => {
          setOpen(false);
          onSuccess?.();
        }}
      />
    </>
  );
}

export function SupportFeatureAddButton(props: Omit<SupportFeatureButtonProps, "text" | "showIcon">) {
  return (
    <SupportFeatureButton
      {...props}
      text="Submit Request"
      showIcon={true}
      variant="default"
    />
  );
}