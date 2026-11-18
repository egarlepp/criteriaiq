// Simulating an enterprise backend response
export interface ChartDataPoint {
  name: string;
  value: number;
  value2?: number; // For stacked/grouped charts
  status?: string; // For project tracking
}

const MOCK_DATASETS: Record<string, ChartDataPoint[]> = {
  fiscal_trends: [
    { name: 'Jan', value: 4000, value2: 2400 },
    { name: 'Feb', value: 3000, value2: 1398 },
    { name: 'Mar', value: 2000, value2: 9800 },
    { name: 'Apr', value: 2780, value2: 3908 },
    { name: 'May', value: 1890, value2: 4800 },
    { name: 'Jun', value: 2390, value2: 3800 },
  ],
  user_activity: [
    { name: 'Mon', value: 120 },
    { name: 'Tue', value: 132 },
    { name: 'Wed', value: 101 },
    { name: 'Thu', value: 134 },
    { name: 'Fri', value: 290 },
    { name: 'Sat', value: 230 },
    { name: 'Sun', value: 210 },
  ],
  project_status: [
    { name: 'Completed', value: 45 },
    { name: 'In Progress', value: 30 },
    { name: 'Blocked', value: 10 },
    { name: 'Backlog', value: 15 },
  ]
};

export const fetchAnalyticsData = async (source: string): Promise<ChartDataPoint[]> => {
  // Simulate network latency (300ms)
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_DATASETS[source] || MOCK_DATASETS['fiscal_trends']);
    }, 300);
  });
};