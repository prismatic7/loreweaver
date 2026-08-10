---
name: Loreweaver
description: A flat, structured print-style layout system for tabletop RPG campaign orchestration.
colors:
  primary: "oklch(52% 0.10 28)"
  primary-hover: "oklch(45% 0.12 28)"
  primary-dark: "oklch(60% 0.10 28)"
  primary-dark-hover: "oklch(55% 0.12 28)"
  neutral-bg: "oklch(98% 0.004 95)"
  neutral-surface: "oklch(100% 0.002 95)"
  neutral-fg: "oklch(20% 0.018 70)"
  neutral-muted: "oklch(48% 0.012 70)"
  neutral-border: "oklch(90% 0.006 95)"
  neutral-bg-dark: "oklch(14% 0.012 70)"
  neutral-surface-dark: "oklch(18% 0.014 70)"
  neutral-fg-dark: "oklch(92% 0.008 70)"
  neutral-muted-dark: "oklch(55% 0.012 70)"
  neutral-border-dark: "oklch(25% 0.014 70)"
typography:
  display:
    fontFamily: "'Iowan Old Style', 'Charter', Georgia, serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.1
  headline:
    fontFamily: "'Iowan Old Style', 'Charter', Georgia, serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "6px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-fg}"
    rounded: "{rounded.none}"
    padding: "6px 14px"
---

# Design System: Loreweaver

## Overview

**Creative North Star: "The Tactile Ledger"**

Loreweaver adopts a design system inspired by minimalist print layouts, academic documents, and high-quality physical notebooks. It rejects the floating, heavily shadowed interfaces of modern SaaS applications in favor of a flat, structured "ink-on-paper" presentation. High contrast, precise layout grids, and clear typographical hierarchy ensure maximum legibility for Game Masters managing complex campaign information under low-latency or live play conditions.

The system is built on sharp, flat edges (0px border-radius), crisp border divisions (1px boundaries), and a dual-theme warm palette. The interface recedes to let the campaign contents—including handwritten notes and vector campaign map canvases—stand out as the primary visual focus.

**Key Characteristics:**
- Flat-by-default surfaces and components with sharp corners (0px border-radius).
- Dual-theme color system using warm paper tones for light mode and deep carbon tones for dark mode.
- Strong editorial feel using classic serif display typography paired with clean, readable system sans-serif body text.
- Outlined component styling with highly restrained use of solid colors, reserving the rust accent for focal actions and states.

## Colors

The color palette is split into two modes: a high-contrast light mode inspired by linen parchment and dark sepia ink, and an immersive dark mode styled around obsidian stone and charcoal ink.

### Primary
- **Terracotta Rust** (oklch(52% 0.10 28) / dark: oklch(60% 0.10 28)): The signature color representing creative ember. Used sparingly for active states, key interactive indicators (like active tabs or navigation links), selection highlights, and primary call-to-action buttons.

### Neutral
- **Warm Alabaster** (oklch(98% 0.004 95)): The primary application background in light mode. Mimics the soft, low-strain warmth of clean ledger paper.
- **Linen Parchment** (oklch(100% 0.002 95)): The card and panel surface background in light mode.
- **Charcoal Inkwell** (oklch(14% 0.012 70)): The primary application background in dark mode.
- **Obsidian Slate** (oklch(18% 0.014 70)): The card and panel surface background in dark mode.
- **Obsidian Ink** (oklch(20% 0.018 70) / dark: oklch(92% 0.008 70)): The high-contrast body text color.
- **Muted Charcoal** (oklch(48% 0.012 70) / dark: oklch(55% 0.012 70)): The secondary text color for metadata, descriptions, and placeholder hints.
- **Light Sepia Border** (oklch(90% 0.006 95) / dark: oklch(25% 0.014 70)): The layout dividing border color.

### Named Rules
**The 10% Accent Rule.** The Terracotta Rust primary accent must never occupy more than 10% of any view's surface area. Accent rarity preserves its capability to guide the eye to interactive focus states.
**The Ink Contrast Rule.** Interactive text must always contrast cleanly against the background. Do not use low-contrast grey on grey for important metadata.

## Typography

**Display Font:** `Iowan Old Style`, `Charter`, Georgia, serif
**Body Font:** `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, system-ui, sans-serif
**Label/Mono Font:** `SF Mono`, `Fira Code`, `Cascadia Code`, monospace

The typography pairs a classic, academic book-like display serif with a clean, high-performance sans-serif system stack for reading endurance. 

### Hierarchy
- **Display** (Weight 600, Size 36px, Line-height 1.1): Used for main note page titles.
- **Headline** (Weight 600, Size 32px / 2rem, Line-height 1.2): Used for H1 headings in Markdown note bodies.
- **Title** (Weight 600, Size 18px, Line-height 1.2): Used for section titles, brand logoups, and panel headings.
- **Body** (Weight 400, Size 15px, Line-height 1.5): Used for paragraph content, editor text, and list descriptions. Max line-length is bounded at 65–75ch for comfortable reading.
- **Label** (Weight 600, Size 11px, Line-height 1.3, Letter-spacing 0.06em, Uppercase): Used for tabs, section identifiers, active tags, and monospace indicators.

### Named Rules
**The Single Serif Rule.** Serif face uses are strictly reserved for Display titles and Markdown headings. All interface labels, menus, sidebar trees, and form elements must remain in sans-serif or monospace to prevent interface distraction.

## Layout

Loreweaver operates on a clean, grid-based layout with strict borders dividing content panels.
- **Icon Ribbon**: Fixed `52px` left-anchored action ribbon.
- **Sidebar**: Fixed `240px` folder navigation tree.
- **Inspector Panel**: Collapsible `340px` right panel containing helper widgets (scratchpad, chat, plugin tools).
- **Spacing Rhythm**: Employs a linear padding scale based on multiples of 4px. Key structural components align to a `16px` (lg) or `20px` (xl) grid alignment, while note document pages use a generous `48px` to `56px` padding bounds to simulate physical paper margins.

## Elevation & Depth

Loreweaver is flat-by-default. Physical layering is suggested using flat border outlines and color-mix backgrounds, rather than shadows.
- **No Shadows**: Cards, sidebars, buttons, and headers use `box-shadow: none` at rest.
- **Modals & Overlays**: Shadows are only applied to floating, user-dismissible modals and dropdown selections to signify they hover above the active layout stack.

### Shadow Vocabulary
- **Floating overlay** (0 4px 12px rgba(0,0,0,0.15)): Used for context menus, autocompletion search listings, and system settings modals.

### Named Rules
**The Rest Restraint Rule.** No surface at rest may carry a shadow. Depth is communicated strictly by the `1px` border lines (`var(--border)`) and contrasting panel background tones.

## Shapes

The form language is geometric, flat, and sharp. 
- **Sharp Corners**: All boxes, buttons, inputs, sidebars, and cards use `border-radius: 0px` (flat cuts).
- **Crisp Divides**: All lines and boundaries are solid `1px` thickness.

## Components

### Buttons
- **Shape**: Sharp corners (0px border-radius)
- **Primary**: Solid background using Terracotta Rust accent with white text. Padding is 6px 14px.
- **Hover / Focus**: Primary buttons transition to a darker accent state (Terracotta Rust Hover). Focus states display a crisp outer ring (outline: 2px solid var(--accent) offset by 2px).
- **Secondary / Default**: Flat outline border (1px solid var(--border)) with transparent background and Obsidian Ink text. Hover adds a light background fill (var(--border)).

### Chips
- **Style**: Outlined border (1px solid var(--border)), sharp corners (0px border-radius), light background fill (var(--bg)), and 11px monospace uppercase labels.
- **State**: Active chips use a solid accent background or accent border.

### Cards / Containers
- **Corner Style**: Sharp (0px radius)
- **Background**: Panel surface (var(--surface))
- **Shadow Strategy**: None (see Elevation section)
- **Border**: Solid 1px width (var(--border))
- **Internal Padding**: Structured 16px padding

### Inputs / Fields
- **Style**: Sharp rectangular border (0px radius), solid 1px outline border (var(--border)), background matching var(--bg).
- **Focus**: Transitions the border color to Terracotta Rust.

### Navigation
- **Style**: Vertical list of text links inside sidebars. Font is body size (13px), left-aligned, with a subtle outline on hover. Active links highlight in Terracotta Rust with a medium font-weight.

## Do's and Don'ts

### Do:
- **Do** align all layouts to sharp 0px corners, keeping borders strictly 1px solid lines.
- **Do** reserve serif display faces strictly for main note title headers and H1/H2 markdown headings.
- **Do** use the Terracotta Rust accent sparingly (≤10%) to highlight actionable items and active states.
- **Do** support full dual-theme contrast ratios, ensuring text remains clean against warm paper/charcoal backdrops.

### Don't:
- **Don't** use border-radius values (e.g., 4px, 8px, or rounded pill shapes) on buttons, cards, or input fields.
- **Don't** apply box-shadows to standard cards, cards at rest, or sidebars.
- **Don't** introduce bright color gradients or saturated neon background fills.
- **Don't** use low-contrast grey on grey text for important secondary metadata.
