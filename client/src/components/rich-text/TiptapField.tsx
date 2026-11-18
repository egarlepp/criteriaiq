import React from 'react';
import { Label } from '@/components/ui/label';
import { TiptapEditor, type TiptapEditorProps } from './TiptapEditor';
import { cn } from '@/lib/utils';

export interface TiptapFieldProps extends Omit<TiptapEditorProps, 'value' | 'onChange'> {
  name?: string;
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  containerClassName?: string;
  ref?: React.Ref<any>;
}

export function TiptapField({
  name,
  label,
  description,
  error,
  required,
  value,
  onChange,
  containerClassName,
  className,
  ref,
  ...props
}: TiptapFieldProps) {
  const fieldId = props.id || name || 'tiptap-field';

  return (
    <div className={cn('space-y-2', containerClassName)}>
      {label && (
        <Label
          htmlFor={fieldId}
          className={cn(
            'text-sm font-medium text-gray-700 dark:text-gray-300',
            required && "after:content-['*'] after:ml-0.5 after:text-destructive"
          )}
        >
          {label}
        </Label>
      )}

      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      <TiptapEditor
        ref={ref}
        id={fieldId}
        value={value}
        onChange={onChange}
        className={cn(
          error && 'border-destructive focus-within:ring-destructive',
          className
        )}
        {...props}
      />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

TiptapField.displayName = 'TiptapField';
