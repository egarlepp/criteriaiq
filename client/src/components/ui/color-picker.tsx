import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Label } from './label';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { Star, X } from 'lucide-react';

const FAVORITES_STORAGE_KEY = 'criteriaiq-color-favorites';

const DEFAULT_PRESET_COLORS = [
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#10B981", // Green
  "#F59E0B", // Amber/Orange
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F97316", // Orange
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#FACC15", // Yellow
  "#9CA3AF", // Gray
  "#1E40AF", // Dark Blue
  "#000000", // Black
];

function isValidHex(hex: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

function normalizeHex(hex: string): string {
  let normalized = hex.toUpperCase();
  if (!normalized.startsWith('#')) {
    normalized = '#' + normalized;
  }
  if (/^#[A-Fa-f0-9]{3}$/.test(normalized)) {
    normalized = '#' + normalized[1] + normalized[1] + normalized[2] + normalized[2] + normalized[3] + normalized[3];
  }
  return normalized;
}

function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter(c => typeof c === 'string' && isValidHex(c));
      }
    }
  } catch (e) {
    console.warn('Failed to load color favorites from localStorage');
  }
  return [];
}

function saveFavorites(favorites: string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch (e) {
    console.warn('Failed to save color favorites to localStorage');
  }
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  presetColors?: string[];
  showPresets?: boolean;
  showCustomPicker?: boolean;
  showFavorites?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ColorPicker({
  value,
  onChange,
  label,
  presetColors = DEFAULT_PRESET_COLORS,
  showPresets = true,
  showCustomPicker = true,
  showFavorites = true,
  className,
  triggerClassName,
  size = 'md',
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value || '#3B82F6');
  const [hexError, setHexError] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  useEffect(() => {
    setHexInput(value || '#3B82F6');
    setHexError(false);
  }, [value]);

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    if (!inputValue.startsWith('#') && inputValue.length > 0) {
      inputValue = '#' + inputValue;
    }
    setHexInput(inputValue);
    
    if (inputValue === '' || inputValue === '#') {
      setHexError(false);
    } else if (isValidHex(inputValue)) {
      setHexError(false);
      onChange(normalizeHex(inputValue));
    } else if (inputValue.length > 1) {
      setHexError(true);
    }
  };

  const handleHexInputBlur = () => {
    if (isValidHex(hexInput)) {
      onChange(normalizeHex(hexInput));
      setHexError(false);
    } else {
      setHexInput(value || '#3B82F6');
      setHexError(false);
    }
  };

  const toggleFavorite = (color: string) => {
    const normalized = normalizeHex(color);
    if (!isValidHex(normalized)) {
      return;
    }
    
    let newFavorites: string[];
    
    if (favorites.includes(normalized)) {
      newFavorites = favorites.filter(c => c !== normalized);
    } else {
      newFavorites = [...favorites, normalized].slice(0, 10);
    }
    
    setFavorites(newFavorites);
    saveFavorites(newFavorites);
  };

  const canAddFavorite = (color: string) => {
    const normalized = normalizeHex(color);
    return isValidHex(normalized);
  };

  const removeFavorite = (color: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const normalized = normalizeHex(color);
    const newFavorites = favorites.filter(c => c !== normalized);
    setFavorites(newFavorites);
    saveFavorites(newFavorites);
  };

  const isFavorite = (color: string) => {
    return favorites.includes(normalizeHex(color));
  };

  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const presetSizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label className="text-xs">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full h-10 justify-start gap-2 px-3",
              triggerClassName
            )}
            type="button"
          >
            <div
              className={cn(
                "rounded-full border border-gray-300 dark:border-slate-600 shrink-0",
                sizeClasses[size]
              )}
              style={{ backgroundColor: value || '#3B82F6' }}
            />
            <span className="text-sm font-mono text-muted-foreground">
              {value || 'Select color...'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-4 dark:bg-slate-900 dark:border-slate-700" 
          align="start"
          sideOffset={4}
        >
          <div className="space-y-4">
            {showFavorites && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  Favorites
                </Label>
                {favorites.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {favorites.map((color) => (
                      <div key={color} className="relative group">
                        <button
                          type="button"
                          className={cn(
                            "rounded-full border-2 transition-all hover:scale-110",
                            presetSizeClasses[size],
                            value === color 
                              ? 'border-gray-900 dark:border-white ring-2 ring-offset-1 ring-primary' 
                              : 'border-transparent hover:border-gray-400 dark:hover:border-slate-500'
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => onChange(color)}
                          title={color}
                        />
                        <button
                          type="button"
                          onClick={(e) => removeFavorite(color, e)}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove from favorites"
                        >
                          <X className="h-2.5 w-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Click the star below to save colors here
                  </p>
                )}
              </div>
            )}

            {showPresets && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Preset Colors</Label>
                <div className="grid grid-cols-5 gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        "rounded-full border-2 transition-all hover:scale-110",
                        presetSizeClasses[size],
                        value === color 
                          ? 'border-gray-900 dark:border-white ring-2 ring-offset-1 ring-primary' 
                          : 'border-transparent hover:border-gray-400 dark:hover:border-slate-500'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        onChange(color);
                      }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            {showCustomPicker && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Custom Color</Label>
                <div className="space-y-3">
                  <HexColorPicker
                    color={value || '#3B82F6'}
                    onChange={onChange}
                    style={{ width: '100%', height: '140px' }}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 dark:border-slate-600 shrink-0"
                      style={{ backgroundColor: value || '#3B82F6' }}
                    />
                    <Input
                      value={hexInput}
                      onChange={handleHexInputChange}
                      onBlur={handleHexInputBlur}
                      placeholder="#000000"
                      className={cn(
                        "h-8 w-24 font-mono text-sm",
                        hexError && "border-red-500 focus-visible:ring-red-500"
                      )}
                      maxLength={7}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFavorite(value)}
                      disabled={!canAddFavorite(value)}
                      className={cn(
                        "h-8 w-8 p-0",
                        isFavorite(value) && "text-amber-500",
                        !canAddFavorite(value) && "opacity-50 cursor-not-allowed"
                      )}
                      title={!canAddFavorite(value) ? "Select a valid color first" : isFavorite(value) ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star className={cn(
                        "h-4 w-4",
                        isFavorite(value) && "fill-amber-400"
                      )} />
                    </Button>
                  </div>
                  {hexError && (
                    <p className="text-xs text-red-500">Enter a valid hex code (e.g., #FF5733)</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { DEFAULT_PRESET_COLORS };
