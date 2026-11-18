import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, CalendarDays, Save, Info, ArrowRight } from "lucide-react";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { useFiscalConfig } from "@/hooks/use-fiscal-config";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";

const YEAR_OFFSET_OPTIONS = [
  { value: -1, labelKey: "configuration.calendar.offsetPrevious" },
  { value: 0, labelKey: "configuration.calendar.offsetSame" },
  { value: 1, labelKey: "configuration.calendar.offsetNext" },
] as const;

export function FiscalConfigurationSection() {
  const { t, i18n } = useTranslation();
  const {
    config,
    isLoading,
    updateConfig,
    isUpdating,
    getExamples,
    currentYear,
    currentQuarter,
    formatPeriod,
  } = useFiscalConfig();

  const [localDisplayMode, setLocalDisplayMode] = useState<"fiscal" | "calendar">("calendar");
  const [localStartMonth, setLocalStartMonth] = useState(1);
  const [localYearOffset, setLocalYearOffset] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);

  // Month names and preview dates follow the viewer's language.
  const months = useMemo(() => {
    const monthFormat = new Intl.DateTimeFormat(i18n.language, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthFormat.format(new Date(2000, i, 1)) }));
  }, [i18n.language]);
  const formatDate = (date: Date) =>
    date.toLocaleDateString(i18n.language, { month: "short", day: "numeric", year: "numeric" });

  useEffect(() => {
    if (config) {
      setLocalDisplayMode(config.displayMode);
      setLocalStartMonth(config.fiscalYearStartMonth);
      setLocalYearOffset(config.yearNamingOffset);
    }
  }, [config]);

  useEffect(() => {
    if (config) {
      const changed =
        localDisplayMode !== config.displayMode ||
        localStartMonth !== config.fiscalYearStartMonth ||
        localYearOffset !== config.yearNamingOffset;
      setHasChanges(changed);
    }
  }, [localDisplayMode, localStartMonth, localYearOffset, config]);

  const handleSave = () => {
    updateConfig(
      {
        displayMode: localDisplayMode,
        fiscalYearStartMonth: localStartMonth,
        yearNamingOffset: localYearOffset,
      },
      {
        onSuccess: () => {
          showSuccessToast(t("configuration.calendar.savedTitle"), t("configuration.calendar.savedBody"));
          setHasChanges(false);
        },
        onError: (error: any) => {
          showErrorToast(t("configuration.calendar.errorTitle"), error.message || t("configuration.calendar.errorBody"));
        },
      }
    );
  };

  const getPreviewConfig = () => ({
    displayMode: localDisplayMode,
    fiscalYearStartMonth: localStartMonth,
    yearNamingOffset: localYearOffset,
  });

  const previewExamples = () => {
    const previewConfig = getPreviewConfig();
    const today = new Date();
    const examples = [];

    const getFYForDate = (date: Date) => {
      const month = date.getMonth() + 1;
      const calendarYear = date.getFullYear();
      if (previewConfig.displayMode === "calendar") return calendarYear;
      if (month >= previewConfig.fiscalYearStartMonth) {
        return calendarYear + previewConfig.yearNamingOffset;
      }
      return calendarYear + previewConfig.yearNamingOffset - 1;
    };

    const getQuarterForDate = (date: Date) => {
      const month = date.getMonth() + 1;
      if (previewConfig.displayMode === "calendar") return Math.ceil(month / 3);
      const fiscalMonthIndex = ((month - previewConfig.fiscalYearStartMonth + 12) % 12);
      return Math.floor(fiscalMonthIndex / 3) + 1;
    };

    const formatPreviewPeriod = (date: Date) => {
      const year = getFYForDate(date);
      const quarter = getQuarterForDate(date);
      if (previewConfig.displayMode === "calendar") {
        return `Q${quarter} ${year}`;
      }
      return `Q${quarter} FY${year.toString().slice(-2)}`;
    };

    examples.push({
      date: today,
      formatted: formatPreviewPeriod(today),
      label: t("configuration.calendar.today"),
      dateStr: formatDate(today),
    });

    const threeMonths = new Date(today);
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    examples.push({
      date: threeMonths,
      formatted: formatPreviewPeriod(threeMonths),
      label: t("configuration.calendar.plusThreeMonths"),
      dateStr: formatDate(threeMonths),
    });

    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    examples.push({
      date: sixMonthsAgo,
      formatted: formatPreviewPeriod(sixMonthsAgo),
      label: t("configuration.calendar.minusSixMonths"),
      dateStr: formatDate(sixMonthsAgo),
    });

    return examples;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {t("configuration.calendar.title")}
                </CardTitle>
                <CardDescription className="pt-1.5">
                  {t("configuration.calendar.description")}
                </CardDescription>
            </div>
            {hasChanges && (
              <Button onClick={handleSave} disabled={isUpdating}>
                <Save className="h-4 w-4 mr-2" />
                {isUpdating ? t("configuration.calendar.saving") : t("configuration.calendar.save")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <DecorativeCardIcon icon={CalendarDays} />
          <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <Label className="text-base font-semibold">{t("configuration.calendar.displayMode")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("configuration.calendar.displayModeDescription")}
            </p>
            <RadioGroup
              value={localDisplayMode}
              onValueChange={(value: "fiscal" | "calendar") => setLocalDisplayMode(value)}
              className="grid grid-cols-2 gap-4"
            >
              <div className={`relative flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-all ${localDisplayMode === "calendar" ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"}`}>
                <RadioGroupItem value="calendar" id="calendar" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="calendar" className="font-medium cursor-pointer">
                    {t("configuration.calendar.calendarYear")}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("configuration.calendar.calendarYearDescription")}
                  </p>
                  <Badge variant="outline" className="mt-2">
                    {t("configuration.calendar.example", { value: "Q4 2024" })}
                  </Badge>
                </div>
              </div>
              <div className={`relative flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-all ${localDisplayMode === "fiscal" ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"}`}>
                <RadioGroupItem value="fiscal" id="fiscal" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="fiscal" className="font-medium cursor-pointer">
                    {t("configuration.calendar.fiscalYear")}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("configuration.calendar.fiscalYearDescription")}
                  </p>
                  <Badge variant="outline" className="mt-2">
                    {t("configuration.calendar.example", { value: "Q3 FY25" })}
                  </Badge>
                </div>
              </div>
            </RadioGroup>
          </div>

          {localDisplayMode === "fiscal" && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <Label className="text-base font-semibold">{t("configuration.calendar.startMonth")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("configuration.calendar.startMonthDescription")}
                  </p>
                  <Select
                    value={String(localStartMonth)}
                    onValueChange={(value) => setLocalStartMonth(parseInt(value))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month.value} value={String(month.value)}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <Label className="text-base font-semibold">{t("configuration.calendar.yearNaming")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("configuration.calendar.yearNamingDescription")}
                  </p>
                  <Select
                    value={String(localYearOffset)}
                    onValueChange={(value) => setLocalYearOffset(parseInt(value))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OFFSET_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {t(option.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              <Label className="text-base font-semibold">{t("configuration.calendar.livePreview")}</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("configuration.calendar.livePreviewDescription")}
            </p>
            <div className="grid grid-cols-3 gap-4">
              {previewExamples().map((example, idx) => (
                <div key={idx} className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700">
                  <div className="text-xs text-muted-foreground mb-1">{example.label}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">{example.dateStr}</div>
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                    <Badge variant="secondary" className="font-mono">
                      {example.formatted}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("configuration.calendar.impactTitle")}</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  {t("configuration.calendar.impactBody")}
                </p>
              </div>
            </div>
          </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
