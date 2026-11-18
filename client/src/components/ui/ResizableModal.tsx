
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * ResizableModal - A fully accessible, resizable and draggable modal component
 * 
 * Features:
 * - Resizable on all edges and corners
 * - Draggable by header
 * - Focus trap with tab cycling
 * - ESC key to close
 * - Click outside to close (optional)
 * - Size persistence in localStorage
 * - Responsive (full screen on small screens)
 * - ARIA compliant
 * - Scroll overflow handling
 * 
 * @example
 * <ResizableModal
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Edit Email Design"
 *   footer={<Button onClick={handleSave}>Save</Button>}
 *   initialSize={{ width: 800, height: 600 }}
 *   minSize={{ width: 400, height: 300 }}
 * >
 *   <div>Modal content</div>
 * </ResizableModal>
 */

interface ResizableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  titleIcon?: React.ElementType;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  initialSize?: { width?: number; height?: number };
  minSize?: { width?: number; height?: number };
  maxSize?: { width?: number; height?: number };
  draggable?: boolean;
  resizable?: boolean;
  ariaDescribedById?: string;
  className?: string;
}

interface Size {
  width: number;
  height: number;
}

interface Position {
  x: number;
  y: number;
}

const DEFAULT_SIZE = { width: 800, height: 600 };
const DEFAULT_MIN_SIZE = { width: 300, height: 200 };
const DEFAULT_MAX_SIZE = { width: 1400, height: 900 };

export function ResizableModal({
  open,
  onOpenChange,
  title,
  titleIcon,
  footer,
  children,
  initialSize = DEFAULT_SIZE,
  minSize = DEFAULT_MIN_SIZE,
  maxSize = DEFAULT_MAX_SIZE,
  draggable = true,
  resizable = true,
  ariaDescribedById,
  className,
}: ResizableModalProps) {
  const [size, setSize] = useState<Size>(() => ({
    width: initialSize.width || DEFAULT_SIZE.width,
    height: initialSize.height || DEFAULT_SIZE.height,
  }));
  
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, startWidth: 0, startHeight: 0, startX: 0, startY: 0 });

  // Generate storage key based on current route and modal identifier
  const getStorageKey = useCallback(() => {
    const path = window.location.pathname;
    const titleStr = typeof title === 'string' ? title : 'modal';
    return `resizable-modal-${path}-${titleStr.replace(/\s+/g, '-').toLowerCase()}`;
  }, [title]);

  // Check if mobile and handle window resize
  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth < 768;
      setIsMobile(newIsMobile);
    };
    
    handleResize();
    
    // Never add resize listener when modal is open - this prevents modal from closing
    if (!open) {
      const resizeTimeout = setTimeout(() => {
        window.addEventListener('resize', handleResize);
      }, 100);
      
      return () => {
        clearTimeout(resizeTimeout);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [open]);

  // Reset to default size when modal opens
  useEffect(() => {
    if (open) {
      setSize({
        width: initialSize.width || DEFAULT_SIZE.width,
        height: initialSize.height || DEFAULT_SIZE.height,
      });
    }
  }, [open, initialSize.width, initialSize.height]);

  // Center modal on open
  useEffect(() => {
    if (open && !isMobile) {
      const x = (window.innerWidth - size.width) / 2;
      const y = (window.innerHeight - size.height) / 2;
      setPosition({ x: Math.max(20, x), y: Math.max(20, y) });
    }
  }, [open]);

  // Size saving removed - modal always resets to default size

  // Focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleTab);
    document.addEventListener('keydown', handleEscape);
    firstElement?.focus();

    return () => {
      document.removeEventListener('keydown', handleTab);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onOpenChange]);

  // Dragging logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!draggable || isMobile) return;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: position.x,
      startY: position.y,
    };
  }, [draggable, position, isMobile]);

  // Resizing logic
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, direction: string) => {
    if (!resizable || isMobile) return;
    
    e.stopPropagation();
    setIsResizing(direction);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
      startX: position.x,
      startY: position.y,
    };
  }, [resizable, size, position, isMobile]);

  // Mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        
        const newX = dragStartRef.current.startX + deltaX;
        const newY = dragStartRef.current.startY + deltaY;
        
        setPosition({ x: newX, y: newY });
      }

      if (isResizing) {
        const deltaX = e.clientX - resizeStartRef.current.x;
        const deltaY = e.clientY - resizeStartRef.current.y;
        let newWidth = resizeStartRef.current.startWidth;
        let newHeight = resizeStartRef.current.startHeight;
        let newX = resizeStartRef.current.startX;
        let newY = resizeStartRef.current.startY;

        if (isResizing.includes('right')) {
          newWidth = Math.min(
            maxSize.width || DEFAULT_MAX_SIZE.width,
            Math.max(minSize.width || DEFAULT_MIN_SIZE.width, 
                     resizeStartRef.current.startWidth + deltaX)
          );
        }
        if (isResizing.includes('left')) {
          const widthChange = -deltaX;
          newWidth = Math.min(
            maxSize.width || DEFAULT_MAX_SIZE.width,
            Math.max(minSize.width || DEFAULT_MIN_SIZE.width,
                     resizeStartRef.current.startWidth + widthChange)
          );
          newX = resizeStartRef.current.startX - (newWidth - resizeStartRef.current.startWidth);
        }
        if (isResizing.includes('bottom')) {
          newHeight = Math.min(
            maxSize.height || DEFAULT_MAX_SIZE.height,
            Math.max(minSize.height || DEFAULT_MIN_SIZE.height,
                     resizeStartRef.current.startHeight + deltaY)
          );
        }
        if (isResizing.includes('top')) {
          const heightChange = -deltaY;
          newHeight = Math.min(
            maxSize.height || DEFAULT_MAX_SIZE.height,
            Math.max(minSize.height || DEFAULT_MIN_SIZE.height,
                     resizeStartRef.current.startHeight + heightChange)
          );
          newY = resizeStartRef.current.startY - (newHeight - resizeStartRef.current.startHeight);
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
      if (isResizing) {
        setIsResizing(null);
      }
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, size, minSize, maxSize]);

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  const modalStyle = isMobile ? {
    width: '100vw',
    height: '100vh',
    left: 0,
    top: 0,
  } : {
    width: `${size.width}px`,
    height: `${size.height}px`,
    left: `${Math.max(0, position.x)}px`,
    top: `${Math.max(0, position.y)}px`,
    position: 'fixed' as const,
    zIndex: 50,
  };

  const modal = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className={cn(
          "bg-background border shadow-lg flex flex-col",
          isMobile ? "w-full h-full" : "absolute rounded-lg",
          className
        )}
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        aria-describedby={ariaDescribedById}
      >
        {/* Header */}
        <div 
          className={cn(
            "flex items-center justify-between p-4 border-b bg-muted/50",
            draggable && !isMobile && "cursor-move select-none"
          )}
          onMouseDown={handleMouseDown}
        >
          <div id="modal-title" className="flex items-center gap-2 text-lg font-semibold pr-8">
            {titleIcon && React.createElement(titleIcon, { className: "h-5 w-5 text-blue-600" })}
            {title}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="shrink-0"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-scroll p-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="border-t p-4 bg-muted/50">
            {footer}
          </div>
        )}

        {/* Resize handles - only show on desktop */}
        {resizable && !isMobile && (
          <>
            {/* Edge handles */}
            <div
              className="absolute top-0 left-0 right-0 h-1 cursor-n-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'top')}
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
            />
            <div
              className="absolute top-0 bottom-0 left-0 w-1 cursor-w-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
            />
            <div
              className="absolute top-0 bottom-0 right-0 w-1 cursor-e-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
            />

            {/* Corner handles */}
            <div
              className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'topleft')}
            />
            <div
              className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'topright')}
            />
            <div
              className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'bottomleft')}
            />
            <div
              className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'bottomright')}
            />
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
