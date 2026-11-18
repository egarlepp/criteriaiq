import React from 'react';
import { ScanSearch, ChevronDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from './badge';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface SearchFiltersSectionProps {
  children: React.ReactNode;
  title?: string;
  icon?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  actions?: React.ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
}

export function SearchFiltersSection({
  children,
  title,
  icon,
  className = '',
  headerClassName = '',
  actions,
  activeFilterCount = 0,
  onClearFilters
}: SearchFiltersSectionProps) {
  const { t } = useTranslation();
  const displayTitle = title || t('common.searchAndFilters');

  const hasActions = !!actions;
  const hasActiveFilters = activeFilterCount > 0;
  
  return (
    <div 
      className="rounded-lg border mb-4 px-3 search-filters-container transition-all duration-300 py-2 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 pt-[12px] pb-[12px]"
    >
      <div className={`flex items-center justify-between ${hasActions ? 'mb-2' : 'mb-3'}`}>
        <h3 className={`font-bold text-gray-900 dark:text-gray-100 search-filters-header flex items-center gap-2 ${headerClassName}`}>
          <div className={cn(
            "relative",
            hasActiveFilters && "animate-pulse"
          )}>
            {icon || (
              <ScanSearch 
                className={cn(
                  "h-5 w-5 transition-all duration-300",
                  hasActiveFilters 
                    ? "text-blue-600 dark:text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]" 
                    : "text-blue-600 dark:text-blue-400"
                )} 
              />
            )}
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            )}
          </div>
          {displayTitle}
          {hasActiveFilters && (
            <Badge 
              variant="default" 
              className="ml-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-2 py-0.5"
            >
              {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} active
            </Badge>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {hasActiveFilters && onClearFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/30"
            >
              <X className="h-3 w-3 mr-1" />
              Clear all
            </Button>
          )}
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
      <div className="search-filters-content">
        {children}
      </div>
    </div>
  );
}

interface FilterLabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

export function FilterLabel({ children, htmlFor, className = '' }: FilterLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`text-sm font-medium text-gray-700 dark:text-gray-300 search-filters-label mb-1 block ${className}`}
    >
      {children}
    </label>
  );
}

interface FilterMultiSelectButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

export function FilterMultiSelectButton({ children, className = '', ref, ...props }: FilterMultiSelectButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      data-filter-control=""
      className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 [&:hover]:bg-background [&:hover]:border-input dark:[&:hover]:bg-background dark:[&:hover]:border-input ${className}`}
      {...props}
    >
      <span className="truncate">{children}</span>
      <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
    </button>
  );
}

FilterMultiSelectButton.displayName = 'FilterMultiSelectButton';

SearchFiltersSection.Label = FilterLabel;
SearchFiltersSection.MultiSelectButton = FilterMultiSelectButton;
