import type { ReactNode } from "react";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5 marker:text-muted-foreground/60">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
