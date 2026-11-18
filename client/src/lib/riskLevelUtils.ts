// Risk Level utility functions
export const RISK_LEVEL_NEUTRAL_FALLBACK = {
  icon: null,
  color: '#6B7280'
};

export const getRiskLevelColor = (levelName: string, riskLevelConfigs: any[] = []): string => {
  const config = riskLevelConfigs.find((config: any) => 
    config.name.toLowerCase() === levelName.toLowerCase()
  );
  
  if (config) {
    return config.color;
  }
  
  return RISK_LEVEL_NEUTRAL_FALLBACK.color;
};

export const getRiskLevelIcon = (levelName: string, riskLevelConfigs: any[] = []): string | null => {
  const config = riskLevelConfigs.find((config: any) => 
    config.name.toLowerCase() === levelName.toLowerCase()
  );
  
  return config?.icon || RISK_LEVEL_NEUTRAL_FALLBACK.icon;
};

export const getRiskLevelOptions = (riskLevelConfigs: any[] = []): string[] => {
  return riskLevelConfigs.map((config: any) => config.name);
};
