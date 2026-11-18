"use client"

import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { ProjectFilters } from "@/types/project"; 

interface DashboardContextType {
  // State
  filters: ProjectFilters;
  setFilters: React.Dispatch<React.SetStateAction<ProjectFilters>>;
  completingPeriod: string;
  setCompletingPeriod: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  showMyProjects: boolean;
  setShowMyProjects: (val: boolean) => void;

  // Computed
  activeFilterCount: number;

  // Actions
  clearAllFilters: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  // 1. Move the state from MainDashboard to here
  const [filters, setFilters] = useState<ProjectFilters>({ solutions: [], primaryEngineer: [], specialistEngineer: [] });
  const [completingPeriod, setCompletingPeriod] = useState<string>("all-projects");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showMyProjects, setShowMyProjects] = useState<boolean>(false);

  // 2. Move the Logic from MainDashboard to here
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status) count++;
    if (filters.customerName) count++;
    if (filters.customerStatus) count++;
    if (completingPeriod !== "all-projects") count++;
    if (startDate) count++;
    if (endDate) count++;
    if (filters.riskLevel) count++;
    if (filters.ranking) count++;
    if (filters.solutions && filters.solutions.length > 0) count++;
    if (filters.primaryEngineer && filters.primaryEngineer.length > 0) count++;
    if (filters.specialistEngineer && filters.specialistEngineer.length > 0) count++;
    if (filters.environment) count++;
    if (filters.team) count++;
    if (filters.fiscalQuarter) count++;
    if (filters.fiscalStatus) count++;
    if (showMyProjects) count++;
    return count;
  }, [filters, completingPeriod, startDate, endDate, showMyProjects]);

  const clearAllFilters = () => {
    setFilters({ solutions: [], primaryEngineer: [], specialistEngineer: [] });
    setCompletingPeriod("all-projects");
    setStartDate("");
    setEndDate("");
    setShowMyProjects(false);
  };

  const value = {
    filters, setFilters,
    completingPeriod, setCompletingPeriod,
    startDate, setStartDate,
    endDate, setEndDate,
    showMyProjects, setShowMyProjects,
    activeFilterCount,
    clearAllFilters
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardFilters() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error("useDashboardFilters must be used within a DashboardProvider");
  }
  return context;
}