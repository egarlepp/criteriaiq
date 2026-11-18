// Shared project constants to maintain consistency across the application

export const CUSTOMER_STATUS_OPTIONS = [
  "On Time",
  "Complete", 
  "Need Assistance",
  "Delayed",
  "On Hold",
  "Pending Internal Feedback",
  "In CAB",
  "Evaluating Other Vendors",
  "Selecting Solution"
] as const;

export type CustomerStatus = typeof CUSTOMER_STATUS_OPTIONS[number];

// Customer status color mapping
export const getCustomerStatusColor = (status: string): string => {
  switch (status) {
    case "On Time": return "#10B981";
    case "Complete": return "#059669";
    case "Need Assistance": return "#F59E0B";
    case "Delayed": return "#EF4444";
    case "On Hold": return "#6B7280";
    case "Pending Internal Feedback": return "#8B5CF6";
    case "In CAB": return "#0EA5E9";
    default: return "#6B7280";
  }
};