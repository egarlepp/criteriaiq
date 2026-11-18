import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ProjectIQCoach() {
  const { t } = useTranslation();

  const features = [
    t("projects.iqCoach.featureGuidance"),
    t("projects.iqCoach.featureRecommendations"),
    t("projects.iqCoach.featureIndustrySupport"),
    t("projects.iqCoach.featureCompetitiveIntelligence"),
    t("projects.iqCoach.featureProjectRisk"),
    t("projects.iqCoach.featureProjectInsights"),
  ];

  return (
    <Card className="border-dashed border-2 border-blue-300 dark:border-blue-700 bg-blue-100/30 dark:bg-blue-900/30">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
          <Bot className="h-8 w-8 text-blue-500 dark:text-blue-400" />
        </div>
        <CardTitle className="text-2xl text-gray-900 dark:text-gray-100">
          {t("projects.iqCoach.title")}
        </CardTitle>
        <CardDescription className="text-2xl text-bold text-gray-600 dark:text-gray-400">
          {t("common.comingSoon")}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4 pb-8">
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {features.map((feature) => (
            <Badge
              key={feature}
              variant="secondary"
              className="bg-blue-100/80 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
            >
              {feature}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
