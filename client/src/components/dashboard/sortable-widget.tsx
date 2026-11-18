import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableWidgetProps {
  id: string;
  children: React.ReactNode;
  isSelected?: boolean;
  onClick?: () => void;
}

export function SortableWidget({ id, children, isSelected, onClick }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto", // Bring to front while dragging
    opacity: isDragging ? 0.5 : 1,    // Fade slightly while dragging
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`h-full touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      {children}
    </div>
  );
}