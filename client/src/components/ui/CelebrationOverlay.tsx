import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { triggerCelebration, registerCelebrationCanvas } from '@/lib/celebration';

export function CelebrationOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { lastMessage } = useWebSocket();

  // Bind the canvas to the celebration module once mounted, and keep it sized to the viewport.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    sync();
    const unregister = registerCelebrationCanvas(canvas);
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      unregister();
    };
  }, []);

  // Server-pushed celebration events (existing behavior).
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage?.type === 'celebration') {
      triggerCelebration(lastMessage.style || 'confetti_burst', lastMessage.config || {});
    }
  }, [lastMessage]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );
}
