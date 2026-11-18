import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface ComboboxWithInputProps {
  options: ComboboxOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  allowCustomValue?: boolean;
}

export function ComboboxWithInput({
  options,
  value = "",
  onValueChange,
  placeholder = "Select or type...",
  emptyText = "No matches found. Type to add custom value.",
  searchPlaceholder = "Search or type custom...",
  disabled = false,
  className,
  allowCustomValue = true,
}: ComboboxWithInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return options;
    const searchLower = inputValue.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower)
    );
  }, [options, inputValue]);

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    if (allowCustomValue) {
      onValueChange(newValue);
    }
  };

  const handleSelect = (selectedValue: string) => {
    const option = options.find(
      (opt) => opt.label.toLowerCase() === selectedValue.toLowerCase()
    );
    const finalValue = option ? option.label : selectedValue;
    setInputValue(finalValue);
    onValueChange(finalValue);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && allowCustomValue && inputValue) {
      e.preventDefault();
      onValueChange(inputValue);
      setOpen(false);
    }
  };

  const displayValue = value || "";
  const selectedOption = options.find((opt) => opt.label === displayValue);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <div className="flex items-center gap-2 truncate text-left">
            {selectedOption?.icon}
            <span className="truncate">
              {displayValue || (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={inputValue}
            onValueChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <CommandList>
            <CommandEmpty>
              {allowCustomValue && inputValue ? (
                <div className="py-2 px-3 text-sm">
                  Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to use "{inputValue}"
                </div>
              ) : (
                emptyText
              )}
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.label ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                    {option.icon}
                    <span>{option.label}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
