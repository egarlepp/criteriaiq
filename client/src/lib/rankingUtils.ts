// Ranking utility functions
export const RANKING_NEUTRAL_FALLBACK = {
  icon: null,
  color: '#6B7280'
};

export const getRankingColor = (rankingName: string, rankingConfigs: any[] = []): string => {
  const config = rankingConfigs.find((config: any) => 
    config.name.toLowerCase() === rankingName.toLowerCase()
  );
  
  if (config) {
    return config.color;
  }
  
  return RANKING_NEUTRAL_FALLBACK.color;
};

export const getRankingIcon = (rankingName: string, rankingConfigs: any[] = []): string | null => {
  const config = rankingConfigs.find((config: any) => 
    config.name.toLowerCase() === rankingName.toLowerCase()
  );
  
  return config?.icon || RANKING_NEUTRAL_FALLBACK.icon;
};

export const getRankingOptions = (rankingConfigs: any[] = []): string[] => {
  return rankingConfigs.map((config: any) => config.name);
};
