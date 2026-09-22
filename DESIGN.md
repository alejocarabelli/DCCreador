# DESIGN.md — Modelador de Sistemas

Derived from the shipped implementation, not from intentions. Every value here
was read out of `src/theme/themes.ts`, `src/styles.css` and `src/refined.css`
or measured in the running app.

## What this is

A desktop UML modelling tool for coursework: class diagrams, use-case models,
event flows and sequence diagrams, grouped into projects that live in one
technical file. Spanish (rioplatense) throughout. It ships as a macOS app that
opens at **1380×860**, which is the size every layout decision answers to.

**Mode: Operate.** The visitor is building a diagram, not being persuaded by
one. Scanability, stable density and native expectations outrank expression.
The brand lives in the precision of the details, and the diagram — never the
chrome — is the loudest thing on screen.

## Visual world

A technical notebook. Cool paper greys under white working surfaces, one petrol
blue reserved for interaction, and UML ink kept charcoal so the diagram reads as
drawing rather than as UI. Nothing glows, nothing gradients, nothing floats
without cause.

## Type

The interface renders in the platform UI face — SF Pro on macOS, Segoe on
Windows — via `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", Roboto, sans-serif`. There is no webfont, and the stack names what
actually paints rather than a face the app does not ship.

| Role | Size | Weight |
|---|---|---|
| Artifact title (`h1`) | 0.8rem | 700 |
| Panel heading (`h2`) | 0.73rem, uppercase tracking | 650–700 |
| Body / control | 0.76–0.82rem | 400–500 |
| Secondary, muted | 0.72–0.75rem | 400 |
| Floor | **0.69rem / 11px** | — |

**11px is the floor.** Nothing in the UI is smaller. Diagram text is separate
and comes from `theme.typography` (class names 14px, attributes 13px,
multiplicities 12px).

## Colour

One source of truth: `academicLightTheme` in `src/theme/themes.ts`, projected to
CSS custom properties by `useTheme()`. Do not reintroduce a second palette in a
stylesheet; that is what the `!important` override block used to be.

| Token | Value | Contrast on its surface |
|---|---|---|
| `--panel-text` | `#1F2933` | 14.76:1 |
| `--panel-muted-text` | `#52606D` | 6.46:1 |
| `--panel-background` | `#FFFFFF` | — |
| `--panel-border` | `#DCE2E8` | — |
| `--button-background` | `#F3F5F7` | text 12.12:1 |
| `--button-active-background` | `#315F8C` | white text 6.67:1 |
| `--input-border` | `#CFD7DF` | — |
| `--accent` | `#2F648F` | white text 6.85:1 |
| `--panel-subtle-background` | `#F8FAFB` | muted text 6.28:1 |
| `--panel-muted-background` | `#F1F4F7` | muted text 5.99:1 |
| `--panel-strong-background` | `#E3E8ED` | muted text 5.32:1 |

Three named fills sit on the panel, lightest first. They replaced a single
`--panel-muted-background` that was being written with three different inline
fallbacks (`#f8fafc`, `#f1f5f9`, `#e2e8f0`) — one name, three values, which is
drift by definition. Pick the level by how far the surface should separate from
the panel, never by eye.

Chrome-only tokens with no diagram equivalent live on `.app-shell` as
`--ui-*`: app background `#f1f4f6`, sidebar `#f7f8fa`, hover `#edf2f6`,
selected `#e6eef6` / `#244f78`, danger `#b63d42`.

Seven project accent tones (`--project-tone-a`…`g`) identify projects at a
glance; all clear 4.99:1 on white. Every pair in this table meets WCAG AA — keep
it that way when adding one.

The sequence editor scopes its own accent (`--button-active-background:
#2f648f`) on `.sequence-editor-shell`. That is a deliberate per-surface
variation, not drift.

**Everything sits in one hue band, 196°–220° (cool blue-grey).** The sequence
canvas used to sit at 45° — yellow, the opposite side of the wheel — because a
whole warm palette was hardcoded in `SequenceDiagramCanvas.tsx` behind
`usesTechnicalNotebook`, a flag that was always true once the other themes were
deleted. Those sixteen values now live in `academicLightTheme.sequence` and the
flag is gone. When adding a colour, check its hue before its beauty: one
surface in the wrong band is what makes an app feel assembled.

Two warm things survive on purpose. The nine participant families vary hue so
participants are told apart at a glance, and three of them are warm. Note
colours are chosen per note, and Ámbar is the default because a UML sticky note
is yellow. Neither is drift; both are choices.

**No fallback values in `var()`.** `var(--panel-text, #0f172a)` is a second
palette hiding in the stylesheet: it never fires while the theme is applied, and
when it does fire it ships a colour nobody chose. Every token in this document is
set on `.app-shell` by `useTheme()`, so `var(--panel-text)` is enough. The two
exceptions are genuinely runtime values with no theme entry —
`--sequence-inspector-width` (the person drags it) and `--project-tone` (set per
row) — where the fallback *is* the default.

## Space

A 4-unit base. `4 / 6 / 8 / 10 / 12 / 18px` carry the rhythm; 2–3px appear only
inside control clusters. Radii step `4 / 5 / 6 / 7 / 8px`, with `999px` for
pills. Shadows carry offset and blur (`0 4px 12px rgba(15, 23, 42, 0.08)`);
there are no zero-offset halos.

Shell: a 272px project rail (54px collapsed) beside `minmax(0, 1fr)`.

## Layout contracts

Two rules exist because breaking them shipped visible bugs:

1. **Toolbars wrap; they never overflow.** `justify-content: flex-end` on a
   `nowrap` flex row pushes surplus content out the *start* edge — that is how
   the sequence toolbar once painted over the breadcrumb and into the project
   rail. Every `.editor-toolbar-actions` is `flex-wrap: wrap`.
2. **Labels collapse before the row does.** Text inside a toolbar control is
   wrapped in `<span class="toolbar-label">` and hidden by breakpoint, in
   priority order: save state (≤1460) → secondary groups (≤1520) → keyboard mode
   (≤1380) → UML literals (≤1280) → everything (≤1100). **Every control carrying
   a `toolbar-label` must also carry an `aria-label` and a `title`**, so
   collapsing costs no accessible name.

## Accessibility contract

- Every form control has a programmatic label. Verified: zero unlabeled inputs.
- One `h1` per view (the artifact name). Panel titles are `h2`. The brand
  wordmark is a `<p class="sidebar-brand-name">`, not a heading — it is chrome.
- Focus is always visible, including on React Flow nodes, which zero their own
  outline (`.react-flow__node:focus-visible .class-node`).
- Targets are ≥24×24 CSS px (WCAG 2.2 SC 2.5.8).
- Modals use native `<dialog>.showModal()` for a free focus trap and Escape;
  the custom surfaces use `useFocusTrap`, which also restores the opener.
- **No `window.confirm` / `window.alert` / `window.prompt`.** They render OS
  chrome the design does not control, cannot be themed, cannot be translated,
  and in the WKWebView shell look like a system failure rather than a question
  the app is asking. Destructive actions go through `useDialogs().confirm()` and
  failures through `.notify()` (`src/components/ConfirmDialog.tsx`). The dialog
  portals into `.app-shell` so it inherits the tokens, and focus lands on
  *Cancelar* — the safe choice — because the trap takes the first focusable
  child and the cancel button is first in DOM order.
- Reduced motion removes travel, not feedback: animations off, transitions
  restricted to colour/opacity/shadow at 120ms. Never a blanket `1ms` kill.
- All UI copy is Spanish, including third-party controls — React Flow's canvas
  buttons are re-rendered by `CanvasControls` for exactly this reason.

## Performance contract

- Editors are route-split via `React.lazy`. `jspdf`, `svg2pdf` and
  `html-to-image` load only when an export runs.
- `SequenceDiagramCanvas` is memoised; the editor above it holds 33 pieces of
  state that must not reach the diagram.
- Pointer drags measure the SVG box **once** at pointerdown and coalesce work to
  one `requestAnimationFrame`. Never call `getBoundingClientRect()` per
  `pointermove`.
- Transitions enumerate their properties. No `transition: all`.
- `src/utils/sequenceDiagramPerformance.test.tsx` guards layout cost at 120
  messages / 20 participants. Keep it passing.

## Things that are deliberately absent

- **Theme switching.** One visual language ships. `DiagramThemeId` is a
  single-member union; adding a theme means adding it to `themes.ts` and
  restoring the setter in `useTheme`, not adding a stylesheet.
- **Dark mode.** No `prefers-color-scheme` handling exists.
- **A webfont.** See Type.
- **Mobile.** Breakpoints run to 700px so nothing breaks, but this is a desktop
  tool and the phone layout is a courtesy, not a target.
