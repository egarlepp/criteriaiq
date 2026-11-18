
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function ProjectStatusGuide() {
  const { t } = useTranslation();
  const { data: customerStatusConfigs = [], isLoading: customerStatusLoading } = useQuery({
    queryKey: ["/api/customer-status-configs"],
    queryFn: () => apiRequest("GET", "/api/customer-status-configs"),
  });

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          {t('projects.statusGuide.title')}
        </CardTitle>
        <CardDescription>
          {t('projects.statusGuide.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Internal Project Status */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">{t('projects.statusGuide.internalStatusTitle')}</h4>
            <p className="text-sm text-gray-600 mb-4">{t('projects.statusGuide.internalStatusDescription')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: "#64748B"}}></div>
                <div>
                  <h5 className="font-medium">{t('projects.statusGuide.planning')}</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('projects.statusGuide.planningDescription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: "#3B82F6"}}></div>
                <div>
                  <h5 className="font-medium">{t('projects.statusGuide.inProgress')}</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('projects.statusGuide.inProgressDescription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: "#f59e0b"}}></div>
                <div>
                  <h5 className="font-medium">{t('projects.statusGuide.completed')}</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('projects.statusGuide.completedDescription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-green-100 dark:bg-green-950 rounded-lg">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: "#10B981"}}></div>
                <div>
                  <h5 className="font-medium">{t('projects.statusGuide.tcc')}</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('projects.statusGuide.tccDescription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-lime-50 dark:bg-lime-950 rounded-lg">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: "#84CC16"}}></div>
                <div>
                  <h5 className="font-medium">{t('projects.statusGuide.closedWon')}</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('projects.statusGuide.closedWonDescription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: "#EF4444"}}></div>
                <div>
                  <h5 className="font-medium">{t('projects.statusGuide.closedLost')}</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('projects.statusGuide.closedLostDescription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: "#F59E0B"}}></div>
                <div>
                  <h5 className="font-medium">{t('projects.statusGuide.onHold')}</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('projects.statusGuide.onHoldDescription')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Account Status */}
          <div className="border-t pt-6">
            <h4 className="font-semibold text-gray-900 mb-4">{t('projects.statusGuide.accountStatusTitle')}</h4>
            <p className="text-sm text-gray-600 mb-4">{t('projects.statusGuide.accountStatusDescription')}</p>
            {customerStatusLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-gray-600">{t('projects.statusGuide.loadingAccountStatus')}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {customerStatusConfigs.map((status: any) => {
                  // Generate a light background color based on the status color
                  const getBackgroundColor = (color: string) => {
                    // Convert hex to RGB and make it lighter
                    const hex = color.replace('#', '');
                    const r = parseInt(hex.substr(0, 2), 16);
                    const g = parseInt(hex.substr(2, 2), 16);
                    const b = parseInt(hex.substr(4, 2), 16);
                    return `rgba(${r}, ${g}, ${b}, 0.1)`;
                  };

                  return (
                    <div
                      key={status.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                      style={{ backgroundColor: getBackgroundColor(status.color) }}
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: status.color }}
                      ></div>
                      <div>
                        <h5 className="font-medium">{status.name}</h5>
                        <p className="text-sm text-gray-600">{status.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-100">
              <strong>{t('projects.statusGuide.note')}</strong> {t('projects.statusGuide.noteDescription')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
