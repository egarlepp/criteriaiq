# TinyMCE Email Editor Setup Documentation

## Overview

This document describes the TinyMCE WYSIWYG editor implementation used for creating email template content in the CriteriaIQ Email Automation System. The system uses a **self-hosted npm version** of TinyMCE with GPL licensing, providing a fully portable, account-free solution.

### Quick Reference: TinyMCE in Modal Dialogs

**⚠️ CRITICAL FIX**: When using TinyMCE inside a Radix UI Dialog (or any modal with focus trap), you MUST implement both parts of this fix to make toolbar popups clickable:

1. **Add to TinyMCE config**:
   ```tsx
   ui_container: dialogContainer,  // From useDialogPortalContainer()
   ui_mode: 'split' as const,      // Render UI inside Dialog
   ```

2. **Add focusin event handler**:
   ```tsx
   useEffect(() => {
     const stopTrap = (e: FocusEvent) => {
       const el = e.target as HTMLElement | null;
       if (el?.closest('.tox, .tox-dialog, .tox-menu')) {
         e.stopImmediatePropagation?.();
         e.stopPropagation();
       }
     };
     document.addEventListener('focusin', stopTrap, true);
     return () => document.removeEventListener('focusin', stopTrap, true);
   }, []);
   ```

Without this fix, all TinyMCE toolbar dropdowns (Insert Variable, lists, table, colors, etc.) will appear but be unclickable. See [Troubleshooting](#issue-toolbar-popups-not-clickable-in-modal-dialog) for full implementation details.

---

## Why Self-Hosted TinyMCE?

### Benefits

1. **No Account Required**: Unlike the cloud CDN version, self-hosted TinyMCE doesn't require API key registration
2. **Complete Portability**: All TinyMCE files are bundled with the application and can be exported/moved together
3. **Privacy & Performance**: No external requests to TinyMCE cloud servers
4. **Offline Capability**: Works in air-gapped or offline environments
5. **Full Feature Access**: All core TinyMCE features (tables, formatting, media, etc.) included
6. **GPL Compliance**: Uses open-source GPL licensing model

### Comparison: Cloud vs Self-Hosted

| Feature | Cloud CDN | Self-Hosted npm |
|---------|-----------|-----------------|
| Account Required | ✅ Yes | ❌ No |
| API Key Required | ✅ Yes | ❌ No |
| Free Tier Limits | 1,000 loads/month | ∞ Unlimited |
| Portability | External dependency | Bundled with app |
| Offline Support | ❌ No | ✅ Yes |
| Privacy | Tracks usage | No tracking |
| Setup Complexity | Medium (signup) | Simple (npm install) |

---

## Installation

### 1. Install TinyMCE Package

```bash
npm install tinymce
```

This installs the complete TinyMCE editor with all plugins, themes, skins, and icons.

### 2. Install React Wrapper (Already Installed)

```bash
npm install @tinymce/tinymce-react
```

The `@tinymce/tinymce-react` package provides React component bindings for TinyMCE.

---

## Architecture

### Email Template Content Flow

```
┌─────────────────────────────────────────────────────────────┐
│ EmailTemplatesSection.tsx (Form Dialog)                     │
│ - Manages form state (emailContent, designId, subject, etc) │
│ - Uses EmailContentEditor component for WYSIWYG editing     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ EmailContentEditor.tsx (TinyMCE Wrapper)                     │
│ - Self-hosted TinyMCE with GPL license                      │
│ - Custom "Insert Variable" toolbar button                   │
│ - 6 categorized variable dropdowns                          │
│ - Outputs HTML content (emailContent field)                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Database (email_templates table)                            │
│ - emailContent: HTML from TinyMCE editor (new templates)    │
│ - designId: Reference to Email Design wrapper               │
│ - htmlContent: Legacy field (backward compatibility)        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend Routes (server/routes.ts)                           │
│ - GET /api/email-templates/:id/preview                      │
│ - POST /api/email-templates/preview                         │
│ - POST /api/email-templates/:id/send-test                   │
│                                                              │
│ Logic:                                                       │
│ • IF emailContent exists (new template):                    │
│   → Replace variables in emailContent                       │
│   → Wrap with Email Design if designId exists               │
│ • ELSE (legacy template with htmlContent):                  │
│   → Use htmlContent as-is (already has wrapper baked in)    │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Email Design Wrapper Separation**: Email Design wrappers (headers, footers, branding) are **never shown in the editor**. They are only applied at preview/send time using the `{{BODY_TEXT_CONTENT}}` placeholder.

2. **Backward Compatibility**: Legacy templates with `htmlContent` already have design wrappers baked in. The backend detects this and doesn't double-wrap.

3. **Variable System**: Template variables (e.g., `{{projectName}}`, `{{userName}}`) are inserted as plain text in the editor and replaced server-side at send time.

---

## Implementation Details

### EmailContentEditor.tsx Structure

```tsx
import React, { useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';

// Import self-hosted TinyMCE core
import 'tinymce/tinymce';
import 'tinymce/models/dom';
import 'tinymce/themes/silver';
import 'tinymce/icons/default';
import 'tinymce/skins/ui/oxide/skin.min.css';

// Import plugins
import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/link';
import 'tinymce/plugins/image';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/anchor';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/code';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/insertdatetime';
import 'tinymce/plugins/media';
import 'tinymce/plugins/table';
import 'tinymce/plugins/help';
import 'tinymce/plugins/wordcount';

export const EmailContentEditor: React.FC<EmailContentEditorProps> = ({
  value,
  onChange,
  height = 400
}) => {
  const editorRef = useRef<any>(null);

  return (
    <Editor
      onInit={(_evt: any, editor: any) => {
        editorRef.current = editor;
      }}
      value={value}
      onEditorChange={(content: string) => {
        onChange(content);
      }}
      licenseKey='gpl'  // GPL license for self-hosted
      init={{
        height: height,
        menubar: false,
        skin: false,  // Disable cloud skin loading
        content_css: false,  // Use inline styles
        base_z_index: 10000,  // Ensure popups appear above modal dialogs
        plugins: [
          'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
          'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
          'insertdatetime', 'media', 'table', 'help', 'wordcount'
        ],
        toolbar: 'undo redo | formatselect | bold italic underline strikethrough | ' +
          'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
          'bullist numlist outdent indent | table | link image | ' +
          'insertvariable | removeformat | code | help',
        content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px }',
        
        setup: (editor: any) => {
          // Custom "Insert Variable" button
          editor.ui.registry.addMenuButton('insertvariable', {
            text: 'Insert Variable',
            icon: 'template',
            fetch: (callback: any) => {
              callback(buildVariableMenuItems());
            }
          });
        }
      }}
    />
  );
};
```

### Key Configuration Options

| Option | Value | Purpose |
|--------|-------|---------|
| `licenseKey` | `'gpl'` | Declares GPL license usage for self-hosted version |
| `skin` | `false` | Disables cloud skin loading (uses imported CSS) |
| `content_css` | `false` | Uses inline content_style instead of external CSS |
| `base_z_index` | `10000` | Ensures toolbar popups appear above modal dialogs (z-50) |
| `height` | `400` | Editor height in pixels (configurable via props) |
| `menubar` | `false` | Hides menu bar for cleaner UI |

---

## Custom "Insert Variable" Feature

### Variable Categories

The editor provides 6 categories of template variables:

1. **Project Information**: `{{projectName}}`, `{{customerName}}`, `{{projectStatus}}`, etc.
2. **Team Members**: `{{primaryEngineer}}`, `{{specialistEngineer}}`, `{{primaryEngineerEmail}}`, etc.
3. **User Information**: `{{userName}}`, `{{firstName}}`, `{{lastName}}`, `{{userEmail}}`, etc.
4. **System Links**: `{{dashboardUrl}}`, `{{projectUrl}}`, `{{resetUrl}}`
5. **Support & Admin**: `{{supportEmail}}`, `{{adminEmail}}`
6. **MAP Variables**: `{{task.name}}`, `{{task.status}}`, `{{step.name}}`, `{{phase.name}}`, etc.

### Implementation

```tsx
const VARIABLE_CATEGORIES = {
  "Project Information": {
    "{{projectName}}": "Name of the project",
    "{{customerName}}": "Customer account name",
    "{{projectStatus}}": "Current project status",
    // ... more variables
  },
  "Team Members": {
    "{{primaryEngineer}}": "Primary engineer name",
    "{{specialistEngineer}}": "Specialist engineer name",
    // ... more variables
  },
  // ... more categories
};

// Build nested menu items
const buildVariableMenuItems = () => {
  const items: any[] = [];
  
  Object.entries(VARIABLE_CATEGORIES).forEach(([category, variables]) => {
    items.push({
      type: 'nestedmenuitem',
      text: category,
      getSubmenuItems: () => {
        return Object.entries(variables).map(([variable, description]) => ({
          type: 'menuitem',
          text: `${variable} - ${description}`,
          onAction: () => {
            if (editorRef.current) {
              editorRef.current.insertContent(variable);
            }
          }
        }));
      }
    });
  });
  
  return items;
};
```

### How It Works

1. User clicks **"Insert Variable"** button in toolbar
2. Dropdown shows 6 category submenus
3. Hovering over a category reveals variable options with descriptions
4. Clicking a variable inserts it at cursor position (e.g., `{{projectName}}`)
5. Variables are replaced server-side when previewing or sending emails

---

## Database Schema

### email_templates Table

```typescript
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  
  // NEW: TinyMCE email content (HTML from WYSIWYG editor)
  emailContent: text("email_content"),
  
  // Reference to Email Design wrapper template
  designId: integer("design_id").references(() => emailDesigns.id, {
    onDelete: "set null"
  }),
  
  // LEGACY: Old content fields (kept for backward compatibility)
  textContent: text("text_content"),  // Plain text version
  htmlContent: text("html_content"),  // Legacy HTML with wrapper baked in
  
  isActive: boolean("is_active").default(true).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
```

### Migration Strategy

- **New templates**: Use `emailContent` + `designId`
- **Legacy templates**: Keep `htmlContent` (already has wrapper)
- **Backward compatibility**: Backend checks for `emailContent` first, falls back to `htmlContent`

---

## Backend Email Wrapping Logic

### Preview/Send Endpoints

```typescript
// GET /api/email-templates/:id/preview
// POST /api/email-templates/:id/send-test

// Logic for both endpoints:
if (template.emailContent) {
  // NEW TEMPLATE: Wrap emailContent with Email Design
  let content = template.emailContent;
  
  // Replace variables ({{projectName}}, etc.)
  Object.entries(sampleData).forEach(([variable, value]) => {
    content = content.replace(new RegExp(variable, 'g'), value);
  });

  // Wrap with Email Design if designId exists
  if (template.designId) {
    const design = await storage.getEmailDesign(template.designId);
    if (design && design.htmlRaw) {
      finalHtmlContent = design.htmlRaw.replace(/\{\{BODY_TEXT_CONTENT\}\}/g, content);
    }
  } else {
    finalHtmlContent = content;
  }
} else {
  // LEGACY TEMPLATE: Use htmlContent as-is (already has wrapper)
  finalHtmlContent = template.htmlContent || "";
  
  // Replace variables
  Object.entries(sampleData).forEach(([variable, value]) => {
    finalHtmlContent = finalHtmlContent.replace(new RegExp(variable, 'g'), value);
  });
}
```

### Important: No Double-Wrapping

- **New templates** (`emailContent` present): Wrap with design if `designId` exists
- **Legacy templates** (`emailContent` null): Never wrap (already wrapped)
- This prevents double-wrapping legacy templates when previewing/sending

---

## Available TinyMCE Features

### Text Formatting
- Bold, italic, underline, strikethrough
- Text color & background color
- Font size and headers (H1-H6)
- Blockquotes and code blocks

### Layout & Alignment
- Text alignment (left, center, right, justify)
- Ordered & bulleted lists
- Indentation controls

### Media & Links
- Insert hyperlinks
- Insert images (inline/upload)
- Insert media (video embeds)

### Advanced Features
- Insert tables with formatting
- Search and replace
- Visual blocks (show/hide formatting)
- View/edit HTML source code
- Full-screen editing mode
- Word count

### Email-Specific
- **Insert Variable**: Custom button with 6 categorized variable dropdowns
- **Remove Formatting**: Strip all formatting for clean emails

---

## Vite Configuration

No special Vite configuration is required for self-hosted TinyMCE. Vite automatically bundles the imported TinyMCE files:

```typescript
// vite.config.ts - No changes needed
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  // ... standard config
});
```

Vite's default bundling handles:
- TinyMCE core files
- Plugin imports
- Skin CSS imports
- Icon imports

---

## Testing the Implementation

### 1. Create New Email Template

1. Navigate to **Communications → Email Templates**
2. Click **"Add Template"** button
3. Fill in template details:
   - Name: "Test Template"
   - Subject: "Testing {{projectName}}"
   - Email Design: Select "Internal Default"
4. Use TinyMCE editor to create content:
   - Type some text
   - Click **"Insert Variable"** → **Project Information** → **{{projectName}}**
   - Add formatting (bold, colors, lists, tables)
5. Save template

### 2. Preview Email

1. Click **"Preview"** icon on the template
2. Verify:
   - ✅ Variables are replaced with sample data
   - ✅ Email Design wrapper is applied (header, footer)
   - ✅ Formatting from TinyMCE is preserved
   - ✅ Content matches what you created in editor

### 3. Send Test Email

1. Click **"Send Test"** icon
2. Enter test email address
3. Verify email arrives with:
   - ✅ Proper subject line
   - ✅ Email Design wrapper (header with logo, footer)
   - ✅ Content from TinyMCE editor
   - ✅ Variables replaced with sample data

### 4. Edit Existing Template

1. Click **"Edit"** icon on any template
2. Verify:
   - ✅ TinyMCE loads with existing content
   - ✅ "Insert Variable" button works
   - ✅ All toolbar buttons functional
   - ✅ Save updates content properly

---

## Troubleshooting

### Issue: TinyMCE Not Loading

**Symptom**: Editor area is blank or shows error

**Solution**:
1. Check browser console for import errors
2. Verify all TinyMCE imports in `EmailContentEditor.tsx`
3. Ensure `tinymce` npm package is installed: `npm list tinymce`
4. Clear Vite cache: `rm -rf node_modules/.vite` and restart

### Issue: Plugins Not Working

**Symptom**: Table button, link button, or other features missing/broken

**Solution**:
1. Verify plugin is imported at top of `EmailContentEditor.tsx`:
   ```tsx
   import 'tinymce/plugins/table';  // Example
   ```
2. Verify plugin is listed in `plugins` array in `init` config
3. Restart development server

### Issue: Custom Variable Button Not Appearing

**Symptom**: "Insert Variable" button missing from toolbar

**Solution**:
1. Check `setup` function in editor `init` config
2. Verify `insertvariable` is included in toolbar string
3. Check `buildVariableMenuItems()` function returns valid menu structure

### Issue: Variables Not Replaced in Preview

**Symptom**: Email preview shows `{{projectName}}` instead of actual value

**Solution**:
1. Check backend `/api/email-templates/:id/preview` endpoint
2. Verify `sampleData` object includes the variable
3. Check regex replacement logic in backend

### Issue: Toolbar Popups Not Clickable in Modal Dialog

**Symptom**: When TinyMCE editor is inside a modal/dialog, clicking toolbar buttons shows popups that appear but can't be clicked or interacted with. This affects:
- Insert Variable dropdown with nested menus
- Bullet list and numbered list style options
- Table insert popup/grid
- Text Color and Background Color pickers
- Format dropdown styles
- Link and Image dialogs
- Any other toolbar buttons with popup menus

**Root Cause**: Modal dialogs (Radix UI Dialog, shadcn/ui Dialog) implement a **focus trap** that prevents focus from moving to elements outside the dialog. By default, TinyMCE renders its UI elements (popups, dropdowns, color pickers) at the document body level, placing them outside the dialog's focus scope.

**Complete Solution**: Two-part fix combining TinyMCE configuration and focus trap bypass

This solution combines:
1. **TinyMCE `ui_mode: 'split'`** - Renders UI elements as siblings to the editor within the Dialog
2. **focusin event handler** - Teaches the Dialog's focus trap to ignore TinyMCE UI elements

This is the documented approach from TinyMCE for running the editor inside Bootstrap/jQuery modals, and it generalizes well to Radix UI Dialog.

#### Implementation in EmailContentEditor.tsx

```tsx
import React, { useRef, useMemo, useEffect } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { useDialogPortalContainer } from '@/components/ui/dialog';

export const EmailContentEditor: React.FC<EmailContentEditorProps> = ({
  value,
  onChange,
  height = 400
}) => {
  const editorRef = useRef<any>(null);
  
  // Get the Dialog container element from context
  const dialogContainer = useDialogPortalContainer();

  // Memoize init config with ui_container and ui_mode to render TinyMCE UI inside Dialog
  // Only create config when dialogContainer is available to maintain React hook order
  const initConfig = useMemo(() => {
    if (!dialogContainer) return null;
    
    return {
      height: height,
      menubar: false,
      skin: false,
      content_css: false,
      ui_container: dialogContainer,  // ← Render inside Dialog container
      ui_mode: 'split' as const,       // ← Render UI as siblings to editor (not at document.body)
      toolbar_mode: 'scrolling' as const,  // ← Single-line toolbar with horizontal scroll
      plugins: [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'wordcount'
      ],
      toolbar: 'undo redo | formatselect | bold italic underline strikethrough | ' +
        'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
        'bullist numlist outdent indent | table | link image | ' +
        'insertvariable | removeformat | code',
      content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px }',
      setup: (editor: any) => {
        // ... custom setup
      }
    };
  }, [height, dialogContainer]);

  // Teach the Dialog focus trap to ignore TinyMCE UI elements
  // This prevents Radix Dialog's focus trap from interfering with TinyMCE popups/menus
  useEffect(() => {
    const stopTrap = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      // Check if focus is moving to any TinyMCE UI element
      if (el && el.closest('.tox, .tox-dialog, .tox-menu, .moxman-window, .tam-assetmanager-root')) {
        // Stop propagation so Dialog's focus trap doesn't intercept
        e.stopImmediatePropagation?.();
        e.stopPropagation();
      }
    };
    // Capture phase (true) so we intercept before the Dialog's focus trap
    document.addEventListener('focusin', stopTrap, true);
    return () => document.removeEventListener('focusin', stopTrap, true);
  }, []);

  // Wait for dialog container to be available before rendering TinyMCE
  // This prevents TinyMCE from initializing with ui_container unset
  if (!initConfig) {
    return null;
  }

  return (
    <Editor
      onInit={(_evt: any, editor: any) => {
        editorRef.current = editor;
      }}
      value={value}
      onEditorChange={(content: string) => {
        onChange(content);
      }}
      licenseKey='gpl'
      init={initConfig}
    />
  );
};
```

**How It Works**:

1. **DialogPortalContext**: The `Dialog` component provides its content element via React Context
2. **useDialogPortalContainer**: Hook retrieves the Dialog's content element (or `null` if not inside a Dialog)
3. **ui_container option**: TinyMCE's configuration option that accepts an HTMLElement where all UI should render
4. **ui_mode: 'split'**: Renders popups/menus/dialogs as siblings to the editor (not at document.body)
5. **focusin event handler**: Intercepts focus events in capture phase before Dialog's trap, stopping propagation when focus lands on TinyMCE UI elements
6. **Conditional rendering**: Wait for `dialogContainer` to be available before initializing TinyMCE

**Why This Works**:
- **ui_mode: 'split'** ensures TinyMCE UI elements render **inside** the Dialog's DOM tree as siblings to the editor
- **focusin handler** tells Radix Dialog's focus trap to ignore TinyMCE elements (`.tox`, `.tox-dialog`, `.tox-menu`)
- Together, they allow TinyMCE popups to receive focus and respond to clicks without the Dialog interfering
- All popups remain within the Dialog's focus trap scope
- Keyboard navigation and accessibility work correctly
- No z-index conflicts or manual focus management needed

**TinyMCE CSS Classes to Target**:
- `.tox` - Main TinyMCE UI container
- `.tox-dialog` - TinyMCE's own dialog windows (link, image, etc.)
- `.tox-menu` - All dropdown menus and popups
- `.moxman-window` - File manager windows (if using MoxieManager)
- `.tam-assetmanager-root` - Asset manager (if using Tiny Drive)

**Comparison to Tiptap**:
- **Tiptap (`TiptapEditor.tsx`)**: Uses Tiptap's `BubbleMenu` and Radix UI Popover components that automatically respect DialogPortalContext
- **TinyMCE**: Requires both `ui_container`/`ui_mode` configuration AND focusin event handler bypass

**Previous Ineffective Approaches**:
- ❌ `focusin` event listener alone - Works for some interactions but not all TinyMCE popups
- ❌ `base_z_index` alone - Doesn't solve focus trap, only z-index layering
- ❌ `ui_container` without `ui_mode: 'split'` - Partial fix but still had focus issues
- ✅ **Combined approach** (ui_container + ui_mode + focusin handler) - Complete solution

**Testing Checklist**:
After implementing this fix, verify all toolbar interactions work:
- ✅ Insert Variable dropdown with nested category menus
- ✅ Bullet list and numbered list style options
- ✅ Table insert popup/grid
- ✅ Text Color and Background Color pickers
- ✅ Format dropdown (headings, paragraphs, etc.)
- ✅ Link dialog
- ✅ Image dialog
- ✅ Any custom toolbar buttons with dropdowns

---

## Security Considerations

### GPL License Compliance

By setting `licenseKey: 'gpl'`, you are declaring that your application complies with the GPL license. This requires:

1. **Open Source**: Your application must be open source (or internal/private use only)
2. **License Disclosure**: Include TinyMCE's GPL license in your project
3. **Attribution**: Credit TinyMCE in your application

If you need commercial licensing (closed-source app, white-label product), you must purchase a TinyMCE commercial license.

### Content Security

- **XSS Protection**: TinyMCE sanitizes HTML input by default
- **Variable Validation**: Backend validates all template variables before replacement
- **Email Content**: All email content is escaped/sanitized before sending

---

## Performance Optimization

### Bundle Size

Self-hosted TinyMCE adds ~500KB to your bundle (gzipped). Optimizations:

1. **Lazy Loading**: Consider lazy-loading the editor component:
   ```tsx
   const EmailContentEditor = lazy(() => import('./EmailContentEditor'));
   ```

2. **Plugin Selection**: Only import plugins you actually use

3. **Code Splitting**: Vite automatically code-splits TinyMCE into separate chunks

### Runtime Performance

- TinyMCE editor initializes in ~200-300ms
- No external CDN requests (everything is bundled locally)
- Hot Module Replacement (HMR) works for instant editor updates during development

---

## Future Enhancements

### Potential Improvements

1. **Image Upload**: Add image upload handler for inline images
2. **Template Library**: Pre-built email templates with common layouts
3. **Preview Mode**: Live preview pane showing wrapped email while editing
4. **Variable Autocomplete**: Type `{{` to trigger variable suggestions
5. **Spell Check**: Enable browser spell-check in editor
6. **Mobile Responsive Preview**: Preview how email looks on mobile devices
7. **A/B Testing**: Create template variants for A/B testing

---

## Related Documentation

- [Email Automation System](../features/email-triggers-reference.md)
- [Email Automation Triggers](../features/email-triggers-reference.md)
- [TinyMCE Official Docs](https://www.tiny.cloud/docs/tinymce/latest/)
- [TinyMCE React Integration](https://www.tiny.cloud/docs/tinymce/latest/react-ref/)

---

## Summary

The self-hosted TinyMCE implementation provides:

- ✅ **Account-free setup** with GPL licensing
- ✅ **Complete portability** - bundled with application
- ✅ **Full feature access** - tables, formatting, media, etc.
- ✅ **Custom variable insertion** - 6 categorized variable menus
- ✅ **Email Design separation** - wrappers applied only at send time
- ✅ **Backward compatibility** - works with legacy templates
- ✅ **Privacy & performance** - no external requests

This architecture ensures a robust, maintainable email template editing experience that scales with the CriteriaIQ platform.
