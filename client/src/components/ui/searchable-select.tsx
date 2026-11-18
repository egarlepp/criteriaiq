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

export interface SearchableSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  prefix?: string; // Prefix text like "(N/A)"
  bold?: boolean; // Whether to display in bold
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select an option...",
  emptyText = "No results found.",
  searchPlaceholder = "Search...",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  
  // Debounce search for better performance with large datasets
  const deferredSearch = React.useDeferredValue(search);

  const selectedOption = options.find((option) => option.value === value);
  
  // Filter options based on debounced search
  const filteredOptions = React.useMemo(() => {
    if (!deferredSearch) return options;
    
    const searchLower = deferredSearch.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower)
    );
  }, [options, deferredSearch]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between", className)}
          disabled={disabled}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedOption?.icon}
            <span className={cn("truncate", selectedOption?.bold ? "font-bold" : "")}>
              {selectedOption ? (
                <>
                  {selectedOption.prefix && <span className="text-gray-600 dark:text-gray-400">{selectedOption.prefix} </span>}
                  {selectedOption.label}
                </>
              ) : (
                placeholder
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
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value === value ? "" : option.value);
                    setOpen(false);
                    setSearch(""); // Reset search on selection
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                    {option.icon}
                    <span className={option.bold ? "font-bold" : ""}>
                      {option.prefix && <span className="text-gray-600 dark:text-gray-400">{option.prefix} </span>}
                      {option.label}
                    </span>
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
