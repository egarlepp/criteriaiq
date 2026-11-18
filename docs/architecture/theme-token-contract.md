# Theme token contract: CriteriaIQ, ImpactIQ and VectorIQ

The three apps let an admin choose a theme on their own Theming page, and all
three offer the same twelve starting presets. This page lists the fields they
share, the fields only some of them have, and the rules that keep them lined
up, so a theme picked in one app looks the same in the others.

There is no shared theme service. Each app stores its own themes and an admin
picks one in each. The contract is the field set and the preset values.

Code: CriteriaIQ `shared/theme-colors.ts`; ImpactIQ
`src/server/routes/admin/themes.ts` (`themeColorsSchema`) and
`src/client/components/admin/theme-presets.ts`; VectorIQ
`client/src/lib/theme-colors.ts`.

## How a field is named

Every color is a light and dark pair: `<field>Light` and `<field>Dark`, each a
`#RRGGBB` hex string. CriteriaIQ and VectorIQ store them that way. ImpactIQ
mostly does too, but its header and sidebar gradients are named the other way
round, with the mode in the middle (`headerLightFrom`, `sidebarBgDarkTo`).

## Shared fields

These mean the same thing in all three apps. A preset sets the same values
for each of them in every app.

| Field | What it colors | CriteriaIQ | VectorIQ | ImpactIQ |
|---|---|---|---|---|
| Primary | Buttons, switches, focus rings, active controls | `primary` | `primary` | `primary` |
| Header gradient start | Left end of the top bar | `topbarGradientFrom` | `topbarGradientFrom` | `headerLightFrom` / `headerDarkFrom` |
| Header gradient end | Right end of the top bar | `topbarGradientTo` | `topbarGradientTo` | `headerLightTo` / `headerDarkTo` |
| Sidebar top | Top of the sidebar gradient | `sidebarBgTop` | `sidebarBgTop` | `sidebarBgLightFrom` / `sidebarBgDarkFrom` |
| Sidebar bottom | Bottom of the sidebar gradient | `sidebarBgBottom` | `sidebarBgBottom` | `sidebarBgLightTo` / `sidebarBgDarkTo` |
| Sidebar text | Menu labels | `sidebarText` | `sidebarText` | `sidebarText` |
| Nav hover | Menu item hover background | `navHoverBg` | `navHoverBg` | `navHoverBg` |
| Sidebar highlight | Active menu item background | `sidebarHighlight` | `sidebarHighlight` | `sidebarHighlight` |
| Sidebar active text | Active menu item text | `sidebarActiveText` | `sidebarActiveText` | `sidebarActiveText` |
| Sidebar border | Sidebar edge and dividers | `sidebarBorder` | `sidebarBorder` | `sidebarBorder` |
| User pill name | Signed-in person's name in the sidebar footer | `userPillName` | `userPillName` | `userPillName` |
| User pill subtitle | Their role or email under it | `userPillSubtitle` | `userPillSubtitle` | `userPillSubtitle` |

## Fields only some apps have

| Field | Who has it | When an app doesn't |
|---|---|---|
| Header text (`topbarText`, ImpactIQ `headerText`) | CriteriaIQ, ImpactIQ | VectorIQ uses its normal text tokens on a header that stays light in light mode and dark in dark mode. CriteriaIQ's preset copy picks whichever ink reads best on both header stops |
| Sidebar heading (`sidebarHeading`) | CriteriaIQ | Taken from VectorIQ's app-name color |
| Admin menu (`adminMenuBg`, `…Heading`, `…Text`, `…HoverBg`, `…Highlight`, `…ActiveText`, `…Border`) | CriteriaIQ | Taken from the sidebar's bottom color, text, hover, highlight and border. Only CriteriaIQ has a separate Admin menu panel |
| App name (`appName`) | VectorIQ, ImpactIQ | CriteriaIQ shows a logo mark instead of a wordmark |
| Page header icon (`pageHeaderIcon`) | VectorIQ, ImpactIQ | CriteriaIQ's page titles use the normal text tokens |
| Sidebar pill (`sidebarPillBg`) | VectorIQ, ImpactIQ | No pill in CriteriaIQ's sidebar footer |
| Muted sidebar text, page background, surface, border, link (`sidebarTextMuted`, `pageBg`, `surface`, `border`, `link`) | ImpactIQ | The other two theme only the chrome. Page content keeps the shadcn tokens (Eric, 2026-10-16) |

## Presets

All three ship these twelve, with the same key, name and colors for every
shared field (VectorIQ's set is the source):

`midnight_slate`, `warm_neutral`, `forest_green`, `ocean_blue`, `purple`,
`darker_purple`, `sunset_coral`, `dark_blue`, `dark_purple`, `dark_green`,
`gray`, `dark`.

On top of those, CriteriaIQ adds `criteriaiq_classic` (its own blue header,
the default) and ImpactIQ adds `dark_yellow`, `teal` and `crimson`. An app's
own extra presets don't have to exist in the others.

## Rules

1. **A shared field means the same thing everywhere.** Don't reuse one of the
   names above for something else, and don't add a second field for something
   a shared field already covers.
2. **A new shared preset lands in all three apps,** with the same key and the
   same values for every shared field, starting in VectorIQ. Changing a shared
   preset's values works the same way.
3. **A field only one app needs stays local.** Give it a default derived from
   the shared fields (the way CriteriaIQ derives its Admin menu colors), so
   applying a shared preset still gives a finished theme.
4. **Text must stay readable.** Header text, sidebar text, active text and the
   user pill name clear WCAG AA (4.5:1) against every background they sit on,
   in both modes. CriteriaIQ's editor warns (without blocking the save) when
   an admin's own theme falls short (`CONTRAST_CHECKS` / `findContrastIssues`);
   a shipped preset that falls short is a bug.
5. **Each mode gets its own gradient.** Light mode runs light to light and dark
   mode dark to dark. Never use one light-to-dark gradient for both modes,
   which leaves text unreadable at one end.
6. **Logos aren't theme colors.** Each app keeps its own logo upload and its
   own light/dark variant setting, and they aren't part of this contract.

## When ImpactIQ's names move

ImpactIQ's header and sidebar gradient names are the one place the apps
differ in spelling, not meaning. If ImpactIQ renames them to the
`topbarGradientFrom` / `sidebarBgTop` form, update the table above and keep
its old names readable when it imports an exported theme file.
