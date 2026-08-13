---
version: alpha
name: Gipfel Command Ledger
description: A precise institutional desktop for contract, regional, financial, and market operations.
colors:
  primary: "#D4AF37"
  background: "#061A33"
  surface: "#0F2748"
  elevated: "#1A1F2E"
  foreground: "#F5F7FA"
  foreground-secondary: "#8A9BB5"
  border: "rgba(212,175,55,0.12)"
  success: "#22C55E"
  warning: "#F59E0B"
  error: "#EF4444"
  canvas-deep: "#0A0E17"
  canvas-black: "#0F0F0F"
  surface-deep: "#111827"
  surface-steel: "#1A2740"
  surface-command: "#0B2240"
  surface-navigation: "#091F3D"
  text-bright: "#FFFFFF"
  text-soft: "#E8EDF5"
  text-cool: "#AEBBD0"
  text-cool-light: "#A8B5C8"
  text-secondary-soft: "#9EACC2"
  text-secondary-mid: "#91A1B8"
  text-label: "#8392A9"
  text-muted-strong: "#8291A9"
  text-muted-label: "#7688A2"
  text-muted-mid: "#7C8798"
  text-muted-blue: "#75869D"
  text-muted-blue-2: "#74849C"
  text-muted-blue-3: "#687A94"
  text-muted-navy: "#667790"
  text-muted-navy-2: "#667892"
  text-muted-field: "#65758D"
  text-muted-security: "#617189"
  text-muted-deep: "#50617A"
  text-muted-footer: "#52647D"
  text-form: "#DBE2ED"
  text-strong-soft: "#E8EDF6"
  text-strong: "#EDF1F7"
  text-account: "#EEF2F8"
  text-heading: "#F0F3F8"
  text-heading-bright: "#F2F4F8"
  text-display: "#F5F7FB"
  market-up: "#E74C3C"
  market-down: "#2ECC71"
  danger-deep: "#C44040"
  warning-orange: "#FA541C"
  success-bright: "#4ADE80"
  info: "#38BDF8"
  info-strong: "#1677FF"
  gold-dark: "#C79F29"
  gold-light: "#F5D76E"
  gold-hover: "#E1BD4F"
  gold-focus: "#E5C158"
  gold-soft: "#D9C172"
  gold-muted: "#CBB767"
  status-muted: "#6F846F"
  border-dark-overlay: "rgba(0,0,0,0.4)"
  border-light: "rgba(255,255,255,0.1)"
  input-deep: "rgba(4,22,44,0.64)"
  info-soft: "rgba(59,130,246,0.1)"
  gold-legacy-soft: "rgba(212,168,56,0.15)"
  warm-row: "rgba(180,140,80,0.06)"
  gold-panel: "rgba(201,162,39,0.10)"
typography:
  sans:
    fontFamily: "Microsoft YaHei, PingFang SC, Segoe UI, system-ui, sans-serif"
  mono:
    fontFamily: "JetBrains Mono, SF Mono, Consolas, Cascadia Code, Fira Code, monospace"
rounded:
  sm: 3px
  md: 4px
  lg: 6px
  xl: 8px
  xxl: 10px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
  xxxl: 32px
---

## Overview

Gipfel is a desktop operating workspace for role-governed contract, regional, infrastructure, financial, and market work. The interface favors fast scanning, clear state distinctions, and predictable actions in dense tables and operational panels.

## Colors

Use the navy background stack to establish hierarchy: canvas for the workspace, surface for navigation and table headers, and elevated surfaces for active work. Champagne gold marks primary actions, current navigation, and focused controls; semantic status colors communicate domain state without replacing labels.

## Typography

Use the sans scale for Chinese interface text and the mono scale with tabular numerals for currency, quantities, dates, market values, and other comparable data. Table headers remain compact and labels use stronger tracking than body text.

## Layout

Keep the desktop workbench compact and grid-led. The 248px navigation rail carries the brand, grouped tasks, and current identity; the 70px command bar carries page context, search, and notifications. Navigation, filters, tables, and page actions remain visible without ornamental panels. Responsive layouts reduce grid columns before reducing text legibility.

## Elevation & Depth

Use luminance separation, fine borders, and one directional navy-tinted shadow for floating content. Shadows establish overlay depth only; they must not become colored glows.

## Shapes

Use tight corners consistently. Controls use the medium radius; data surfaces may use the large radius. Do not introduce oversized rounded cards or pill-shaped primary controls.

## Components

Tables use a dark surface header, fine row dividers, tabular numbers, and a restrained gold-tinted hover state. Buttons, inputs, menus, tags, modals, and drawers use the same edge treatment and visible keyboard focus outline. Icon-only controls carry accessible names.

Executive metrics are composed as one ledger surface with shared dividers: one leading financial value and compact secondary cells. Do not return to rows of unrelated equal KPI cards. The login surface pairs a silent brand instrument with a dedicated secure-access column: the left side contains no product copy or role explanation, only the centered static mark inside measured axes, orbit geometry, and square registration details. Continuous supporting motion is low-frequency and transform-only; one-time entrances may also use opacity, and reduced-motion preferences collapse every animation to a single imperceptible frame.

## Role surfaces

Role presentation must fail closed. Only `admin` and `operator` may receive stock write controls; missing or unknown roles are read-only. Representative navigation names the surface “股票行情” and never renders fund adjustment, buy, or sell controls. Read-only state is communicated in text as well as color.

## Do's and Don'ts

Do preserve the three-layer text hierarchy, role-based information boundaries, 11px minimum interface text, visible focus, dark themed scrollbars, and reduced-motion fallbacks. Do not use gradients, neon, decorative glow, emoji, large rounded surfaces, or motion that changes layout properties.
