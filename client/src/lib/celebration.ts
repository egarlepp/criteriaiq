import confetti from 'canvas-confetti';

// canvas-confetti's default global instance uses a Web Worker + OffscreenCanvas.
// In this app's build the worker silently fails to deliver frames — the canvas
// gets `transferControlToOffscreen()` applied and never paints, so users see
// nothing. We force a main-thread instance bound to a DOM canvas we control.
// The canvas is owned by <CelebrationOverlay /> in the React tree; that
// component calls `registerCelebrationCanvas` on mount with its <canvas> ref.
let registeredCanvas: HTMLCanvasElement | null = null;
let registeredFire: ((opts: confetti.Options) => Promise<null> | null) | null = null;

export function registerCelebrationCanvas(canvas: HTMLCanvasElement) {
  registeredCanvas = canvas;
  registeredFire = confetti.create(canvas, { useWorker: false, resize: false });
  return () => {
    if (registeredCanvas === canvas) {
      registeredCanvas = null;
      registeredFire = null;
    }
  };
}

function fire(opts: confetti.Options) {
  if (registeredFire && registeredCanvas && document.body.contains(registeredCanvas)) {
    registeredFire(opts);
  } else if (typeof window !== 'undefined') {
    confetti(opts);
  }
}

type ColorPreset = 'rainbow' | 'gold' | 'brand' | 'mono';

const COLOR_PRESETS: Record<ColorPreset, string[] | undefined> = {
  rainbow: undefined,
  gold: ['#FFD700', '#FFA500', '#FFFFFF', '#FFE066'],
  brand: ['#7C3AED', '#3B82F6', '#A78BFA', '#93C5FD', '#6D28D9'],
  mono: ['#1a1a1a', '#555555', '#999999', '#cccccc', '#ffffff'],
};

function getColors(preset: string): string[] | undefined {
  return COLOR_PRESETS[(preset as ColorPreset)] ?? undefined;
}

export interface CelebrationConfig {
  particleCount?: number;
  spread?: number;
  startVelocity?: number;
  burstCount?: number;
  colorPreset?: string;
  duration?: number;
}

function confettiBurst(config: CelebrationConfig = {}) {
  const {
    particleCount = 150,
    spread = 90,
    colorPreset = 'rainbow',
    duration = 4,
  } = config;

  fire({
    particleCount,
    spread,
    origin: { x: 0.5, y: 0.08 },
    colors: getColors(colorPreset),
    startVelocity: 45,
    gravity: 0.8,
    ticks: Math.round(duration * 60),
  });
}

function sideCannons(config: CelebrationConfig = {}) {
  const {
    particleCount = 80,
    startVelocity = 45,
    colorPreset = 'rainbow',
    duration = 4,
  } = config;

  const colors = getColors(colorPreset);
  const ticks = Math.round(duration * 60);

  fire({
    particleCount,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.5 },
    startVelocity,
    colors,
    ticks,
  });

  fire({
    particleCount,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.5 },
    startVelocity,
    colors,
    ticks,
  });
}

function fireworks(config: CelebrationConfig = {}) {
  const {
    burstCount = 5,
    particleCount = 40,
    colorPreset = 'rainbow',
    duration = 4,
  } = config;

  const colors = getColors(colorPreset);
  const ticks = Math.round(duration * 60);

  for (let i = 0; i < burstCount; i++) {
    setTimeout(() => {
      fire({
        particleCount,
        spread: 360,
        origin: {
          x: 0.1 + Math.random() * 0.8,
          y: 0.1 + Math.random() * 0.5,
        },
        startVelocity: 30,
        colors,
        shapes: ['star'],
        gravity: 0.5,
        ticks,
      });
    }, i * 250);
  }
}

function stars(config: CelebrationConfig = {}) {
  const {
    particleCount = 100,
    spread = 60,
    startVelocity = 35,
    colorPreset = 'rainbow',
    duration = 4,
  } = config;

  fire({
    particleCount,
    spread,
    startVelocity,
    origin: { x: 0.5, y: 1 },
    shapes: ['star'],
    colors: getColors(colorPreset),
    gravity: 0.6,
    ticks: Math.round(duration * 60),
  });
}

export function triggerCelebration(style: string, config: CelebrationConfig = {}) {
  switch (style) {
    case 'side_cannons':
      sideCannons(config);
      break;
    case 'fireworks':
      fireworks(config);
      break;
    case 'stars':
      stars(config);
      break;
    case 'confetti_burst':
    default:
      confettiBurst(config);
      break;
  }
}
