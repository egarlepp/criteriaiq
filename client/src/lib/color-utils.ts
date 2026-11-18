/**
 * Normalise a stored badge/status colour value to a usable CSS hex string.
 *
 * Legacy DB rows may hold Tailwind variant names ('destructive', 'warning',
 * etc.) instead of hex codes — these were valid when badges rendered via
 * shadcn Badge variants, but are not valid CSS colour values.  This function
 * maps them to their canonical hex equivalents so inline `style` props always
 * receive a real colour.
 */
export function normalizeColor(color: string): string {
  if (!color) return '#DC2626';
  if (color.startsWith('#')) return color;

  const colorMap: Record<string, string> = {
    destructive:  '#DC2626',
    warning:      '#F97316',
    secondary:    '#6B7280',
    success:      '#10B981',
    brown:        '#9A341E',
    black:        '#000000',
    yellow:       '#EAB308',
    'dark-yellow':'#CA8A04',
    blue:         '#3B82F6',
    purple:       '#8B5CF6',
  };

  return colorMap[color] ?? '#DC2626'; // default to red if unknown variant
}

/**
 * Compute contrasting text colour (black or white) for a given hex background.
 */
export function contrastingTextColor(hexColor: string): string {
  const hex = normalizeColor(hexColor).replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Validates if a string is a valid hex color
 * @param hex - Color string to validate
 * @returns true if valid hex color, false otherwise
 */
export function isValidHexColor(hex: string): boolean {
  if (!hex) return false;
  const cleanHex = hex.replace('#', '');
  return /^[0-9A-Fa-f]{6}$/.test(cleanHex);
}

/**
 * Lightens a hex color by a specified percentage
 * @param hex - Hex color string (e.g., "#3B82F6" or "3B82F6")
 * @param percent - Percentage to lighten (0-100), where 100 is white
 * @returns Lightened hex color string, or fallback gray if input invalid
 */
export function lightenColor(hex: string, percent: number): string {
  // Validate input
  if (!isValidHexColor(hex)) {
    console.warn(`Invalid hex color: ${hex}, using fallback`);
    return '#E5E7EB'; // Gray-200 fallback
  }
  
  // Validate percent range (0-100)
  const validPercent = Math.max(0, Math.min(100, percent));
  if (validPercent !== percent) {
    console.warn(`Percent out of range (${percent}), clamped to ${validPercent}`);
  }
  
  try {
    // Remove # if present
    const cleanHex = hex.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    
    // Validate parsed values
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      console.warn(`Failed to parse hex color: ${hex}, using fallback`);
      return '#E5E7EB';
    }
    
    // Calculate lightened values
    // Lighten by moving towards white (255)
    const lighten = (value: number) => {
      return Math.round(value + (255 - value) * (validPercent / 100));
    };
    
    const newR = lighten(r);
    const newG = lighten(g);
    const newB = lighten(b);
    
    // Convert back to hex
    const toHex = (value: number) => {
      const hex = value.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  } catch (error) {
    console.error(`Error lightening color ${hex}:`, error);
    return '#E5E7EB'; // Gray-200 fallback
  }
}

/**
 * Darkens a hex color by a specified percentage
 * @param hex - Hex color string (e.g., "#3B82F6" or "3B82F6")
 * @param percent - Percentage to darken (0-100), where 100 is black
 * @returns Darkened hex color string, or fallback gray if input invalid
 */
export function darkenColor(hex: string, percent: number): string {
  // Validate input
  if (!isValidHexColor(hex)) {
    console.warn(`Invalid hex color: ${hex}, using fallback`);
    return '#6B7280'; // Gray-500 fallback
  }
  
  try {
    // Remove # if present
    const cleanHex = hex.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    
    // Validate parsed values
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      console.warn(`Failed to parse hex color: ${hex}, using fallback`);
      return '#6B7280';
    }
    
    // Calculate darkened values
    // Darken by moving towards black (0)
    const darken = (value: number) => {
      return Math.round(value * (1 - percent / 100));
    };
    
    const newR = darken(r);
    const newG = darken(g);
    const newB = darken(b);
    
    // Convert back to hex
    const toHex = (value: number) => {
      const hex = value.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  } catch (error) {
    console.error(`Error darkening color ${hex}:`, error);
    return '#6B7280'; // Gray-500 fallback
  }
}
