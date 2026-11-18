import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { cn } from "@/lib/utils";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { ROLE_POPULAR_SEARCHES, getTopic, type GuideRoleKey, type GuideTopicKey } from "./guide-data";
import { searchGuide, type GuideSearchEntry } from "./guide-search";

export interface GuideRoleView {
  key: GuideRoleKey;
  name: string;
  color: string;
  icon: string;
}

interface GuideHubControlsProps {
  roles: GuideRoleView[];
  selectedRole: GuideRoleKey;
  onRoleChange: (role: GuideRoleKey) => void;
  searchIndex: GuideSearchEntry[];
  onOpenTopic: (topic: GuideTopicKey) => void;
}

export function GuideHubControls({ roles, selectedRole, onRoleChange, searchIndex, onOpenTopic }: GuideHubControlsProps) {
  const { t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const record = useValidationRecordLabel();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchGuide(searchIndex, query), [searchIndex, query]);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col lg:flex-row gap-5 lg:gap-8">
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-sm font-semibold text-foreground" id="guide-role-label">{t("guide.roleToggle.label")}</p>
        <div
          role="group"
          aria-labelledby="guide-role-label"
          className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-1"
        >
          {roles.map((role) => {
            const active = role.key === selectedRole;
            return (
              <button
                key={role.key}
                type="button"
                aria-pressed={active}
                onClick={() => onRoleChange(role.key)}
                className={cn(
                  "flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`guide-role-${role.key}`}
              >
                <DynamicIcon name={role.icon} className="h-4 w-4" style={{ color: role.color }} aria-hidden="true" />
                {role.name}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{t(`guide.roles.${selectedRole}.summary`, { record })}</p>
      </div>

      <div className="w-full lg:w-[440px] shrink-0 space-y-2">
        <label htmlFor="guide-search" className="text-sm font-semibold text-foreground">{t("guide.search.label")}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            id="guide-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("guide.search.placeholder")}
            className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
            autoComplete="off"
            data-testid="guide-search-input"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("guide.search.clear")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {hasQuery ? (
          <div aria-live="polite">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-2">{t("guide.search.noResults", { query: query.trim() })}</p>
            ) : (
              <ul aria-label={t("guide.search.resultsLabel")} className="rounded-md border divide-y bg-background">
                {results.map((result) => {
                  const topic = getTopic(result.topic);
                  const TopicIcon = topic.icon;
                  return (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTopic(result.topic)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                      >
                        <TopicIcon className={cn("h-4 w-4 shrink-0", topic.iconClass)} aria-hidden="true" />
                        <span className="text-sm font-medium text-foreground truncate">{result.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground shrink-0">
                          {t("guide.search.inTopic", { topic: t(`guide.topics.${result.topic}.title`) })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t("guide.search.popular")}</span>
            {ROLE_POPULAR_SEARCHES[selectedRole].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setQuery(t(`guide.popular.${key}`))}
                className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                {t(`guide.popular.${key}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
