import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Briefcase, Contact, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { ProjectHero } from "@/components/project-detail/ProjectHero";
import { formatFullName } from "@/lib/nameUtils";

interface PortalPerson {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

interface AccountPortalHeroProps {
  accountName: string;
  logoUrl?: string | null;
  region?: string | null;
  industryName?: string | null;
  accountRep: PortalPerson | null;
  accountEngineer: PortalPerson | null;
  solutions: Array<{ name: string; icon?: string | null; iconName?: string | null }>;
  /** Account picker and the account buttons (users, requests, customer portal). */
  actions: ReactNode;
  tabs: ReactNode;
}

function PersonLink({ label, person, emailHint }: { label: string; person: PortalPerson | null; emailHint: string }) {
  const { t } = useTranslation();
  const name = person ? formatFullName(person.firstName ?? "", person.lastName ?? "") : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Contact className="h-3.5 w-3.5" />
      <span className="opacity-75">{label}</span>
      {!name ? (
        <span className="font-semibold">{t("accountPortal.hero.notAssigned")}</span>
      ) : person?.email ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <a href={`mailto:${person.email}`} className="font-semibold underline-offset-2 hover:underline">
              {name}
            </a>
          </TooltipTrigger>
          <TooltipContent>{emailHint}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="font-semibold">{name}</span>
      )}
    </span>
  );
}

/**
 * Header band of the Account Portal: the same band as the project page
 * (ProjectHero), with the account's identity, people and solutions, and the
 * portal tabs along its bottom edge.
 */
export function AccountPortalHero({
  accountName,
  logoUrl,
  region,
  industryName,
  accountRep,
  accountEngineer,
  solutions,
  actions,
  tabs,
}: AccountPortalHeroProps) {
  const { t } = useTranslation();

  return (
    <TooltipProvider>
      <ProjectHero
        leading={
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700">
            {logoUrl ? (
              <img src={logoUrl} alt={t("accountPortal.hero.logoAlt", { account: accountName })} className="max-h-full max-w-full object-contain" />
            ) : (
              <Building2 className="h-7 w-7 text-slate-500" />
            )}
          </div>
        }
        eyebrow={
          <>
            <span className="font-semibold">{t("nav.accountPortal")}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              {region || t("accountPortal.hero.notSpecified")}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" />
              {industryName || t("accountPortal.hero.notSpecified")}
            </span>
          </>
        }
        title={accountName}
        solutions={
          solutions.length > 0
            ? solutions.map((solution) => (
                <SolutionBadge key={solution.name} solutionName={solution.name} solutionIcon={solution.icon ?? undefined} solutionIconName={solution.iconName} />
              ))
            : null
        }
        status={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <PersonLink label={t("accountPortal.hero.accountRep")} person={accountRep} emailHint={t("accountPortal.hero.emailRep")} />
            <PersonLink
              label={t("accountPortal.hero.accountEngineer")}
              person={accountEngineer}
              emailHint={t("accountPortal.hero.emailEngineer")}
            />
          </div>
        }
        actions={actions}
        percent={null}
        percentLabel=""
        tabs={tabs}
      />
    </TooltipProvider>
  );
}
