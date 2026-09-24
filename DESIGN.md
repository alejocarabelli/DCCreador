# DESIGN.md — Modelador de Sistemas 2.0

The design system of the 2.0 redesign ("Cuaderno técnico"). It replaces the v1
document; `REDISENO-V2.md` records what changed and why.

## What this is

A desktop modelling tool for the *Diseño de Sistemas* course: projects hold use
case models, flows of events, sequence diagrams, class diagrams and "clases de
secuencias". It ships as a macOS app (WKWebView) and works offline.

The product's output is paper: diagrams and specifications handed in as PDF or
Word. The interface is built around that — **the document is the brightest,
sharpest thing on screen, and the chrome is quieter paper around it.**

## Visual world: Cuaderno técnico

Ink on paper with one petrol accent.

- **Canvas** is off-white paper (`#F8F7F3`) with a faint dot grid. Classes are
  white cards with a 1px ink border and a small offset shadow, like a printed
  box on a sheet — the same look the PDF export produces.
- **Chrome** (sidebar, toolbar, inspector) is a slightly warmer paper, so the
  canvas always reads as the lightest plane.
- **Petrol** (`#1C6570`) is the only accent: primary actions, selection, focus,
  the current item. It never tints the document itself.
- **Dark mode is "Pizarra"**: light ink on warm graphite, the same accent lifted
  to `#63B7BC`. Not an inverted grey.

## Type

IBM Plex, bundled with the app (`@fontsource/ibm-plex-sans`, `…-mono`), so it
renders the same on every Mac and in every export.

| Token | Size | Use |
|---|---|---|
| `--text-2xs` | 10.5px | counters, key caps, eyebrow labels (mono, uppercase) |
| `--text-xs` | 11.5px | meta, save state, hints |
| `--text-sm` | 12.5px | field labels, secondary lines |
| `--text-md` | 13px | **default**: every control, menu item and body text |
| `--text-lg` | 15px | dialog and empty-state titles |
| `--text-xl` | 19px | section titles (flow) |
| `--text-2xl` | 26px | page title (home) |

- **Plex Sans** for the interface. Weights 400, 500 (controls), 600 (titles).
- **Plex Mono** for anything that is code: attributes and methods in class
  boxes, message signatures, key caps, eyebrow labels.
- Controls never inherit the page size: `button`, `input`, `select`,
  `textarea` and `summary` are set to `--text-md` at element level.

## Colour

All colours are tokens produced by `useTheme()` from `src/theme/themes.ts` and
set as CSS variables on `.app-shell`. Stylesheets never hard-code a colour
(`src/theme/themes.test.ts` fails if a stylesheet reads a variable the themes
do not define, and checks text contrast in both themes).

| Role | Tokens |
|---|---|
| Planes | `--ui-app-background` < `--ui-sidebar-background` < `--panel-background` (chrome) · `--canvas-background` (document) |
| Surfaces on a panel | `--panel-subtle-background`, `--panel-muted-background`, `--panel-strong-background` |
| Lines | `--panel-border`, `--panel-border-strong`, `--button-border`, `--input-border` |
| Text | `--panel-text` > `--panel-secondary-text` > `--panel-muted-text` > `--panel-faint-text` > `--panel-placeholder-text` |
| Accent | `--accent` (text, icons), `--button-active-background` (fills), `--accent-strong-fill` (pressed), `--accent-soft(-strong)` (tints), `--accent-outline`, `--accent-border` |
| State | `--ui-hover-background`, `--ui-selected-background`, `--ui-selected-text` |
| Status | `--status-{danger,warning,success,info,violet}-{soft,soft-strong,border,border-strong,text}` |
| Document | `--class-*`, `--association-*`, `--note-*`, and `theme.sequence.*` for the SVG sequence canvas |

Exports always use the light theme (`EXPORT_THEME`), whatever the screen shows.

## Space, shape, elevation, motion

- **Space**: 4px grid — `--space-1…8` = 4, 8, 12, 16, 20, 24, 32px.
- **Radii**: sharp like paper. `--radius-xs` 3px (chips, class boxes),
  `--radius-sm` 5px (controls, fields), `--radius-md` 7px (menus, floating
  panels), `--radius-lg` 10px (dialogs, cards), `--radius-pill`.
- **Controls**: `--control-sm` 26px (canvas zoom), `--control-md` 30px (toolbar,
  fields, menu items), `--control-lg` 34px (dialog and card buttons). Every
  target is ≥24×24px.
- **Elevation**: ink-tinted shadows only on things that float —
  `--shadow-1` (zoom control), `--shadow-popover` (menus, cards),
  `--shadow-dialog`. Panels are separated by lines, not shadows.
- **Motion**: `--duration-fast` 120ms (hover, press), `--duration` 180ms (menus,
  toasts), `--duration-slow` 260ms (dialogs, empty-state cards), all on
  `--ease-out`. Menus pop in, cards rise in, nothing bounces. Transitions list
  their properties; never `transition: all`.

## Components

Shared React components live in `src/components/ui/`; their styles in
`src/design/system.css`. **The same control looks and behaves the same in every
editor.**

### Editor toolbar — `EditorToolbar`

One bar, three zones, identical order in all five editors:

1. **Start** — breadcrumb (`Proyecto › icono Artefacto`), save state (a check
   that expands to "Guardado" on hover; "Guardando…" and errors stay expanded),
   Deshacer, Rehacer.
2. **Create** — the editor's own tools. The most common creation is the one
   filled primary button (`ToolButton variant="primary"`): *Clase*, *Mensaje*,
   *Caso de uso*. Secondary creations are icon buttons or one menu.
3. **End** — `ReviewButton` (where the editor can check its work) · `Vista ▾`
   (everything that changes how the document is shown) · `Exportar ▾` (only
   the formats of this artifact).

Project-level actions (export/import the whole project as JSON) are not in the
editor toolbar: they live in the project menu and on the home screen.

### Tool buttons — `ToolButton`

30px high, transparent until hovered, 5px radius, 16px Lucide icon. Icon-only
buttons carry the label as `aria-label` and tooltip (with the shortcut when
there is one). `pressed` shows the accent tint; `variant="primary"` is the one
filled button per toolbar.

### Menus — `ToolMenu`, `MenuItem`, `MenuLabel`, `MenuSeparator`, `MenuField`

A native `<details>` (keyboard and VoiceOver for free) with a popover panel:
only one menu open in the window, closes on outside click, Escape (focus back
to the trigger) and after choosing an item. Items are 30px rows with a 16px
icon column; toggles use `role="menuitemcheckbox"` and a check mark; sections
use mono uppercase labels. Canvas context menus and the sidebar's floating
menus share the same panel and item styles.

### Inspector — `InspectorPanel`, `InspectorDeleteButton`, `PanelSection`

Every editor's right-hand panel. A fixed 56px header — fold · kind · name ·
delete — over a scrolling body; folded it is a 44px rail with only the fold
button. The kind is a mono uppercase label with a tone dot (accent for the
main element, status tones for message kinds, violet fragments, amber notes).
Field labels inside are sentence case (`--text-sm`, secondary text); section
titles are `--text-md` 600. Collapsible sections are native `<details>` with a
thin chevron, closed by default. Native selects keep the system menu but draw
a thin chevron in the muted text colour.

### Canvas zoom — `CanvasZoom`

The only zoom control: bottom-left of every canvas, `− 100% + | ⤢`. The
percentage appears where the editor knows it and resets to 100% on click.

### Empty states

One card centred on the empty canvas: a title that says what to start with, one
sentence, and the actions to do it. Rises in over 260ms.

### Dialogs, toasts

Dialogs are paper cards (`--radius-lg`, `--shadow-dialog`) over a blurred ink
scrim; primary action on the right. Toasts are ink pills at the bottom.

## Layout contracts

1. **Toolbars never overflow.** The start zone shrinks (breadcrumb ellipsis)
   before the create and end zones do; labels in the create zone collapse to
   icons at narrow widths. Every collapsible label has an `aria-label` and a
   tooltip on its control, so collapsing costs no accessible name.
2. **The canvas is never a residual column.** Side panels collapse before the
   canvas drops under 480px.

## Accessibility contract

- Every control has a programmatic label; one `h1` per view (the artifact
  name); panel titles are `h2`.
- Focus is always visible: a 2px accent ring with a 2px paper gap
  (`--focus-ring`), including on React Flow nodes.
- Targets ≥24×24 CSS px (WCAG 2.2 SC 2.5.8).
- Body text meets 4.5:1 in both themes; `themes.test.ts` checks the key pairs.
- No `window.confirm/alert/prompt`: destructive actions go through
  `useDialogs().confirm()`; the dialog portals into `.app-shell`, focus lands on
  *Cancelar*.
- Reduced motion removes travel, not feedback: pop-in and rise-in animations
  are dropped, colour and opacity transitions stay. Never a blanket kill.
- All UI copy is Spanish, including third-party controls.

## Performance contract

- Editors are route-split via `React.lazy`; `jspdf`, `svg2pdf` and
  `html-to-image` load only when an export runs.
- `SequenceDiagramCanvas` is memoised; pointer drags measure once at
  pointerdown and coalesce to one `requestAnimationFrame`.
- `src/utils/sequenceDiagramPerformance.test.tsx` guards layout cost at 120
  messages / 20 participants.

## Deliberately absent

- **More themes.** One language in two appearances (Cuaderno, Pizarra).
- **Mobile.** A desktop tool; narrow windows (down to ~900px, the macOS
  minimum) must work, phones are a courtesy.
