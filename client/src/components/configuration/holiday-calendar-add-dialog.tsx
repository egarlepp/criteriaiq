import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import type { HolidayCountry, HolidayRefreshResult } from "@shared/holiday-calendars";
import { HOLIDAY_COUNTRIES_KEY, holidayErrorKey, invalidateHolidayCalendars } from "./holiday-calendar-api";

export type AddCalendarMode = "country" | "custom";

interface CreateResponse {
  calendar: { id: number; name: string };
  download: HolidayRefreshResult | null;
  downloadFailed: boolean;
}

// "Download holidays" picks a country and pulls its public holidays for this
// year and next; "Add custom calendar" makes an empty list for company
// closures. Same dialog, two modes.
export function HolidayCalendarAddDialog({
  mode,
  existingCodes,
  onOpenChange,
}: {
  mode: AddCalendarMode | null;
  existingCodes: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const open = mode !== null;
  const [country, setCountry] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setCountry("");
      setCode("");
      setName("");
    }
  }, [open, mode]);

  const { data: countries = [], isLoading: countriesLoading, isError: countriesError } = useQuery<HolidayCountry[]>({
    queryKey: HOLIDAY_COUNTRIES_KEY,
    enabled: mode === "country",
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  // Country names in the viewer's language where the browser knows them.
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: "region" });
    } catch {
      return null;
    }
  }, [i18n.language]);
  const countryLabel = (c: HolidayCountry) => regionNames?.of(c.countryCode) ?? c.name;
  const taken = new Set(existingCodes.map((c) => c.toUpperCase()));
  const options = countries
    .map((c) => ({
      value: c.countryCode,
      label: `${countryLabel(c)} (${c.countryCode})`,
      disabled: taken.has(c.countryCode),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  const create = useMutation({
    mutationFn: (body: { code: string; name: string }) =>
      apiRequest("POST", "/api/admin/holiday-calendars", body) as Promise<CreateResponse>,
    onSuccess: (res) => {
      invalidateHolidayCalendars();
      if (res.downloadFailed) {
        showErrorToast(t("configuration.holidays.errorTitle"), t("configuration.holidays.createdDownloadFailed", { name: res.calendar.name }));
      } else if (res.download) {
        showSuccessToast(
          t("configuration.holidays.downloadedTitle"),
          t("configuration.holidays.downloadedBody", { name: res.calendar.name, count: res.download.added }),
        );
      } else {
        showSuccessToast(t("configuration.holidays.createdTitle"), t("configuration.holidays.createdBody", { name: res.calendar.name }));
      }
      onOpenChange(false);
    },
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error))),
  });

  const pickCountry = (value: string) => {
    setCountry(value);
    const match = countries.find((c) => c.countryCode === value);
    if (match) setName(countryLabel(match));
  };

  const customCode = code.trim();
  const customCodeValid = /^[A-Za-z0-9_-]{3,40}$/.test(customCode);
  const canSave =
    !create.isPending &&
    name.trim().length > 0 &&
    (mode === "country" ? country.length === 2 : customCodeValid && !taken.has(customCode.toUpperCase()));

  const submit = () => {
    if (!canSave) return;
    create.mutate({ code: mode === "country" ? country : customCode, name: name.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "country" ? t("configuration.holidays.downloadTitle") : t("configuration.holidays.customTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "country" ? t("configuration.holidays.downloadDescription") : t("configuration.holidays.customDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "country" ? (
            <div className="space-y-1.5">
              <Label>{t("configuration.holidays.countryLabel")}</Label>
              {countriesError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{t("configuration.holidays.errors.feed_unavailable")}</p>
              ) : (
                <SearchableSelect
                  options={options}
                  value={country}
                  onValueChange={pickCountry}
                  disabled={countriesLoading}
                  placeholder={countriesLoading ? t("configuration.holidays.loading") : t("configuration.holidays.countryPlaceholder")}
                  searchPlaceholder={t("configuration.holidays.countrySearch")}
                  emptyText={t("configuration.holidays.countryEmpty")}
                />
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="holiday-custom-code">{t("configuration.holidays.codeLabel")}</Label>
              <Input
                id="holiday-custom-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("configuration.holidays.codePlaceholder")}
                maxLength={40}
                data-testid="holiday-custom-code"
              />
              <p className="text-xs text-muted-foreground">{t("configuration.holidays.codeHint")}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="holiday-calendar-name">{t("configuration.holidays.calendarNameLabel")}</Label>
            <Input
              id="holiday-calendar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "custom" ? t("configuration.holidays.calendarNamePlaceholder") : undefined}
              maxLength={120}
              data-testid="holiday-calendar-name"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("configuration.holidays.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSave} data-testid="holiday-calendar-save">
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : mode === "country" ? (
              <Download className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {mode === "country" ? t("configuration.holidays.downloadButton") : t("configuration.holidays.createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
