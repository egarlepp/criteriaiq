// Shared neutral fallback for customer status when not found in database
export const CUSTOMER_STATUS_NEUTRAL_FALLBACK = {
  icon: null,
  color: '#6B7280'
};

// Customer Status utility functions
export const getCustomerStatusColor = (statusName: string, customerStatusConfigs: any[] = []): string => {
  const config = customerStatusConfigs.find((config: any) => 
    config.name.toLowerCase() === statusName.toLowerCase()
  );
  
  if (config) {
    return config.color;
  }
  
  // Use shared neutral fallback when status not found in database
  return CUSTOMER_STATUS_NEUTRAL_FALLBACK.color;
};

export const getCustomerStatusOptions = (customerStatusConfigs: any[] = []): string[] => {
  // Always return database configs, no hardcoded fallbacks
  return customerStatusConfigs.map((config: any) => config.name);
};
