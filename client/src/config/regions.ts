import type { TFunction } from "i18next";
export const REGIONS = [
  { value: "North America", label: "North America", labelKey: "regions.northAmerica" },
  { value: "South America", label: "South America", labelKey: "regions.southAmerica" },
  { value: "Europe", label: "Europe", labelKey: "regions.europe" },
  { value: "Asia Pacific", label: "Asia Pacific", labelKey: "regions.asiaPacific" },
  { value: "Middle East & Africa", label: "Middle East & Africa", labelKey: "regions.middleEastAfrica" },
  { value: "Global", label: "Global", labelKey: "regions.global" }
] as const;


export const getRegionLabel = (value: string, t?: TFunction) => {
  const region = REGIONS.find(r => r.value === value);
  if (!region) return value;
  if (t) return t(region.labelKey, { defaultValue: region.label });
  return region.label;
};
