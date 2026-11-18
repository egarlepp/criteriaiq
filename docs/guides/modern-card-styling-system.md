# Modern Card Styling System (Card Modern Layouts) — Technical Documentation

> **Last Updated:** January 2026  
> **Version:** v1.0.0  
> **Created:** January 2026  

---

## Table of Contents

- [Purpose](#purpose)
- [High-level Architecture](#high-level-architecture)
- [Core Component: DemoStatCard](#core-component-demostatcard)
  - [Responsibilities](#responsibilities)
  - [Why rails are outside CardContent](#why-rails-are-outside-cardcontent)
- [Rail System](#rail-system)
  - [RailConfig](#railconfig)
  - [Rail Modes](#rail-modes)
  - [Automatic Content Offsets](#automatic-content-offsets)
- [Accent Icon (Watermark) System](#accent-icon-watermark-system)
  - [AccentIconConfig](#accenticonconfig)
  - [How it renders](#how-it-renders)
  - [Why the icon type is SvgIcon](#why-the-icon-type-is-svgicon)
- [Content: KpiRow](#content-kpirow)
- [Variant Registry: cards[]](#variant-registry-cards)
  - [Why contentClassName exists](#why-contentclassname-exists)
- [Theming System](#theming-system)
  - [Theme Goals](#theme-goals)
  - [Theme Tokens](#theme-tokens)
  - [Dropdown Theme Switcher](#dropdown-theme-switcher)
  - [What gets themed](#what-gets-themed)
  - [Quick-fill variants are also theme-aware](#quick-fill-variants-are-also-theme-aware)
- [Using These Cards in CriteriaIQ](#using-these-cards-in-criteriaiq)
- [Extension Guidelines](#extension-guidelines)
  - [Adding a new variant](#adding-a-new-variant)
  - [Adding a new theme](#adding-a-new-theme)
  - [Adding theme-colored gradients](#adding-theme-colored-gradients)
- [Troubleshooting](#troubleshooting)
- [Summary](#summary)

---

## Purpose

This document describes the **Modern Card Styling System** implemented in `UIShowcaseTab.tsx` (Card Modern Layouts).  
The system is designed to:

- Produce **consistent, modern KPI/stat cards** with a shared structure.
- Support **data-driven variants** (many cards defined as objects in a list).
- Enable **layout-level decorations** (rails and watermarks) without breaking content layouts.
- Provide **global theming** (emerald/blue/orange/red/violet) via a dropdown.
- Make it easy to use the same patterns in the **CriteriaIQ** app for dashboards, scorecards, and metric tiles.

---

## High-level Architecture

The system is built from a few composable primitives:

1. **`DemoStatCard`** — the “chassis” (layout wrapper)
2. **`RailConfig`** — declarative rail placement (left/right/top/bottom) with `flush` / `inset`
3. **`AccentIconConfig`** — declarative watermark icon placement + transforms (rotate/skew/cutoff)
4. **`KpiRow`** — reusable KPI row content (icon + number) that can inherit theme tone
5. **`THEMES` + dropdown** — centralized theme tokens applied across all cards
6. **`cards[]` array** — the “variant registry” (each card is an object with config + content)

### The design principle

**Card content is composition-driven (`children`)**  
Decorations are **config-driven** (`rail`, `accentIcon`, `className`, `contentClassName`)

That separation avoids “layout drift” and keeps variants predictable.

---

## Core Component: `DemoStatCard`

### Responsibilities

`DemoStatCard` renders:

- A consistent `Card` container with:
  - modern border/shadow/rounded corners
  - `relative` positioning
  - typically `overflow-hidden` (for clipped watermarks/rails)
- The card header:
  - `title`
  - `description` (optional)
- **Optional decorative layers:**
  - rails (flush/inset)
  - accent watermark icon
- The content area:
  - `CardContent` with base padding `p-6`
  - **automatic padding offsets** (so content doesn’t collide with rails)
  - `contentClassName` (optional per-card layout tweaks)

### Why rails are outside `CardContent`

Rails are rendered as direct children of the `Card`, *not inside the padded content*, so they can:

- run **edge-to-edge** (flush mode) without gaps
- maintain correct alignment regardless of content padding
- avoid repeated “absolute overlay” code in every variant

---

## Rail System

### `RailConfig`

Rails are defined declaratively:

```ts
type RailConfig = {
  side: "left" | "right" | "top" | "bottom";
  mode?: "flush" | "inset";
  label?: string; // top/bottom only
  icon?: SvgIcon;
  className?: string; // theme background, e.g. theme.railBg
  thicknessClassName?: string; // "w-12" or "h-11"
  insetGapClassName?: string; // default "inset-2"
  roundedClassName?: string; // default "rounded-lg"
};
```

### Rail Modes

#### 1) `mode: "flush"` (default)
- Rails touch the card’s edges.
- Vertical rails: `absolute inset-y-0 left-0/right-0`
- Horizontal rails: `absolute inset-x-0 top-0/bottom-0`

**Use for:** strong dashboard framing, classic KPI tiles.

#### 2) `mode: "inset"`
- Rails “float” inside the card with a visible gap (controlled by `insetGapClassName`).
- Rails often get rounding (`roundedClassName`).

**Use for:** softer modern designs, cards in dense grids where edge-to-edge rails feel heavy.

### Automatic Content Offsets

When a rail is present, `DemoStatCard` adjusts the content padding:

- Left rail: adds left padding (`pl-*`)
- Right rail: adds right padding (`pr-*`)
- Top rail: adds top padding (`pt-*`)
- Bottom rail: adds bottom padding (`pb-*`)

Inset rails use slightly different offsets because they don’t sit exactly on the edge.

This is the core “rail-awareness” feature: variants do **not** need to manually add `contentClassName="pl-16"` anymore.

---

## Accent Icon (Watermark) System

### `AccentIconConfig`

Watermarks are defined declaratively:

```ts
type AccentIconConfig = {
  icon: SvgIcon;
  side?: "left" | "right";
  anchor?: "top" | "center" | "bottom";
  sizeClassName?: string;       // e.g. "h-28 w-28"
  opacityClassName?: string;    // e.g. "opacity-10"
  cutoff?: boolean;             // pushes icon past edge for clipping
  rotateDeg?: number;
  skewXDeg?: number;
  skewYDeg?: number;
  translateX?: number;
  translateY?: number;
  className?: string;           // theme accent, e.g. theme.accentTone
};
```

### How it renders

- The icon is placed with `absolute` positioning (behind content).
- `cutoff: true` moves it beyond the card boundary; `overflow-hidden` clips it.
- Rotation/skew/translate are applied via `style={{ transform: ... }}` to allow fine control.

### Why the icon type is `SvgIcon`

The icon receives a `style` prop for transforms, so the icon type must support standard SVG props:

```ts
type SvgIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;
```

This prevents TypeScript errors like:

> Property 'style' does not exist on type '{ className?: string }'

---

## Content: `KpiRow`

`KpiRow` is the default content block for KPI cards:

- left icon
- big metric value
- optional tone color

Key point: **make it theme-aware** by passing `toneClassName={theme.kpiTone}`.

---

## Variant Registry: `cards[]`

Variants are represented as objects:

```ts
const cards: Array<{
  title: string;
  description?: string;
  rail?: RailConfig;
  accentIcon?: AccentIconConfig;
  className?: string;
  contentClassName?: string;
  content?: React.ReactNode;
}> = [ ... ];
```

### Why `contentClassName` exists
Some variants intentionally change internal layout, e.g.:

- centered layouts (`text-center`)
- reserved space for ribbons (`pt-10`)
- overlapping medallions (`pt-8` + `overflow-visible`)

Rather than breaking the base layout, `contentClassName` provides controlled per-card tuning.

---

## Theming System

### Theme Goals

- Change color family globally (emerald/blue/orange/red/violet).
- Keep variants consistent without rewriting every card.
- Use **finite Tailwind classes** (so the build can statically include them).

### Theme Tokens

A theme is defined as a set of class strings:

```ts
type ThemeKey = "emerald" | "blue" | "orange" | "red" | "violet";

const THEMES: Record<ThemeKey, {
  name: string;
  railBg: string;        // used for rails, badges, ribbons, medallions
  kpiTone: string;       // used for KPI value/icon tone
  accentTone: string;    // used for watermark icon tone
  chipBg: string;        // used for chips & small badges
  chipText: string;      // used for chip icon/text
  outlineBorder: string; // used for C1 Outline inner border
}> = { ... };
```

### Dropdown Theme Switcher

The section owns theme state:

```tsx
const [themeKey, setThemeKey] = React.useState<ThemeKey>("emerald");
const theme = THEMES[themeKey];
```

A dropdown updates `themeKey`, which recomputes `theme`, and all cards re-render with new token classes.

### What gets themed

- Rails: `rail.className = theme.railBg`
- Accent icons: `accentIcon.className = theme.accentTone`
- KPI row: `toneClassName = theme.kpiTone`
- Chips/badges: `theme.chipBg`, `theme.chipText`
- Outline border: `theme.outlineBorder`

### Quick-fill variants are also theme-aware

Fallback variants must include:

- `accentIcon.className: theme.accentTone`
- `KpiRow toneClassName: theme.kpiTone`

This keeps *every* card consistent when the theme changes.

---

## Using These Cards in CriteriaIQ

Below are practical patterns for applying this system in the CriteriaIQ app.

### 1) Dashboards & Home Page Tiles
Use KPI cards to summarize:

- total assessments / active engagements
- completion rate
- risk score distribution
- high-priority findings
- SLA/aging (e.g., “Findings > 30 days”)

**Recommended design patterns**
- **Flush rails** for priority/alert tiles (clear severity framing)
- **Inset rails** for “informational” tiles (cleaner in dense layouts)
- **Watermark icons** for category semantics (Compliance / Identity / Data / Controls)

### 2) Scorecards / Criteria Groups
Use variants like:

- **B4 Centered Medallion** for a single “grade” or “score”
- **B3 Split Value/Icon** for “score + category icon”
- **C1 Outline** for emphasizing the scoring sub-container inside a larger card

### 3) List Views with Summary Rows
Use cards as “row headers” above tables:

- A compact set of 3–5 KPI cards to summarize the list below
- Use a consistent theme mapped to the page area (e.g., orange for “Risk”, blue for “Compliance”)

### 4) Detail Pages: Contextual Highlights
Use cards for:

- “Most recent change”
- “Top control failing”
- “Latest evidence upload”
- “Next review due”

Add accent icons with cutoff to reduce visual weight while maintaining identity.

### 5) Severity / Status Mapping
If CriteriaIQ has statuses (e.g., Low/Med/High/Critical), you can map:

- **Theme** to domain area (Compliance vs Risk vs Data)
- **Rail** to severity:
  - red-themed rail for critical
  - orange for medium
  - blue/emerald for normal/healthy

This yields “status at a glance” without extra UI elements.

---

## Extension Guidelines

### Adding a new variant
1. Add a new object to `cards[]`.
2. Prefer to use:
   - `rail` for structural stripes/bars
   - `accentIcon` for watermarks
   - `contentClassName` only when necessary
3. Use theme tokens rather than hard-coded colors:
   - `theme.railBg`
   - `theme.kpiTone`
   - `theme.accentTone`
   - `theme.chipBg`, `theme.chipText`
   - `theme.outlineBorder`

### Adding a new theme
1. Add a new key to `ThemeKey`.
2. Add a new entry to `THEMES`.
3. Ensure each token is represented (especially `outlineBorder`).

### Adding theme-colored gradients
If you want background washes to change hue with theme, add tokens like:
- `washFrom`
- `washTo`
- or `washBgClassName`

Then use them in card `className`. This keeps theming centralized and avoids per-card conditional logic.

---

## Troubleshooting

### TypeScript error: `style` not allowed on icon
Fix by typing icons as SVG-capable:

```ts
type SvgIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;
```

Then use `SvgIcon` for:
- `RailConfig.icon`
- `AccentIconConfig.icon`
- `KpiRow.Icon`

### Why a card isn’t changing color with theme
Look for hard-coded color classes inside:
- `content` JSX (e.g., `bg-emerald-600`, `text-emerald-600`)
- `className` strings on badges/ribbons
- chip classes (`bg-emerald-50`, `text-emerald-700`)
Replace those with theme tokens (`theme.railBg`, `theme.chipBg`, etc).

### Why rails have gaps / don’t reach edges
Ensure rails are rendered as direct `Card` children (outside `CardContent`) using absolute positioning.  
If rails are inside `CardContent`, padding will create “gaps.”

---

## Summary

This system creates a clean, scalable card framework:

- **Composable content** (children)
- **Declarative decoration** (rails + accent icon configs)
- **Centralized theming** (dropdown + token map)
- **Variant scalability** (cards list grows without complexity explosion)

It’s well-suited to CriteriaIQ because it supports:
- dense dashboards
- consistent scorecard visuals
- quick semantic signaling (rails + icons)
- brand/section theming (blue/orange/red, etc.)
