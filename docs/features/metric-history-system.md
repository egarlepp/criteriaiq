# Metric History System

**Version:** 0.5.11  
**Last Updated:** January 2026

## Overview

The Metric History System provides centralized tracking and visualization of key performance indicators (KPIs) and other metrics over time. It enables week-over-week trend analysis through sparkline visualizations in dashboard widgets.

## Architecture

### Database Schema

The system uses a single `metric_snapshots` table to store all metric history:

```sql
CREATE TABLE metric_snapshots (
  id SERIAL PRIMARY KEY,
  metric_key VARCHAR NOT NULL,        -- Unique identifier (e.g., "kpi.success_rate")
  value NUMERIC NOT NULL,             -- The metric value at snapshot time
  snapshot_date TIMESTAMP NOT NULL,   -- When the snapshot was taken
  snapshot_week VARCHAR,              -- Week identifier (e.g., "2026-W03")
  metadata JSONB,                     -- Optional additional context
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Metric Key Naming Convention

Metric keys follow a hierarchical pattern:
- `kpi.{metric_name}` - KPI dashboard metrics
- `map.{metric_name}` - Mutual Action Plan metrics
- `support.{metric_name}` - Support request metrics

## Components

### Server-Side

#### MetricSnapshotService (`server/metric-snapshot-service.ts`)

The service contains:
1. **Metric Registry** - Definitions of all tracked metrics with calculation logic
2. **Calculation Methods** - Database queries to compute current values
3. **Snapshot Storage** - Methods to save and retrieve historical data

```typescript
interface MetricDefinition {
  key: string;
  name: string;
  description: string;
  category: "kpi" | "map" | "support" | "custom";
  unit: "count" | "currency" | "percentage" | "days" | "hours";
  calculate: () => Promise<number>;
}
```

### Client-Side

#### useMetricHistory Hook (`client/src/hooks/use-metric-history.ts`)

React hook for fetching metric history:

```typescript
const { data, isLoading } = useMetricHistory("kpi.success_rate", 6);
// Returns: { date: string, week: string, value: number }[]
```

#### MetricSparkline Component (`client/src/components/metric-sparkline.tsx`)

Reusable visualization component:

```tsx
<MetricSparkline
  metricKey="kpi.active_pipeline_acv"
  width={70}
  height={24}
  unit="currency"
  showPoints={true}
/>
```

## Registered Metrics

### KPI Metrics

| Key | Name | Unit | Description |
|-----|------|------|-------------|
| `kpi.total_completed_count` | Clear to Close (TCC) | count | Projects with Completed status |
| `kpi.active_pipeline_acv` | Active Pipeline Value | currency | Total ACV of active projects |
| `kpi.success_rate` | Success Rate | percentage | Won / (Won + Lost) * 100 |
| `kpi.completing_soon_count` | Completing Soon | count | Projects ending within 5 days |
| `kpi.started_this_week_count` | Started This Week | count | Projects started this week |
| `kpi.at_risk_count` | At Risk Projects | count | Projects with High/Red/Critical risk |
| `kpi.won_acv` | Won ACV | currency | Total ACV of won projects |
| `kpi.lost_acv` | Lost ACV | currency | Total ACV of lost projects |
| `kpi.customer_count` | Total Customers | count | Total customers in system |
| `kpi.avg_days_to_close` | Avg Days To Close | days | Average project duration |
| `kpi.new_pipeline_this_week` | New Pipeline This Week | currency | ACV of projects created this week |

### MAP Metrics

| Key | Name | Unit | Description |
|-----|------|------|-------------|
| `map.phases_completed` | MAP Phases Completed | count | Completed MAP phases |
| `map.phases_total` | MAP Phases Total | count | Total MAP phases |
| `map.steps_completed` | MAP Steps Completed | count | Completed MAP steps |
| `map.steps_total` | MAP Steps Total | count | Total MAP steps |
| `map.tasks_completed` | MAP Tasks Completed | count | Completed MAP tasks |
| `map.tasks_total` | MAP Tasks Total | count | Total MAP tasks |
| `map.overall_completion` | MAP Overall Completion % | percentage | Overall completion percentage |

## API Endpoints

### Get Metric History
```
GET /api/metrics/history/:key?limit=6
```
Returns historical values for a single metric.

### Get Multiple Metrics (Batch)
```
POST /api/metrics/history/batch
Body: { "keys": ["kpi.success_rate", "kpi.won_acv"], "limit": 6 }
```
Returns history for multiple metrics in one request.

### Capture Snapshot
```
POST /api/metrics/snapshot
```
Captures current values for all registered metrics. Should be called weekly (typically Sunday end-of-week).

### Get Metric Definitions
```
GET /api/metrics/definitions
```
Returns all registered metric definitions.

### Get Current Value
```
GET /api/metrics/current/:key
```
Calculates and returns current value without saving.

## Adding New Metrics

To add a new metric:

1. Add definition to `server/metric-snapshot-service.ts`:

```typescript
{
  key: "custom.my_metric",
  name: "My Custom Metric",
  description: "Description of what this tracks",
  category: "custom",
  unit: "count",
  calculate: async () => {
    const result = await db.select(...).from(myTable);
    return result.length;
  }
}
```

2. Use in components:

```tsx
<MetricSparkline metricKey="custom.my_metric" unit="count" />
```

## Snapshot Schedule

Snapshots should be captured weekly to maintain 6-week trend visibility. Options:

1. **Manual** - Call `POST /api/metrics/snapshot` via admin action
2. **Scheduled** - Use external cron or your host's scheduler
3. **Server-Side** - Add node-cron job (future enhancement)

## Best Practices

1. **Consistent timing** - Capture snapshots at the same time each week
2. **Week identification** - Use ISO week format (YYYY-WWW)
3. **Error handling** - Individual metric failures don't block others
4. **Data retention** - Consider archiving old snapshots after 52 weeks

## Troubleshooting

### Sparklines show "No data"
- Ensure at least one snapshot has been captured
- Check that the metricKey matches exactly
- Verify the API endpoint returns data

### Trends appear flat
- New metrics need multiple weeks of data
- Check that calculations are returning varied values
- Verify snapshots are being captured regularly
