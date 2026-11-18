import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSystemHealthCategoryQuery } from "./useSystemHealthCategoryQuery";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Archive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Database,
  Users,
  FolderOpen,
  Building,
  TableProperties,
  ShieldCheck,
  Columns3
} from "lucide-react";
import { HealthFreshnessIndicator } from "./HealthFreshnessIndicator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ArchiveValidationData {
  status: "ok" | "warning" | "error";
  lastChecked: string;
  message?: string;
  results: Array<{
    tableName: string;
    sourceTable: string;
    archiveTable: string;
    sourceColumnCount: number;
    archiveColumnCount: number;
    status: "ok" | "warning";
    missingColumns: string[];
    extraColumns: string[];
    message: string;
  }>;
  summary: {
    totalTables: number;
    tablesOk: number;
    tablesWithIssues: number;
    totalMissingColumns: number;
  };
}

export function ArchiveValidationTab() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useSystemHealthCategoryQuery<ArchiveValidationData>({
    queryKey: ["system-health-archive-validation"],
    queryFn: async () => {
      const response = await fetch("/api/system/health/archive-validation");
      if (!response.ok) throw new Error("Failed to fetch archive validation");
      return response.json();
    },
    refetchInterval: 300000,
  });

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Healthy
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
    }
  };

  const getTableIcon = (tableName: string) => {
    if (tableName.includes("user")) return <Users className="h-4 w-4 text-blue-500" />;
    if (tableName.includes("project")) return <FolderOpen className="h-4 w-4 text-purple-500" />;
    if (tableName.includes("customer")) return <Building className="h-4 w-4 text-green-500" />;
    return <Database className="h-4 w-4 text-gray-500 dark:text-gray-400" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load archive validation data.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="relative">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            {getStatusBadge(data.status)}
            <HealthFreshnessIndicator
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => refetch()}
              testIdPrefix="archive-validation-health"
              lastCheckedIso={data.lastChecked}
            />
          </div>
          <div className="flex items-center gap-2">
            <Archive className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl font-bold">
              Archive Schema Validation
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitors and Compares source tables with archive tables to ensure data integrity
          </p>
        </CardHeader> 
      <div className="grid grid-cols-4 gap-4 px-4 pb-4 pt-0">
        <Card className="relative overflow-hidden bg-gray-50/80 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <TableProperties className="h-24 w-24 opacity-10 text-gray-600 dark:text-gray-400" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TableProperties className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Total Tables</h3>
            </div>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
              {data.summary.totalTables}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">archive tables</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <ShieldCheck className="h-24 w-24 opacity-10 text-green-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-green-700 dark:text-green-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Healthy</h3>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {data.summary.tablesOk}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">tables match schema</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <AlertTriangle className="h-24 w-24 opacity-10 text-yellow-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-700 dark:text-yellow-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">With Issues</h3>
            </div>
            <div className="text-2xl font-bold text-yellow-600">
              {data.summary.tablesWithIssues}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">need attention</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Columns3 className="h-24 w-24 opacity-10 text-blue-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Columns3 className="w-5 h-5 text-blue-700 dark:text-blue-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Missing Columns</h3>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {data.summary.totalMissingColumns}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">columns to add</p>
          </CardContent>
        </Card>
      </div>
    </Card>
      
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Archive} />
        <CardHeader className="relative z-10">
          <CardTitle className="text-2xl font-bold">Table Comparison Results</CardTitle>
          <CardDescription>
            Detailed comparison of source and archive table schemas
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <Accordion type="single" collapsible className="w-full">
            {data.results.map((result, index) => (
              <AccordionItem key={result.tableName} value={`item-${index}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 w-full">
                    {getTableIcon(result.tableName)}
                    <span className="font-medium capitalize">
                      {result.tableName.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      ({result.sourceTable} → {result.archiveTable})
                    </span>
                    <div className="ml-auto mr-4">
                      {getStatusBadge(result.status)}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pl-7 space-y-3">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Source columns: </span>
                        <span className="font-medium">{result.sourceColumnCount}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Archive columns: </span>
                        <span className="font-medium">{result.archiveColumnCount}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{result.message}</p>
                    
                    {result.missingColumns.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                          Missing in Archive Table ({result.missingColumns.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {result.missingColumns.map((col) => (
                            <Badge 
                              key={col} 
                              variant="outline" 
                              className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                            >
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.extraColumns.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Archive-Only Columns ({result.extraColumns.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {result.extraColumns.map((col) => (
                            <Badge 
                              key={col} 
                              variant="outline" 
                              className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                            >
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      <div className="p-4 relative z-10">
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-2">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-800/30 rounded-lg">
              <Database className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">About Archive Schema Validation</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                This check compares the columns in source tables (users, projects, customers) with their 
                corresponding archive tables. When new fields are added to source tables, they should also 
                be added to archive tables to ensure complete data preservation during archiving. 
                Missing columns mean some data won't be captured when items are archived.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </Card>
    </div>
  );
}
