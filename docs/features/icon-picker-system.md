# Icon Picker System Documentation

## Overview

The Icon Picker System is a reusable React component system that provides searchable icon selection functionality using Lucide icons. It includes two main components: a picker interface for selecting icons and a dynamic renderer for displaying them. The system has been integrated across multiple features including Project Forms and MAP Templates.

**Version:** 1.0  
**Last Updated:** September 30, 2025  
**Components:** `LucideIconPicker`, `DynamicIcon`

---

## Table of Contents

1. [Architecture](#architecture)
2. [Components](#components)
3. [Usage Examples](#usage-examples)
4. [Modal & Drawer Integration Issues](#modal--drawer-integration-issues)
5. [Implementation Across Features](#implementation-across-features)
6. [Database Integration](#database-integration)
7. [Future Enhancements](#future-enhancements)

---

## Architecture

The Icon Picker System consists of two complementary components:

### 1. **LucideIconPicker Component**
- **Location:** `client/src/components/ui/lucide-icon-picker.tsx`
- **Purpose:** Provides an interactive searchable interface for selecting icons
- **Features:**
  - Real-time search filtering across 1,400+ Lucide icons
  - Visual icon grid with hover states
  - Portal-based rendering for nested modal contexts
  - Context-aware container targeting

### 2. **DynamicIcon Component**
- **Location:** `client/src/components/ui/dynamic-icon.tsx`
- **Purpose:** Renders icons dynamically from string names
- **Features:**
  - Runtime icon resolution from Lucide React library
  - Fallback icon support for missing icons
  - Type-safe props inheritance
  - Memoized for performance

---

## Components

### LucideIconPicker

A searchable popover component for selecting Lucide icons.

#### Props

```typescript
interface LucideIconPickerProps {
  value: string;                    // Current selected icon name
  onValueChange: (value: string) => void;  // Callback when icon is selected
  containerSelector?: string;       // CSS selector for portal container (optional)
}
```

#### Key Features

- **Search Functionality:** Real-time filtering by icon name
- **Visual Selection:** Grid layout with icon previews
- **Accessibility:** Keyboard navigation support
- **Portal Rendering:** Renders in appropriate container based on context

#### Example Usage

```tsx
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";

function MyForm() {
  const [icon, setIcon] = useState("Star");
  
  return (
    <LucideIconPicker
      value={icon}
      onValueChange={setIcon}
    />
  );
}
```

### DynamicIcon

A component that renders Lucide icons dynamically from string names.

#### Props

```typescript
interface DynamicIconProps extends LucideProps {
  name: string;           // Icon name (e.g., "Star", "Users")
  fallback?: string;      // Fallback icon name if primary not found
}
```

#### Key Features

- **Dynamic Resolution:** Loads icons at runtime by name
- **Fallback Support:** Displays alternative icon if primary not found
- **Type Safety:** Inherits all Lucide icon props
- **Performance:** Memoized to prevent unnecessary re-renders

#### Example Usage

```tsx
import { DynamicIcon } from "@/components/ui/dynamic-icon";

function MyComponent({ iconName }) {
  return (
    <DynamicIcon 
      name={iconName} 
      fallback="HelpCircle"
      className="h-5 w-5 text-blue-600" 
    />
  );
}
```

---

## Usage Examples

### Basic Implementation

```tsx
import { useState } from "react";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";

function IconSelector() {
  const [selectedIcon, setSelectedIcon] = useState("Star");
  
  return (
    <div>
      <label>Select Icon</label>
      <LucideIconPicker
        value={selectedIcon}
        onValueChange={setSelectedIcon}
      />
      
      <div className="preview">
        <DynamicIcon name={selectedIcon} className="h-8 w-8" />
        <span>{selectedIcon}</span>
      </div>
    </div>
  );
}
```

### Form Integration with React Hook Form

```tsx
import { useForm } from "react-hook-form";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";

function MyForm() {
  const form = useForm({
    defaultValues: {
      name: "",
      icon: "FileText"
    }
  });
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register("name")} />
      
      <LucideIconPicker
        value={form.watch("icon")}
        onValueChange={(value) => form.setValue("icon", value)}
      />
      
      <button type="submit">Save</button>
    </form>
  );
}
```

### Database-Driven Icon Display

```tsx
import { DynamicIcon } from "@/components/ui/dynamic-icon";

function TemplateCard({ template }) {
  return (
    <div className="card">
      <DynamicIcon 
        name={template.icon || 'FileText'} 
        className="h-5 w-5 text-blue-600"
        fallback="FileText"
      />
      <h3>{template.name}</h3>
    </div>
  );
}
```

---

## Modal & Drawer Integration Issues

### The Problem: Nested Radix UI Components

When implementing the Icon Picker inside Radix UI Sheet (sliding drawer) components, we encountered focus management conflicts. Specifically:

**Issue:** Opening a `Popover` inside a `Sheet` caused focus to be trapped in the Sheet, preventing proper interaction with the Popover content.

**Root Cause:** Radix UI components use portal rendering and focus management. When nested, multiple focus traps compete, causing the inner Popover to be inaccessible.

**Symptoms:**
- Popover appears but cannot be interacted with
- Clicking inside Popover closes it immediately
- Search input in Popover doesn't receive focus
- Icon grid items are not clickable

### The Solution: SheetPortalContext

We implemented a React Context pattern to manage portal containers for nested Radix UI components.

#### Implementation

**1. Create Portal Context**

```tsx
// In your Sheet-based component (e.g., MapTemplateSheet.tsx)
import { createContext } from "react";

export const SheetPortalContext = createContext<HTMLElement | null>(null);
```

**2. Provide Portal Container**

```tsx
function MySheet() {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent ref={setPortalContainer}>
        <SheetPortalContext.Provider value={portalContainer}>
          {/* Your form content with LucideIconPicker */}
          <LucideIconPicker
            value={icon}
            onValueChange={setIcon}
            containerSelector=".sheet-portal-target"
          />
        </SheetPortalContext.Provider>
      </SheetContent>
    </Sheet>
  );
}
```

**3. Configure Icon Picker**

```tsx
// Inside the Sheet content
<div className="sheet-portal-target">
  <LucideIconPicker
    value={form.watch("icon")}
    onValueChange={(value) => form.setValue("icon", value)}
    containerSelector=".sheet-portal-target"
  />
</div>
```

#### How It Works

1. **Portal Container Creation:** A ref is attached to the SheetContent, capturing the DOM element
2. **Context Provider:** The container element is passed down via React Context
3. **Target Selector:** LucideIconPicker uses `containerSelector` to render its Popover inside the Sheet
4. **Focus Management:** By rendering within the Sheet's focus scope, the Popover becomes interactive

### Best Practices

✅ **Do:**
- Use SheetPortalContext pattern for any Sheet containing LucideIconPicker
- Add a `containerSelector` prop when using inside modals/drawers
- Test focus management and interaction after implementation

❌ **Don't:**
- Nest Radix UI Popovers inside Sheets without portal configuration
- Assume default Popover behavior works in all contexts
- Skip testing keyboard navigation and focus states

---

## Implementation Across Features

The Icon Picker System has been successfully integrated across multiple features:

### 1. MAP Templates

**Location:** `client/src/components/map/MapTemplateSheet.tsx`

**Implementation:**
- Icon picker with SheetPortalContext pattern
- Icon stored in `icon` field (varchar(100))
- Display in library table, detail view, and selector dialog
- Fallback: `Waypoints` icon

**Key Code:**
```tsx
// In MapTemplateSheet.tsx
const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

<SheetContent ref={setPortalContainer} className="sheet-content">
  <SheetPortalContext.Provider value={portalContainer}>
    <div className="sheet-portal-target">
      <LucideIconPicker
        value={form.watch("icon") || "Waypoints"}
        onValueChange={(value) => form.setValue("icon", value)}
        containerSelector=".sheet-portal-target"
      />
    </div>
  </SheetPortalContext.Provider>
</SheetContent>
```

**Display Locations:**
- MAP Library table NAME column
- MAP Template detail view header
- MAP Template selector dialog (list and detail)

### 2. Project Forms

**Location:** `client/src/components/project-form.tsx`

**Status:** Ready for integration (components available)

**Potential Implementation:**
```tsx
<LucideIconPicker
  value={form.watch("icon") || "Folder"}
  onValueChange={(value) => form.setValue("icon", value)}
/>
```

### 3. Solutions

**Locations:** `client/src/components/validation-criteria/SolutionIconField.tsx` (the Icon field on the Add/Edit Solution dialog and the Guided Criteria Builder's solution step) and `client/src/components/ui/solution-graphic.tsx` (`SolutionGraphic`).

A solution has two pictures, both optional:

- **Graphic** (`products.solution_icon`): an uploaded image from Appearance › Media › Solution Icons, served from `/api/files/system/solution-icons/<file>`.
- **Icon** (`products.solution_icon_name`, migration 132): a lucide icon name. The API stores only a plain icon name (`/^[A-Z][A-Za-z0-9]{0,63}$/`); anything else clears it.

A graphic always replaces the icon. Every place that shows a solution's picture renders `<SolutionGraphic graphic icon name className fallback />`: the graphic when there is one, otherwise the icon, otherwise nothing (or a package icon with `fallback`). Picking **No graphic** on the form clears a graphic, so the icon shows again. Demo Mode solutions have icons and no graphics.

---

## Database Integration

### Schema Updates

Icon fields are stored as `varchar(100)` to accommodate Lucide icon names.

#### MAP Templates Table

```typescript
export const mapTemplates = pgTable('map_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name').notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 100 }),  // Icon field
  // ... other fields
});
```

### Migration Process

1. **Update Schema:** Add `icon` field to table definition in `shared/schema.ts`
2. **Push to Database:** Run `npm run db:push` to apply schema changes
3. **Update Types:** TypeScript types auto-generate from schema
4. **Update API:** Ensure routes handle icon field in create/update operations

### Data Persistence

**Create Operation:**
```typescript
const newTemplate = await db.insert(mapTemplates).values({
  name: data.name,
  icon: data.icon || 'ChartNetwork',
  // ... other fields
}).returning();
```

**Update Operation:**
```typescript
await db.update(mapTemplates)
  .set({
    name: data.name,
    icon: data.icon,
    updatedAt: new Date()
  })
  .where(eq(mapTemplates.id, id));
```

**Fetch with Icon:**
```typescript
const templates = await db.select().from(mapTemplates);
// Each template includes its icon field
```

---

## Future Enhancements

### Planned Improvements

#### 1. **Custom Icon Categories**
- Group icons by category (Actions, Objects, UI, etc.)
- Tabbed interface for easier navigation
- Recently used icons section

#### 2. **Icon Color Customization**
- Allow users to select icon colors
- Store color preference with icon name
- Predefined color palette

#### 3. **Icon Size Presets**
- Small (16px), Medium (20px), Large (24px) presets
- Consistent sizing across application
- Responsive icon sizing

#### 4. **Favorites System**
- Allow users to favorite frequently used icons
- Persist favorites per user
- Quick access to favorite icons

#### 5. **Icon Upload Support**
- Allow custom SVG icon uploads
- Store in object storage
- Fallback to Lucide for missing custom icons

#### 6. **Accessibility Improvements**
- Enhanced keyboard navigation
- Screen reader announcements
- High contrast mode support

### Breaking Changes to Consider

When implementing future enhancements, be aware of:

1. **Database Schema:** Adding color/size fields requires migration
2. **API Updates:** New fields need backend route updates
3. **Component Props:** Extended props may break existing implementations
4. **Context Pattern:** Additional contexts may be needed for complex features

### Migration Path

For major updates to the Icon Picker System:

1. **Version Components:** Create v2 components alongside v1
2. **Gradual Migration:** Update one feature at a time
3. **Deprecation Warnings:** Add console warnings to old implementations
4. **Documentation Updates:** Update this guide with migration instructions

---

## Troubleshooting

### Common Issues

**Issue: Icons not displaying**
- **Solution:** Verify icon name matches Lucide icon exactly (case-sensitive)
- **Check:** Ensure DynamicIcon is imported from correct path
- **Fallback:** Always provide a fallback icon

**Issue: Popover not interactive in Sheet**
- **Solution:** Implement SheetPortalContext pattern
- **Check:** Verify `containerSelector` prop is set correctly
- **Verify:** Ensure portal target element exists in DOM

**Issue: Search not working**
- **Solution:** Check that search input has proper focus management
- **Verify:** Popover is rendered in correct portal container
- **Test:** Try clicking directly in search field

**Issue: Icons showing as boxes**
- **Solution:** Icon name doesn't exist in Lucide library
- **Check:** Console for "Icon not found" warnings
- **Fix:** Use fallback icon or correct icon name

### Debug Checklist

1. ✅ Verify icon name is valid Lucide icon
2. ✅ Check database field stores icon correctly
3. ✅ Ensure DynamicIcon component is imported
4. ✅ Confirm containerSelector matches DOM element
5. ✅ Test in different contexts (Sheet, Dialog, standalone)
6. ✅ Verify fallback icons are specified
7. ✅ Check browser console for errors

---

## API Reference

### LucideIconPicker

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | Required | Currently selected icon name |
| `onValueChange` | `(value: string) => void` | Required | Callback when icon selection changes |
| `containerSelector` | `string` | `undefined` | CSS selector for portal container |

### DynamicIcon

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | Required | Icon name from Lucide library |
| `fallback` | `string` | `undefined` | Fallback icon if primary not found |
| `...props` | `LucideProps` | - | All standard Lucide icon props (className, size, etc.) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Sept 30, 2025 | Initial release with MAP Templates integration |
| 0.9 | Sept 29, 2025 | SheetPortalContext pattern implementation |
| 0.5 | Sept 28, 2025 | Basic LucideIconPicker and DynamicIcon components |

---

## Support & Contributions

For questions, issues, or enhancement requests related to the Icon Picker System:

1. Check this documentation first
2. Review existing implementations in the codebase
3. Test in isolation before reporting bugs
4. Document any workarounds discovered

When contributing improvements:

- Follow existing code patterns
- Update this documentation
- Test across all integrated features
- Consider backward compatibility

---

**Last Updated:** September 30, 2025  
**Maintained By:** CriteriaIQ Development Team
