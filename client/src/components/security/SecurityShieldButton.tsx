import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ShieldCheck, ShieldAlert, ShieldUser } from "lucide-react";
import { cn } from "@/lib/utils";
import { SecurityStatusDrawer } from "@/components/security/SecurityStatusDrawer";

interface SecurityShieldButtonProps {
  className?: string;
}

export function SecurityShieldButton({ className }: SecurityShieldButtonProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Fetch user's security health status
  const { data: securityHealth } = useQuery({
    queryKey: ["/api/me/security"],
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });

  // Determine shield color and icon based on health status
  const getShieldConfig = () => {
    const health = (securityHealth as any)?.health || 'red';
    
    switch (health) {
      case 'green':
        return {
          icon: ShieldCheck,
          className: "text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300",
          bgHover: "hover:bg-green-50 dark:hover:bg-green-900/20",
          label: t("layout.sidebar.security.complete")
        };
      case 'amber':
        return {
          icon: ShieldUser,
          className: "text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300",
          bgHover: "hover:bg-amber-50 dark:hover:bg-amber-900/20",
          label: t("layout.sidebar.security.partial")
        };
      case 'red':
      default:
        return {
          icon: ShieldAlert,
          className: "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300",
          bgHover: "hover:bg-red-50 dark:hover:bg-red-900/20",
          label: t("layout.sidebar.security.incomplete")
        };
    }
  };

  const shieldConfig = getShieldConfig();
  const ShieldIcon = shieldConfig.icon;

  return (
    <>
      {/* Security Shield Button - 27x27px positioned 24px from right, 18px from top */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsDrawerOpen(true);
        }}
        className={cn(
          "absolute w-[27px] h-[27px] rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
          shieldConfig.className,
          shieldConfig.bgHover,
          className
        )}
        style={{ 
          right: '0px',
          top: '0px'
        }}
        aria-label={t("security.shieldButton.ariaLabel")}
        title={shieldConfig.label}
      >
        <ShieldIcon className="w-[27px] h-[27px]" />
      </button>

      {/* Security Status Drawer */}
      <SecurityStatusDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        securityHealth={securityHealth}
      />
    </>
  );
}