import { useState, useMemo, useRef, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';
import { Input } from './input';
import { Button } from './button';
import { ScrollArea } from './scroll-area';
import { DynamicIcon } from './dynamic-icon';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Label } from './label';

interface LucideIconPickerProps {
  value?: string;
  onChange: (iconName: string) => void;
  label?: string;
  compact?: boolean;
  /** Which edge of the trigger the picker lines up with; "end" opens it leftward. */
  align?: 'start' | 'center' | 'end';
}

export function LucideIconPicker({ value, onChange, label, compact, align = 'start' }: LucideIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when popover opens - use longer delay for Dialog contexts
  useEffect(() => {
    if (open && inputRef.current) {
      // Increased timeout to ensure Dialog focus management completes first
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [open]);

  // Get all available Lucide icon names
  const allIcons = useMemo(() => {
    const icons = Object.keys(LucideIcons)
      .filter(key => {
        // Filter out non-icon exports and keep only the base icon names (not *Icon suffixes)
        return key !== 'createLucideIcon' && 
               key !== 'default' &&
               key !== 'icons' &&
               !key.startsWith('Lucide') &&
               !key.endsWith('Icon'); // Skip duplicate *Icon exports
      })
      .sort();
    return icons;
  }, []);

  // Filter icons based on search
  const filteredIcons = useMemo(() => {
    if (!search) return allIcons;
    const searchLower = search.toLowerCase();
    return allIcons.filter(icon => 
      icon.toLowerCase().includes(searchLower)
    );
  }, [allIcons, search]);

  const handleSelect = (iconName: string) => {
    onChange(iconName);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          {compact ? (
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              type="button"
              data-icon-picker-trigger
              title="Pick icon"
            >
              <DynamicIcon name={value ?? 'Circle'} className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full h-10 justify-start gap-2"
              type="button"
              data-icon-picker-trigger
            >
              {value ? (
                <>
                  <DynamicIcon name={value} className="h-4 w-4" />
                  <span>{value}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select an icon...</span>
              )}
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent 
          className="w-[400px] p-0" 
          align={align}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            // Prevent closing when clicking inside the popover
            const target = e.target as HTMLElement;
            if (target.closest('[data-icon-picker-content]')) {
              e.preventDefault();
            }
          }}
        >
          <div className="p-3 border-b" data-icon-picker-content>
            <Input
              ref={inputRef}
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
              autoFocus
            />
          </div>
          <ScrollArea className="h-[300px]">
            <div className="grid grid-cols-6 gap-2 p-3" data-icon-picker-content>
              {filteredIcons.slice(0, 150).map((iconName) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(iconName);
                  }}
                  className={`
                    flex items-center justify-center p-3 rounded-md
                    hover:bg-accent transition-colors
                    ${value === iconName ? 'bg-accent ring-2 ring-primary' : ''}
                  `}
                  title={iconName}
                >
                  <DynamicIcon name={iconName} className="h-5 w-5" />
                </button>
              ))}
            </div>
            {filteredIcons.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No icons found
              </div>
            )}
            {filteredIcons.length > 150 && (
              <div className="p-3 text-center text-sm text-muted-foreground border-t">
                Showing first 150 results. Refine your search to see more.
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
