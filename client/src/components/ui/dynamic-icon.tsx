import * as LucideIcons from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface DynamicIconProps extends Omit<LucideProps, 'ref'> {
  name: string;
  fallback?: React.ComponentType<LucideProps>;
}

export function DynamicIcon({ 
  name, 
  fallback: FallbackIcon = LucideIcons.HelpCircle,
  ...props 
}: DynamicIconProps) {
  const IconComponent = (LucideIcons as any)[name] as React.ComponentType<LucideProps> | undefined;
  
  if (!IconComponent) {
    return <FallbackIcon {...props} />;
  }
  
  return <IconComponent {...props} />;
}
