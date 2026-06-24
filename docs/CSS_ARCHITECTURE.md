# CSS Architecture Guide
## Audiogravity Frontend — CSS Design System

---

## Table of Contents

1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Import Order](#import-order)
4. [Naming Conventions](#naming-conventions)
5. [CSS Variables (Design Tokens)](#css-variables-design-tokens)
6. [Adding New Styles](#adding-new-styles)
7. [Lit Integration](#lit-integration)
8. [Best Practices](#best-practices)

---

## Overview

Audiogravity's CSS architecture follows a **modular, scalable** methodology based on:

- **Design Tokens**: CSS variables organized in 4 levels
- **Atomic Design**: Atoms → Molecules → Organisms
- **Controlled Cascade**: Strict import order via `main.css`
- **Light DOM**: Transparent integration with Lit components

### Metrics
```
CSS files:            all lint-clean (see css/ for the live count)
Reusable components:  one stylesheet per component under css/components/
Themes:               3 (Slate, Minimal, Gravity)
CSS variables:        design tokens defined in themes.css
Utility classes:      utilities.css
Linting:              Stylelint — pre-commit hook (Husky 9)
```

---

## File Structure

```
css/
├── main.css                    # SINGLE ENTRY POINT (Master Manifest)
│
├── base.css                    # CSS reset + base typography
├── layout.css                  # App shell (topbar, vertical sidebar, footer)
├── responsive.css              # Global breakpoints and responsive helpers
├── utilities.css               # Reusable utility classes
│
├── themes.css                  # Theme orchestrator + global tokens + no-animations rules
├── themes/
│   ├── slate.css              # Default theme (Light + Dark)
│   ├── minimal.css            # Minimalist alternative theme
│   └── gravity.css            # Gravity theme (Light + Dark)
│
├── components/                 # REUSABLE COMPONENTS (one stylesheet per component)
│   ├── animations.css         # Keyframes: blinkSlow, blinkInfo, pulse, fade…
│   ├── badge.css              # Status badges (success-pulse, error-pulse…)
│   ├── button.css             # btn-action (compact) + action-btn (full height)
│   ├── config-sidebar.css     # Configuration side panel
│   ├── connector-badge.css    # Source connector badges
│   ├── dsd-lock.css           # DSD lock indicator
│   ├── filter-bar.css         # Library filter bar
│   ├── format-strip.css       # Audio format strip (bitrate, sample rate)
│   ├── forms.css              # Form inputs and fields
│   ├── grid.css               # Responsive grids (grid-fit, grid-auto)
│   ├── health-bar.css         # System health bar
│   ├── history-panel.css      # Action history panel
│   ├── library-album-card.css # Library album card
│   ├── library-browser.css    # Library browser layout
│   ├── library-cover.css      # Album cover display
│   ├── library-list-row.css   # Library list row
│   ├── library-outputs.css    # Library output selector
│   ├── library-queue.css      # Playback queue
│   ├── library-radio.css      # Radio browser
│   ├── library-search.css     # Library search
│   ├── library-sources.css    # Library source cards (HQPlayer, Tidal…)
│   ├── metrics.css            # Unified metric displays
│   ├── modal.css              # Modal system (dvh, safe-area, backdrop)
│   ├── now-playing.css        # Mini now-playing player
│   ├── now-playing-fullscreen.css  # Fullscreen now-playing player
│   ├── perf-monitor.css       # ag-perf-monitor styles (SSE traffic, timers, heap)
│   ├── playback-controls.css  # Playback control bar
│   ├── progress.css           # Generic progress bars
│   ├── progress-bar.css       # Playback progress bar (seekable)
│   ├── skeleton.css           # Animated loading skeletons
│   ├── sleep-timer.css        # Sleep timer widget
│   ├── source-badge.css       # Audio source badges
│   ├── sparkline.css          # SVG sparkline charts
│   ├── splash-screen.css      # App splash screen
│   ├── status-indicator.css   # Status indicators (LED dots, blinkSlow)
│   ├── tab-zone.css           # Inner tab zones
│   ├── tile.css               # Cards / Tiles
│   ├── toast.css              # Toast notifications
│   ├── tooltip.css            # Tooltips
│   └── track-meta.css         # Track metadata display
│
└── (page stylesheets)          # PAGE-SPECIFIC STYLES
    ├── admin.css              # Admin page
    ├── audio-software.css     # Audio Software page
    ├── config.css             # Config page
    ├── config-editor.css      # JSON/CodeMirror editor (mobile responsive)
    ├── login.css              # Login page
    ├── performance.css        # Performance page
    ├── profiles.css           # Profiles page
    ├── services.css           # Services page
    ├── system.css             # System page
    ├── systemd.css            # Systemd page
    ├── terminal.css           # Terminal page
    └── validation.css         # Validation UI
```

---

## Import Order

> **Do not change the order in `main.css`.** CSS variables must be defined before they are used.

```css
/* 1. BASE (Reset, HTML base) */
@import 'base.css';

/* 2. DESIGN TOKENS (Variables, Themes) */
@import 'themes.css';
@import 'responsive.css';

/* 3. SHARED COMPONENTS */
@import 'components/grid.css';
@import 'components/tile.css';
@import 'components/button.css';
@import 'components/metrics.css';
@import 'components/tooltip.css';
@import 'components/status-indicator.css';
@import 'components/badge.css';
@import 'components/source-badge.css';
@import 'components/skeleton.css';
@import 'components/tab-zone.css';
@import 'components/animations.css';
@import 'components/toast.css';
@import 'components/sparkline.css';
@import 'components/health-bar.css';
@import 'components/filter-bar.css';
@import 'components/forms.css';
@import 'components/library-cover.css';
@import 'components/library-list-row.css';
@import 'components/library-browser.css';
@import 'components/now-playing-fullscreen.css';
@import 'components/progress-bar.css';
@import 'components/playback-controls.css';
@import 'components/sleep-timer.css';
@import 'components/format-strip.css';
@import 'components/connector-badge.css';
@import 'components/dsd-lock.css';
@import 'components/track-meta.css';
@import 'components/library-search.css';
@import 'components/library-queue.css';
@import 'components/library-sources.css';
@import 'components/library-outputs.css';
@import 'components/library-album-card.css';
@import 'components/library-radio.css';
@import 'components/modal.css';
@import 'components/config-sidebar.css';
@import 'components/history-panel.css';
@import 'components/progress.css';
@import 'components/perf-monitor.css';
@import 'components/now-playing.css';
@import 'components/splash-screen.css';

/* 4. LAYOUT (App Shell, Topbar, Tabs, Footer) */
@import 'layout.css';

/* 5. UTILITIES (Utility classes and helpers) */
@import 'utilities.css';

/* 6. PAGE MODULES (Specific Tab Logic) */
@import 'profiles.css';
@import 'services.css';
@import 'admin.css';
@import 'audio-software.css';
@import 'config-editor.css';
@import 'systemd.css';
@import 'performance.css';
@import 'system.css';
@import 'config.css';
@import 'validation.css';
@import 'login.css';
@import 'terminal.css';
```

### Cascade levels

```
Level 1: Base (HTML reset)
    ↓
Level 2: Tokens (CSS variables)
    ↓
Level 3: Components (reusable atoms)
    ↓
Level 4: Layout (app shell)
    ↓
Level 5: Utilities (rare overrides)
    ↓
Level 6: Pages (specific overrides)
```

---

## Naming Conventions

### 1. Reusable component classes

Format: `.{component-name}` + variants / modifiers

```css
/* Base */
.badge { }

/* Variants (type/color) */
.badge.success { }
.badge.error   { }
.badge.warning { }
.badge.info    { }

/* Modifiers (shape/size) */
.badge.pill    { }
.badge.small   { }
.badge.large   { }

/* States */
.badge.clickable       { }
.badge.clickable:hover { }
```

```html
<span class="badge success pill">Active</span>
<span class="badge error small">Failed</span>
```

### 2. Page-specific classes

Format: `.{page}-{element}`

```css
/* Services page */
.services-zone  { }
.services-grid  { }
.service-tile   { }
.service-header { }
.service-actions { }

/* Audio Software page */
.software-zone  { }
.software-grid  { }
.software-card  { }
```

### 3. Utility classes

Format: `.{property}-{value}` (Tailwind-like)

```css
/* Spacing */
.mt-md  { margin-top: var(--spacing-md); }
.mb-sm  { margin-bottom: var(--spacing-sm); }
.ml-auto { margin-left: auto; }
.pt-md  { padding-top: var(--spacing-md); }

/* Text */
.text-primary-color   { color: var(--text-primary); }
.text-secondary-color { color: var(--text-secondary); }
.text-center  { text-align: center; }
.uppercase    { text-transform: uppercase; }
.font-bold    { font-weight: bold; }

/* Display */
.flex         { display: flex; }
.flex-center  { display: flex; align-items: center; gap: var(--spacing-sm); }
.flex-between { display: flex; justify-content: space-between; }
.inline-flex  { display: inline-flex; }

/* Sizing */
.w-100 { width: 100%; }
.h-24  { height: 24px; }

/* Lists */
.list-disc { list-style-type: disc; }
.pl-20     { padding-left: 20px; }
```

When to add a new utility class:
- The same inline pattern appears 3+ times in the codebase
- It uses design tokens (`var(--spacing-*)`, `var(--text-*)`)

---

## CSS Variables (Design Tokens)

### 4-level architecture

```
Level 1: Global Tokens (spacing, typography, layout)
    ↓
Level 2: Semantic Tokens (bg, text, colors)
    ↓
Level 3: Compatibility Aliases
    ↓
Level 4: Specialized Tokens (syntax highlighting, charts)
```

### Level 1 — Global Tokens (`themes.css`)

```css
:root {
  /* Spacing (base 8px) */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Typography */
  --font-family: 'Inter', -apple-system, sans-serif;
  --font-mono:   'Courier New', monospace;
  --font-size-xxs:  10px;
  --font-size-xs:   11px;
  --font-size-sm:   13px;
  --font-size-md:   14px;
  --font-size-lg:   16px;
  --font-size-xl:   20px;
  --font-size-xxl:  20px;
  --font-size-xxxl: 28px;

  /* Border radius */
  --radius-none: 0;
  --radius-xs:   1px;
  --radius-sm:   2px;
  --radius-md:   4px;
  --radius-lg:   8px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 1px 3px var(--shadow-color, rgb(0 0 0 / 0.1));
  --shadow-lg: 0 4px 6px -1px var(--shadow-color, rgb(0 0 0 / 0.1));
  --shadow-xl: 0 10px 15px -3px var(--shadow-color, rgb(0 0 0 / 0.1));

  /* Transitions */
  --transition-fast:   150ms ease;
  --transition-normal: 250ms ease;

  /* Component sizes */
  --size-xxs: 10px;  /* Status dots */
  --size-xs:  12px;  /* Small indicators */
  --size-sm:  18px;  /* Compact buttons (btn-action) */
  --size-md:  20px;  /* Sparklines */
  --size-lg:  28px;  /* Burger menu */
  --size-xl:  40px;  /* Input heights */
  --size-xxl: 60px;  /* Chart heights */

  /* Layout */
  --topbar-height:       50px;
  --footer-height:       50px;
  --tabs-height:         50px;
  --title-bar-height:    55px;
  --tabs-vertical-width: 225px;

  /* Z-index layers */
  --z-base:           1;
  --z-tabs:           100;
  --z-tooltip:        500;
  --z-modal-backdrop: 999;
  --z-topbar:         1000;
  --z-modal:          10000;
  --z-toast:          99999;
}
```

### Level 2 — Semantic Tokens (`themes/slate.css`)

```css
/* Light mode */
:root {
  --bg-primary:   #F8F9FA;
  --bg-secondary: #FFFFFF;
  --bg-tertiary:  #F1F5F9;

  --text-primary:   #1E293B;
  --text-secondary: #64748B;
  --text-tertiary:  #94A3B8;

  --color-success: #10B981;
  --color-error:   #EF4444;
  --color-warning: #F59E0B;
  --color-info:    #3B82F6;

  --accent-primary:       #6366F1;
  --accent-primary-alpha: rgb(99 102 241 / 0.1);
  --accent-hover:         #4F46E5;

  --border-color: #E2E8F0;
}

/* Dark mode */
body.dark-mode {
  --bg-primary:   #0F172A;
  --bg-secondary: #1E293B;
  --bg-tertiary:  #334155;

  --text-primary:   #F1F5F9;
  --text-secondary: #94A3B8;

  --color-success: #34D399;
  --color-error:   #F87171;
}
```

### Token usage reference

| Use case | Token | Avoid |
|---|---|---|
| Backgrounds | `var(--bg-primary)` | `#F8F9FA` |
| Primary text | `var(--text-primary)` | `#000` / `black` |
| Spacing | `var(--spacing-md)` | `16px` |
| Border radius | `var(--radius-md)` | `4px` |
| Shadows | `var(--shadow-md)` | `0 1px 3px rgba(…)` |
| Transitions | `var(--transition-fast)` | `150ms ease` |
| Accent / interactive | `var(--accent-primary)` | `#6366F1` |
| Success state | `var(--color-success)` | `green` / `#10B981` |
| Border | `var(--border-color)` | `#E2E8F0` |
| Compact button height | `var(--size-sm)` | `18px` |
| Font family | `var(--font-family)` | `'Inter', sans-serif` |
| Monospace | `var(--font-mono)` | `'Courier New'` |

---

## Adding New Styles

### Case 0 — Avoid inline styles

Before adding `style="..."`, check whether a utility class already exists in `utilities.css`.

```html
<!-- ✅ Good -->
<div class="flex-center mt-md">
  <h3 class="m-0 uppercase">Title</h3>
  <span class="text-secondary-color">Subtitle</span>
</div>

<!-- ❌ Avoid -->
<div style="display: flex; align-items: center; margin-top: var(--spacing-md);">
  <h3 style="margin: 0; text-transform: uppercase;">Title</h3>
</div>
```

### Case 1 — Create a new reusable component

1. Create `css/components/mycomponent.css`:

```css
/**
 * @module MyComponent
 * @description Brief description.
 */

.my-component {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.my-component.elevated {
  box-shadow: var(--shadow-lg);
}
```

2. Import in `main.css` under section 3 — SHARED COMPONENTS:

```css
@import 'components/mycomponent.css';
```

3. Document the associated Lit component with JSDoc and a `.stories.js` story.

### Case 2 — Add page-specific styles

1. Create `css/mypage.css`.
2. Import in `main.css` under section 6 — PAGE MODULES.

### Case 3 — Extend an existing component

Edit the existing file directly (e.g. `css/components/badge.css`). No `main.css` change needed.

```css
/* Add after existing variants */
.badge.neutral {
  border-color: var(--text-tertiary);
  color: var(--text-tertiary);
  background: transparent;
}
```

---

## Lit Integration

### Light DOM

All Audiogravity Lit components use **Light DOM** to inherit global CSS automatically:

```javascript
export class AgButton extends LitElement {
  createRenderRoot() {
    return this; // Light DOM — inherits all global CSS tokens
  }
}
```

### Why Light DOM?

| Benefit | Explanation |
|---|---|
| Zero CSS duplication | Global CSS variables apply automatically |
| Unified theming | Dark mode works without extra configuration |
| Performance | No Shadow DOM to parse |
| DevTools transparency | DevTools show the real CSS |
| Flexbox / Grid friendly | `display: contents` — invisible to parent layout |

### Using CSS classes in Lit templates

```javascript
import { classMap } from 'lit/directives/class-map.js';

render() {
  const classes = {
    'badge': true,
    'success': this.status === 'active',
    'error':   this.status === 'failed',
    'pill':    this.rounded
  };

  return html`
    <div class="flex-center mt-md">
      <span class=${classMap(classes)}>${this.label}</span>
      <span class="text-secondary-color">${this.description}</span>
    </div>
  `;
}
```

Dynamic values (computed at runtime) are the only valid use case for inline styles:

```javascript
// ✅ Dynamic — inline style is justified
return html`
  <div class="tile animate-stagger" style="animation-delay: ${this.index * 0.05}s">
    <div class="progress-bar" style="width: ${this.progress}%"></div>
  </div>
`;
```

---

## Best Practices

### 1. Prefer utility classes over inline styles

```html
<!-- ✅ Good -->
<div class="flex-between mb-md">
  <h3 class="m-0 uppercase">Title</h3>
  <span class="badge success">Active</span>
</div>
```

### 2. Always use CSS variables

```css
/* ✅ Good */
.my-component {
  padding: var(--spacing-md);
  color: var(--text-primary);
}

/* ❌ Avoid */
.my-component {
  padding: 16px;
  color: #1E293B;
}
```

### 3. Use semantic tokens

```css
/* ✅ Good */
.error-message { color: var(--color-error); }

/* ❌ Avoid */
.error-message { color: #EF4444; }
```

### 4. Use standard transitions

```css
/* ✅ Good */
.button { transition: all var(--transition-fast); }

/* ❌ Avoid */
.button { transition: all 0.2s ease; }
```

### 5. Use border-radius tokens

```css
.small  { border-radius: var(--radius-sm); }   /* 2px */
.medium { border-radius: var(--radius-md); }   /* 4px */
.large  { border-radius: var(--radius-lg); }   /* 8px */
.pill   { border-radius: var(--radius-full); } /* 9999px */
```

### 6. Document with JSDoc

```css
/**
 * @component .my-component
 * @description What this component does.
 */
.my-component { }

/**
 * @variant .my-component.large
 * @description Larger variant for emphasis.
 */
.my-component.large { }
```

### 7. Mobile-first responsive layout

```css
/* ✅ Good — mobile first */
.content-grid {
  display: grid;
  grid-template-columns: 1fr; /* default: 1 column (mobile) */
  width: 100%;
}

@media (width >= 1201px) {
  .content-grid {
    grid-template-columns: 1fr 350px; /* desktop: 2 columns */
  }
}
```

Rules:
- Use `width <=` for small-screen adaptations (iOS/Safari).
- Use `width >=` for multi-column breakpoints.
- Never use ID specificity to override layout classes — use scoped module classes instead.

### 8. GPU-accelerated animations

```css
/* ✅ Good — GPU accelerated */
.card:hover { transform: translateY(-4px); }

/* ❌ Avoid — causes repaints */
.card:hover { top: -4px; }
```

### 9. Interactive states

```css
.button                { background: var(--bg-primary); transition: all var(--transition-fast); }
.button:hover          { background: var(--bg-secondary); }
.button:active         { transform: scale(0.95); }
.button:disabled       { opacity: 0.5; cursor: not-allowed; }
```

---

## Debugging CSS

```javascript
// Inspect a CSS variable
getComputedStyle(document.documentElement).getPropertyValue('--spacing-md');
// → "16px"

// List all CSS variables
[...document.styleSheets]
  .flatMap(s => [...s.cssRules])
  .filter(r => r.selectorText === ':root')
  .flatMap(r => [...r.style])
  .filter(p => p.startsWith('--'))
  .sort();
```

---

## References

- [CSS Custom Properties — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/--)
- [CSS Grid Layout — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [Lit Documentation](https://lit.dev/docs/)
- [EVENTS_API.md](./EVENTS_API.md) — CustomEvents reference
- Storybook — the live Lit component inventory (`npm run storybook`)

---

## Developer Checklist

Before coding:
- [ ] Read this guide
- [ ] Understand `main.css` import order
- [ ] Know the available CSS variables (`themes.css`)
- [ ] Know when to create a component vs a page stylesheet

Before committing:
- [ ] CSS variables used everywhere (no hardcoded values)
- [ ] JSDoc comments on new classes
- [ ] Tested in Light + Dark mode
- [ ] Tested on mobile / responsive
- [ ] No duplication with existing components
- [ ] Stylelint passes (`npm run lint:css`)

