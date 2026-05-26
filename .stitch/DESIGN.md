# Design System: NeuroTECH BCI Dashboard
**Project:** NeuroTECH-BCI Frontend (Vite + React + Tailwind + shadcn/ui)

---

## 1. Visual Theme & Atmosphere

The NeuroTECH BCI interface is **scientific-dark and data-forward**: a dense, information-rich cockpit for real-time brain-computer interface monitoring. The aesthetic is **precision-clinical meets futuristic terminal** — surfaces are near-lightless, with a singular electric accent color reserved for live signals, active states, and key interactions. The mood is **focused, low-fatigue, and high-trust**: darkness eliminates distraction while a single glow anchors the user's attention.

The UI carries three distinct visual registers that must stay coherent:

1. **Authentication shell** — Theatrical and immersive. A full-bleed deep-black canvas with two slowly-rotating primary-colored blob glows (60–70% blur radius), a faint 40×40px primary-color grid overlay at 3% opacity, and a center-screen frosted card (`backdrop-blur-2xl`, `bg-black/80`, `rounded-[2rem]`, `border border-white/10`). Motion powered by **Framer Motion** — elements stagger in at 0.1s intervals, sliding up 15px from opacity 0.

2. **Dashboard app shell** — Utilitarian and information-dense. A frosted-glass fixed header (`backdrop-filter: blur(6px)`, `background: color-mix(in srgb, var(--bg) 30%, transparent)`, `border-bottom: 1px solid color-mix(in srgb, var(--border) 15%, transparent)`) floats over the content. The navigation is a rounded pill container (`backdrop-blur-sm bg-surface/50 border border-white/5 rounded-full p-1`) housing the animated PillNav. A matching frosted footer completes the chrome sandwich.

3. **Data panels and charts** — Clinical and compact. Card surfaces sit at the first elevation level, panel backgrounds at the second. No decorative glows here — data density rules. Tables use monospace fonts, minimal padding, and `border-collapse`. Charts fill their containers edge-to-edge on an OffscreenCanvas worker.

Motion is intentional throughout: 120ms button presses, 150ms nav hover fills, 300ms sidebar slides, 3s radiating square-wave rings on the login logo, and GSAP `power2.easeOut` liquid-fill arcs on navigation pills.

The app supports **10 active named color themes** all governed by a single CSS variable contract, making the design language fully portable across palettes.

---

## 2. Color Palette & Roles

### Default Theme (`.root`) — The Primary Design Reference

| Descriptive Name | Hex | Role |
|---|---|---|
| **Void Black** | `#111111` | Page background (`--bg`); the ground floor of all elevation |
| **Charcoal Surface** | `#1b1b1b` | Card and section backgrounds (`--surface`); first elevation level |
| **Smoke Panel** | `#2a2a2a` | Panel containers, graph backgrounds (`--panel-bg`, `--graph-bg`); second elevation level |
| **Hairline Border** | `#2a2a2a` | Separator lines between all panels and cards (`--border`) |
| **Arctic Cyan** | `#61dafb` | The singular attention-commanding accent — primary actions, titles, signal traces, active states, header text, selection borders (`--primary`, `--accent`, `--title`, `--header-text`, `--graph-line-1`) |
| **Abyssal Contrast** | `#0a0a0a` | Text placed directly on Arctic Cyan fills (`--primary-contrast`) |
| **Near-White Text** | `#f5f5f5` | Body copy, headings, foreground text (`--text`) |
| **Silver Mute** | `#bdbdbd` | Secondary labels, muted annotations, graph axis text (`--muted`, `--graph-text`, `--label`) |
| **Charcoal Tertiary** | `#888888` | Subtle tertiary labels (`--text-tertiary`) |
| **Signal Green** | `#10b981` | Connected hardware state, success alerts, correct prediction cells |
| **Alert Red** | `#ef4444` | Error states, disconnected hardware, incorrect prediction cells |
| **Amber Warning** | `#f59e0b` | Connecting / transitional hardware state |
| **Deep Shadow** | `rgba(0,0,0,0.35)` | Card box-shadow (`--shadow`) |

### Active Named Theme Palette (10 themes available via UI)

| Theme ID | Display Name | Primary | Accent | BG |
|---|---|---|---|---|
| `theme-yellow-dark` | Golden Eclipse | `#F2B01E` | `#E3A500` | `#2C2B28` |
| `theme-yellow` | Golden Ember | `#F2B01E` | `#E3A500` | `#FFF7B0` |
| `theme-vibrant` | Vibrant Warm | `#EF3D59` | `#E17A47` | `#344E5C` |
| `theme-blush` | Blush Tide | `#F18C8E` | `#56BEA6` | `#305F72` |
| `theme-olive` | Verdant Olive | `#E3DE61` | `#97B067` | `#2F5249` |
| `theme-rose` | Crimson Rose | `#F7374F` | `#88304E` | `#2C2C2C` |
| `theme-ember` | Amber Ember | `#F29F58` | `#AB4459` | `#1B1833` |
| `theme-violet` | Royal Violet | `#910A67` | `#720455` | `#030637` |
| `theme-ocean` | Deep Ocean | `#23A6F2` | `#1F6FEB` | `#071A2C` |
| `theme-slate` | Midnight Slate | `#7AA2F7` | `#A6ADC8` | `#0B0D12` |

### Semantic Color Contract (Cross-Theme, Invariant)
All themes share identical semantic roles — only the hex values change:
- `--primary` → Primary interactive accent; used for all active/selected states
- `--accent` → Secondary accent; gradient ends, secondary graph lines, merge-mode highlights
- `--graph-line-1` → Primary EEG/signal trace (always `--primary`)
- `--graph-line-2` → Secondary signal trace (always `--accent`)
- `--event-bg` → Annotation event regions at 20% opacity of `--primary`
- `--selection-bg` → Selected time-range overlay at 30% opacity of `--accent`
- `--header-bg` / `--header-text` → Fixed chrome, always brand-dark + primary-accent text
- `--section-bg` / `--section-border` → Data panels (left pane of split layouts)
- `--panel-bg` / `--panel-border` → Sidebar / session list panels (right pane of split layouts)
- `--text-highlight` → Accent-colored table headers, active badges

**Signal palette used inside charts (per-channel color cycling):**
`#3b82f6` → `#10b981` → `#f59e0b` → `#ef4444` → `#8b5cf6` → `#06b6d4` → `#f97316` → `#06d6a0`

---

## 3. Typography Rules

**Body Font Stack:** System-native sans-serif cascade — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. No external font import in the default build; this creates a OS-native, telemetry-tool feel. The Dashboard measures pill labels with `"16px Inter, sans-serif"` via canvas for precise sizing.

**Monospace Stack:** `source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace` — used everywhere numeric or code data appears: latency readouts (`text-xs font-mono tabular-nums`), session names (`text-xs font-mono`), OTP input (`text-5xl tracking-[1em] font-mono`), feature values in data tables.

**Weight & Size Hierarchy:**
| Context | Weight | Size | Notes |
|---|---|---|---|
| Brand title ("NeuroTECH") | 1000 | 26px | Ultra-black, CSS class `.title` |
| Login headings ("NEUROTECH LOGIN") | 900 (`font-black`) | `text-3xl` | All-caps, `tracking-tighter` |
| Hero headline `.main` | 700 | `clamp(24px, 3vw, 34px)` | `letter-spacing: -0.9px` |
| Hero sub-headline `.sub` | 700 | `clamp(20px, 2.6vw, 24.5px)` | Gradient text fill, `+0.6px` tracking |
| Section headers in panels | 700 | `text-base` | `uppercase tracking-wide` |
| Nav pills | 800 | 15px | All-caps labels in header nav |
| Dropdown / action labels | 900 | 14px | `uppercase tracking-widest` |
| Input field labels | 700 | 11px | `uppercase tracking-[0.2em]`, 70% opacity |
| Table headers | 700 | `text-xs` | `uppercase`, `--text-highlight` color |
| Table body | 400 (monospace) | `text-xs` | `font-mono`, `text-muted` for features |
| Body / lede | 400 | `clamp(16px, 2.2vw, 30px)` | Max-width 48ch |
| Status / badge labels | 700 | `text-sm` | `uppercase tracking-wider` |
| Latency readout | 400 monospace | `text-xs` | `tabular-nums min-w-[4ch]` |

---

## 4. Component Stylings

### Authentication: Login Page
A full-bleed page (`min-h-screen bg-[#050505]`) split into a two-column frosted card at desktop widths:

**Left panel (53% width):** Brand illustration + tagline. Black/30 background, `border-r border-white/5`. Logo container: 80×80px with 3 staggered radiating `border-2 border-[var(--primary)]` square rings animating outward (scale 0.8→2.2, opacity 0→0.5→0, 3s, staggered by 1s). Inner logo box: `rounded-2xl bg-black/60 border border-white/5`. Illustration has a `drop-shadow-[0_0_20px_var(--primary)]` cyan halo.

**Right panel (47% width):** Form. Max-width 380px, auto-centered. Below-header contextual copy uses `text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)] opacity-70`.

**Input fields:** `bg-black/40 backdrop-blur-md border border-white/10` with `rounded-xl`, `pl-12 py-4`. Focus state switches border to `var(--primary)`. A gradient glow div (`from-[var(--primary)] to-[var(--accent)] blur-md opacity-20`) fades in behind the focused field via the parent `.group` and `group-focus-within` selector.

**Submit button:** Full-width, `rounded-xl`, gradient `linear-gradient(135deg, var(--primary), var(--accent))` with `boxShadow: '0 5px 25px -5px var(--primary)'`. Loading state uses `bg-white/5, color: rgba(255,255,255,0.5)`. Hover overlay: `bg-white/0 → bg-white/20`. `ArrowRight` icon translates on hover.

**OTP input:** Full-width `rounded-2xl`, `text-5xl tracking-[1em] font-mono text-white text-center`. Border turns `#ef4444` (red) when <15s remain on the countdown timer.

**Alert banners:** `p-3 rounded-lg text-[11px] font-semibold`. Success: `bg-green-500/10 border border-green-500/20 text-green-400`. Error: `bg-red-500/10 border border-red-500/20 text-red-400`. Both animate in with Framer Motion (`opacity 0, y -10, height 0` → `opacity 1, y 0, height auto`).

### Dashboard Shell
**App root:** `height: 100vh; display: flex; flex-direction: column; overflow: hidden;` — the body never scrolls.

**Header:** `position: fixed; top: 0; width: 100%; z-index: 50; backdrop-filter: blur(6px); background: color-mix(in srgb, var(--bg) 30%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--border) 15%, transparent)`. Three-section inner row: brand (logo video + headline), nav (pill container), connection button (right-pinned, 180px slot).

**Brand logo:** 96×64px video (`object-cover`, `border border-border bg-black`, `rounded-lg`). On hover: a `bg-primary/20 rounded-lg` glow overlay fades in.

**Nav pill container:** `backdrop-blur-sm bg-surface/50 border border-white/5 rounded-full p-1` — wraps the `PillNav` with theme-driven colors derived from current theme's `--accent` and `--text` values.

**Sub-headline gradient text (`.headline-line.sub`):** `background: linear-gradient(90deg, var(--primary), var(--accent)); -webkit-background-clip: text; color: transparent`.

**Footer:** `position: fixed; bottom: 0; height: 32px; backdrop-filter: blur(6px); background: color-mix(in srgb, var(--bg) 30%, transparent); border-top: 1px solid color-mix(in srgb, var(--border) 15%, transparent); font-size: 13px; font-weight: 500`.

### Navigation: Animated Pill Nav
Each nav item is a GSAP-animated pill. On hover, a "hover circle" element expands from the bottom center (`power2.easeOut`, 0.3s in, 0.2s out) flooding the pill with the `--pill-bg` color. The text label scrolls up and is replaced by an inverted-color clone — the classic "liquid fill" effect. Active state is computed from the current URL hash.

The Theme dropdown opens a `ScrollStack` popup listing all 10 theme pills. Each pill is sized dynamically (canvas `measureText` + 60px padding) to accommodate the longest theme name label.

### Buttons
- **`.btn` (base):** `background: var(--primary); color: var(--primary-contrast); border-radius: 12px; padding: 12px 18px; font-weight: 600`. Hover lifts `-1px`. Disabled: `opacity: 0.6`. Transition: 120ms on transform, box-shadow, opacity.
- **`.btn-primary` (CTA):** Same fill, forces `color: #0a0a0a`, 16px size.
- **`.btn-secondary` (ghost):** Transparent, `border: 1px solid var(--border); color: var(--text)`.
- **Dashboard inline buttons:** `bg-primary text-primary-contrast rounded-lg font-bold text-sm shadow-glow hover:opacity-90 active:scale-95 transition-all`. The `shadow-glow` Tailwind alias = `0 0 10px var(--primary)`.
- **Destructive actions (delete/clear):** `hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30` pattern — red is always revealed on hover only, never shown at rest.
- **ConnectionButton:** Pill-shaped (`border-radius: 999px`). State-dependent: emerald (connected), amber (connecting), red (disconnected). Fills use the state color at 20% opacity; borders at 50% opacity. Wrapped in an `ElectricBorder` animated canvas arc. Uppercase tracking-wider text + monospace latency readout.
- **Icon-only toolbar buttons:** `px-2 w-9 flex items-center justify-center text-muted hover:text-primary rounded hover:bg-white/5 transition-colors` — standard pattern for toolbar icons (refresh, reset, sort).

### Cards & Containers
- **`.card`:** `background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: 1px 1px 1px var(--shadow); padding: 10px`.
- **Login frosted card:** `bg-[#0a0a0a]/80 backdrop-blur-2xl rounded-[2rem] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.8)]`.
- **WS Modal:** `bg-surface rounded-lg p-6 w-96`. Modal backdrop: `bg-black/40` full screen overlay.
- **Session manager outer container:** `bg-surface border-2 border-border rounded-xl shadow-card p-1 gap-1 flex` — a slightly heavier border (2px) used for the primary data workspace containers.
- **Left pane (data table area):** `bg-[var(--section-bg)] rounded-lg border border-[var(--section-border)] overflow-hidden`.
- **Right pane (session list sidebar):** `bg-[var(--panel-bg)] rounded-lg border border-[var(--panel-border)] w-1/3 min-w-[180px] max-w-[250px]`.
- **Mosaic tiles:** `border-radius: 22px; aspect-ratio: 4/3; border: 1px solid var(--border); background: #0003`.
- **File drop zone:** `border: 2px dashed var(--border); border-radius: 14px; padding: 28px` — dashed border signals passive invitation.

### Data Tables (SessionManagerPanel)
- Header row: `bg-bg/75 sticky top-0 z-10 backdrop-blur-sm` — frozen, frosted.
- Column headers: `text-xs font-bold uppercase border-b border-[var(--section-border)]`. Feature columns use `text-primary`, class/action columns use `text-[var(--text-highlight)]`.
- Data rows: `border-b border-border hover:bg-border transition-colors group`. Row action buttons hidden at rest via `opacity-0 group-hover:opacity-100`.
- Row primary key: `text-primary`.
- Feature values: `text-muted font-mono` with `.toFixed(2)` formatting.
- Test-mode prediction cells: `text-emerald-500` if correct, `text-red-500` if incorrect.
- Virtualized with `@tanstack/react-virtual` at ~36px row height.
- Empty state: centered `opacity-50` icon + `text-2xl` message.
- Loading overlay: `bg-surface/50 animate-pulse` covering the table.

### Toolbar / Filter Bar Pattern (SessionManagerPanel)
A sticky top toolbar uses consistent `h-9` height for all control groups, with `bg-[var(--bg)]/50 rounded border border-[var(--section-border)]` wrapping each group. Separator: `h-8 w-[1px] bg-[var(--section-border)] opacity-20`. Session badge: `bg-primary/10 border border-primary` with `text-sm font-bold text-text uppercase tracking-wider`.

### Inputs / Forms
- **`.input` / `.select` (global):** `width: 100%; background: #0000; color: var(--text); border: 1px solid var(--border); padding: 12px 14px; border-radius: 10px` — invisible-until-active.
- **Dashboard inline inputs:** `bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50` — transparent bg with border affordance.
- **Rename inline input:** `bg-transparent text-text outline-none` directly inside a `bg-surface border border-primary rounded-md` container.
- **Row range inputs:** Spinner arrows hidden via Tailwind `[appearance:textfield]` utilities. Width `w-10`, centered.
- **New session input:** `bg-bg border border-border rounded px-2 py-1 text-xs font-mono` + `focus:border-primary`.
- **Checkbox:** `accent-[var(--primary)]` to inherit brand tint via CSS accent-color.

### Status Indicators
- **Dots:** 8×8px perfect circles. `.status-connected: #10b981`, `.status-disconnected: #ef4444`, `.status-connecting: #f59e0b + pulse animation`.
- **Pulse animation:** 2s infinite opacity oscillation (1.0→0.5→1.0) for connecting dots; alternate scale pulse (1.0→1.05→1.0) used on branding elements.
- **Connection button glow arcs:** `ElectricBorder` animated canvas — arc color matches the state color (emerald/amber/red), configurable `speed=1.2`, `chaos=0.05`, `thickness=2`.
- **Login radiating rings:** `border-2 border-[var(--primary)]` squares, `rotate: 45deg`, scale 0.8→2.2, opacity 0→0.5→0, 3s repeat, 3 rings staggered 1s apart.

### Charts & Graphs (SignalChart)
- **Container:** Full-width, `min-h-0 overflow-hidden`; height passed as a prop (default 300px).
- **Chart header:** Channel icon (colored to match trace color, clickable to cycle palette), channel number, title, color dot (`channel-color-dot`).
- **Controls bar:** ElasticSlider for time window (1–30s), zoom preset buttons (`[1, 2, 3, 5, 10, 25, 50]x`), manual range `number` input.
- **Zoom buttons:** `zoom-btn active / inactive` CSS classes — active fills with primary color.
- **Stats overlay:** Min/Max/Mean readouts at top right of chart header using icon + value pairs.
- **Canvas overlay:** Bottom-center "ACTIVE / HISTORY" small label (`font-size: 12px; font-weight: bold; pointer-events: none`) colored to match the trace.
- **Rendering:** OffscreenCanvas transferred to a Web Worker on mount. `ResizeObserver` sends `RESIZE` messages; config changes send `SET_CONFIG`. Theme changes propagate `--muted` CSS variable value as `themeAxisColor`.

### Special Effects Components
- **`ElectricBorder`:** Animated canvas arc tracing a container perimeter. Configurable color, speed, chaos, thickness.
- **`ClickSpark`:** Particle burst on click (CSS animation).
- **`GradualBlur`:** Directional blur fade overlay for content edge transitions.
- **`CursorHandler`:** Custom cursor visual (replaces native OS pointer).
- **`AnimatedList`:** Items animate in sequentially; keyboard navigation + mouse selection supported. Selected item: `bg-primary/10 border border-primary/20 text-primary font-bold`.
- **`CountUp`:** Numeric values animate 0 → target on mount.
- **`ElasticSlider`:** Elastic rubber-band feel at drag limits; custom left/right icon slots.
- **`ScrollStack`:** Scrollable vertical stack with custom scrollbar, used for the theme picker dropdown.

---

## 5. Layout Principles

**App Shell:** `height: 100vh; display: flex; flex-direction: column; overflow: hidden`. Body never scrolls. All scrolling is scoped to content panes with hidden scrollbars (`.scrollbar-hide`, `scrollbar-width: none`).

**Fixed Chrome Sandwich:** Fixed top header (~68px effective height) + fixed bottom footer (32px). Content pages that are not full-screen must add top spacer `h-[94px]` and bottom spacer `h-[35px]`. Full-screen pages (`live`, `dino`) skip spacers and claim the entire viewport.

**Split-Pane Data Layouts (calibration panels, session manager):** `flex h-full` with a wide left pane (`flex-grow min-w-0`) and a constrained right sidebar (`w-1/3 min-w-[180px] max-w-[250px]`). Inner gap of 4px (`gap-1`), inner padding 4px (`p-1`) off the outer card.

**Login Page:** Centered card `max-w-[1130px]`. Desktop: `flex` with `w-[53%]` illustration left + `w-[47%]` form right. Mobile: single column (hidden left panel via `hidden lg:flex`). Minimum card height 660px.

**Hero (landing/about sections):** Asymmetric two-column grid `1.2fr 1fr`, collapsing to `1fr` at ≤960px. Vertical padding 56px.

**Grid Utility:** `.row` → single column by default; `.row.two` → `1fr 1fr`; `.row.three` → `1fr 1fr 1fr` at ≥720px. Gap: 16px.

**Whitespace Strategy:** Tight internal padding for data density (cards: 10px, toolbar items: `px-3 py-2`). 16–20px gaps between grid cells. Consistent `h-9` height across toolbar control groups for visual alignment. Separator dividers used as visual punctuation between unrelated controls.

**Radius Scale (smallest → largest):**
| Value | Context |
|---|---|
| `var(--radius)` = `0.5rem` (8px) | shadcn base unit — chips, tags |
| `6px` | Color swatches |
| `8px` | Small badges, status chips |
| `10px` | Form inputs (`.input`) |
| `12px` | Primary action buttons (`.btn`) |
| `14px` | File drop zones |
| `16px` | Standard cards (`.card`) |
| `22px` | Media mosaic tiles |
| `0.5rem` (= shadcn `lg`) | `rounded-lg` Tailwind class — modals, panels |
| `xl` / `2xl` / `[2rem]` | Login frosted card |
| `999px` | Full pill — nav items, connection button |

**Responsive Breakpoints:**
- `≤768px` — Sidebar switches to `position: fixed` overlay
- `≥720px` — Desktop nav shown; two/three column grids activate
- `≤960px` — Hero grid collapses to single column
- `≥lg (1024px)` — Login illustration panel visible
