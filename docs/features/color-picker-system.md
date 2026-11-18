# ColorPicker Component System

> **Last Updated:** December 2024  
> **Version:** v1.1.0  
> **Location:** `client/src/components/ui/color-picker.tsx`

## Overview

The ColorPicker component provides a reusable, accessible color selection interface with preset color swatches, a custom color picker, hex input field, and favorites system. It supports dark mode, multiple sizes, and is built using the `react-colorful` library.

## Features

- **Preset Color Swatches**: 15 curated colors displayed in a 5-column grid
- **Custom Color Picker**: Full HexColorPicker for selecting any color
- **Hex Input Field**: Direct entry of hex color codes with validation
- **Favorites System**: Save up to 10 colors to localStorage for quick reuse
- **Live Preview**: Shows selected color in trigger button and popover
- **Dark Mode Support**: Fully styled for light and dark themes
- **Configurable**: Toggle presets/custom picker/favorites, provide custom preset colors
- **Size Variants**: Three sizes (sm, md, lg)
- **Popover Interface**: Non-intrusive popover that doesn't disrupt layout

---

## Installation

The component is already part of the UI component library. It requires `react-colorful`:

```bash
npm install react-colorful
```

---

## Basic Usage

```tsx
import { ColorPicker } from "@/components/ui/color-picker";

function MyComponent() {
  const [color, setColor] = useState("#3B82F6");

  return (
    <ColorPicker
      value={color}
      onChange={setColor}
      label="Widget Color"
    />
  );
}
```

---

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | Required | Current color value (hex format) |
| `onChange` | `(color: string) => void` | Required | Callback when color changes |
| `label` | `string` | `undefined` | Optional label above the picker |
| `presetColors` | `string[]` | `DEFAULT_PRESET_COLORS` | Custom preset color array |
| `showPresets` | `boolean` | `true` | Show/hide preset color swatches |
| `showCustomPicker` | `boolean` | `true` | Show/hide HexColorPicker and hex input |
| `showFavorites` | `boolean` | `true` | Show/hide favorites section |
| `className` | `string` | `undefined` | Additional classes for wrapper |
| `triggerClassName` | `string` | `undefined` | Additional classes for trigger button |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size of color swatches |

---

## Hex Input Field

The hex input field allows direct entry of color codes:

- Automatically adds `#` prefix if missing
- Validates hex format (3 or 6 character hex codes)
- Shows red border on invalid input
- Normalizes 3-character codes to 6-character (e.g., `#F00` → `#FF0000`)
- Reverts to previous valid value on blur if input is invalid

### Valid Formats

- `#FF5733` - Full 6-character hex
- `#F53` - Short 3-character hex (auto-expands)
- `FF5733` - Without hash (auto-adds `#`)

---

## Favorites System

The favorites system stores colors in browser localStorage for quick reuse:

### Features

- **Star Button**: Click the star icon next to the hex input to save/unsave the current color
- **Favorites Row**: Saved colors appear as a dedicated row at the top of the picker
- **Quick Remove**: Hover over a favorite to reveal the remove button (X)
- **Limit**: Up to 10 favorite colors can be saved
- **Persistence**: Favorites persist across browser sessions
- **Storage Key**: `criteriaiq-color-favorites`

### Usage

```tsx
<ColorPicker
  value={color}
  onChange={setColor}
  showFavorites={true}
  label="Pick a Color"
/>
```

### Disable Favorites

```tsx
<ColorPicker
  value={color}
  onChange={setColor}
  showFavorites={false}
/>
```

---

## Default Preset Colors

The component exports `DEFAULT_PRESET_COLORS` with 15 curated colors:

```tsx
import { DEFAULT_PRESET_COLORS } from "@/components/ui/color-picker";

// Colors included:
// Blue (#3B82F6), Red (#EF4444), Green (#10B981), Amber (#F59E0B)
// Purple (#8B5CF6), Pink (#EC4899), Cyan (#06B6D4), Lime (#84CC16)
// Orange (#F97316), Indigo (#6366F1), Teal (#14B8A6), Yellow (#FACC15)
// Gray (#9CA3AF), Dark Blue (#1E40AF), Black (#000000)
```

---

## Examples

### Basic with Label

```tsx
<ColorPicker
  value={iconColor}
  onChange={setIconColor}
  label="Icon Color"
/>
```

### Custom Preset Colors Only (No Custom Picker)

```tsx
const brandColors = ["#1E40AF", "#3B82F6", "#60A5FA", "#93C5FD"];

<ColorPicker
  value={color}
  onChange={setColor}
  presetColors={brandColors}
  showCustomPicker={false}
  label="Brand Colors"
/>
```

### Custom Picker Only (No Presets)

```tsx
<ColorPicker
  value={color}
  onChange={setColor}
  showPresets={false}
  label="Choose Any Color"
/>
```

### Without Favorites

```tsx
<ColorPicker
  value={color}
  onChange={setColor}
  showFavorites={false}
  label="No Favorites"
/>
```

### Small Size Variant

```tsx
<ColorPicker
  value={color}
  onChange={setColor}
  size="sm"
  label="Compact Picker"
/>
```

### In Form Context

```tsx
<form onSubmit={handleSubmit}>
  <div className="space-y-4">
    <Input placeholder="Widget Name" {...register("name")} />
    
    <ColorPicker
      value={watch("iconColor")}
      onChange={(color) => setValue("iconColor", color)}
      label="Icon Color"
    />
    
    <Button type="submit">Save Widget</Button>
  </div>
</form>
```

### Dashboard Builder Integration

The ColorPicker is used in the Admin Dashboard Builder for widget customization:

```tsx
<ColorPicker
  value={selectedWidget?.iconColor || "#3B82F6"}
  onChange={(color) => {
    if (selectedWidget) {
      updateWidget(selectedWidget.id, { iconColor: color });
    }
  }}
  label="Icon Color"
/>
```

---

## Styling

### Size Classes

| Size | Trigger Swatch | Preset Swatch |
|------|----------------|---------------|
| `sm` | 20x20px (w-5 h-5) | 20x20px |
| `md` | 24x24px (w-6 h-6) | 24x24px |
| `lg` | 32x32px (w-8 h-8) | 32x32px |

### Dark Mode

The component automatically adapts to dark mode using Tailwind's `dark:` variants:
- Popover: `dark:bg-slate-900 dark:border-slate-700`
- Labels: `dark:text-slate-300`
- Borders: `dark:border-slate-600`
- Input: Uses standard Input component styling

---

## Accessibility

- Trigger button is keyboard-accessible
- Preset swatches show color hex value on hover (title attribute)
- Selected preset has visible ring indicator
- Color picker supports mouse/touch interaction
- Hex input supports keyboard entry
- Star/remove buttons have title attributes for screen readers

---

## localStorage API

The favorites are stored using these internal functions:

```tsx
const FAVORITES_STORAGE_KEY = 'criteriaiq-color-favorites';

function loadFavorites(): string[] {
  // Loads and validates favorites from localStorage
}

function saveFavorites(favorites: string[]): void {
  // Saves favorites array to localStorage as JSON
}
```

### Manually Managing Favorites

```javascript
// Clear all favorites
localStorage.removeItem('criteriaiq-color-favorites');

// Read favorites
const favorites = JSON.parse(localStorage.getItem('criteriaiq-color-favorites') || '[]');

// Set favorites manually
localStorage.setItem('criteriaiq-color-favorites', JSON.stringify(['#FF0000', '#00FF00']));
```

---

## Helper Function: resolveIconColor

When working with legacy Tailwind color classes, use this helper to convert them to hex:

```tsx
export function resolveIconColor(color: string): string {
  if (color.startsWith('#') || color.startsWith('rgb')) {
    return color;
  }
  
  const tailwindToHex: Record<string, string> = {
    'text-blue-600': '#2563eb',
    'text-purple-600': '#9333ea',
    'text-green-600': '#16a34a',
    'text-red-600': '#dc2626',
    // ... more mappings
  };
  
  return tailwindToHex[color] || '#3B82F6';
}
```

---

## File Structure

```
client/src/components/ui/
├── color-picker.tsx          # Main component
├── input.tsx                 # Dependency (hex input)
├── button.tsx                # Dependency (star button)
└── popover.tsx               # Dependency (Radix UI popover)
```

---

## Dependencies

- `react-colorful` - Lightweight color picker library
- `@radix-ui/react-popover` - Popover primitive
- `lucide-react` - Star and X icons
- Tailwind CSS - Styling

---

## Related Components

- **LucideIconPicker** - Icon selection with color support
- **Admin Dashboard Builder** - Uses ColorPicker for widget customization
- **Popover** - Base UI primitive used for the picker popover
- **Input** - Used for hex input field

---

## Changelog

### v1.1.0 (December 2024)
- Added hex input field with validation
- Added localStorage favorites system (up to 10 colors)
- Added `showFavorites` prop
- Star button to save/unsave current color
- Favorites row with remove buttons on hover
- 3-character hex code normalization

### v1.0.0 (December 2024)
- Initial release with preset colors and HexColorPicker
- Support for sm/md/lg sizes
- Dark mode support
- Configurable presets and custom picker visibility
