// Field and filter shapes shared by the Reports page and the Schedule Report
// dialog. They came from the Report Builder, which is archived under
// archive/analytics-builders/ and no longer part of the app.

export interface ReportField {
  field: string;
  label: string;
  type: string;
  source?: string;
  description?: string;
  example?: string | null;
}

export interface ReportFilter {
  field: string;
  operator: string;
  /**
   * Scalar operators (`equals`, `contains`, `greater_than`, ...) carry a
   * `string`. List operators (`in` / `not_in`) carry a `string[]`; older
   * saved reports may still hold a comma-string, which the server's
   * `coerceListValue` accepts too.
   */
  value: string | string[];
}
