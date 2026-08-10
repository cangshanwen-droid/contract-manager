/**
 * LogoSystem - Gipfel 金融级 Logo 组件系统
 *
 * 品牌系统：BlackRock / Morgan Stanley 级别
 * 色彩：深海军蓝 #070B14 | 金融金 #C9A227
 *
 * 三种形态：
 *   LogoFull  - 登录页，完整竖版 Logo (JPEG, 721×983)，默认 180px
 *   LogoIcon  - 侧边栏方形图标 (PNG, 256×256)，默认 36px
 *   LogoWord  - 纯文字备选
 *   LogoRow   - 图标+文字水平排列，品牌名大写，金融感字间距
 *
 * 规范：无裁剪/无拉伸/无变形/object-fit:contain
 * 动画：仅 300ms fade-in + scale(0.98→1)
 */

import React from 'react'
import LOGO_FULL from '../assets/logo-full.txt?raw'
import LOGO_ICON from '../assets/logo-icon.txt?raw'

const STYLE = `
  @keyframes logoFadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to   { opacity: 1; transform: scale(1); }
  }
  .gipfel-logo { animation: logoFadeIn 300ms ease-out both; display: block; }
`

// ── LogoFull: 完整竖版 Logo，登录页用，默认 180px ──
export const LogoFull: React.FC<{ width?: number }> = ({ width = 180 }) => (
  <>
    <style>{STYLE}</style>
    <img src={LOGO_FULL} alt="Gipfel"
      className="gipfel-logo"
      style={{ width, height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
  </>
)

// ── LogoIcon: 方形图标，侧边栏用，默认 36px ──
export const LogoIcon: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <>
    <style>{STYLE}</style>
    <img src={LOGO_ICON} alt="Gipfel"
      className="gipfel-logo"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }} />
  </>
)

// ── LogoWord: 纯文字 - 大写品牌名，金融感 ──
export const LogoWord: React.FC<{ fontSize?: number }> = ({ fontSize = 18 }) => (
  <span className="gipfel-logo" style={{
    fontSize, fontWeight: 600, color: '#e2e8f0',
    textTransform: 'uppercase', letterSpacing: '0.12em',
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    lineHeight: 1.3,
  }}>GIPFEL</span>
)

// ── LogoRow: 图标+文字组合，侧边栏用 ──
export const LogoRow: React.FC<{ iconSize?: number; fontSize?: number; gap?: number }> =
  ({ iconSize = 36, fontSize = 16, gap = 10 }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap }}>
      <LogoIcon size={iconSize} />
      <span style={{
        fontSize, fontWeight: 600, color: '#e2e8f0',
        textTransform: 'uppercase', letterSpacing: '0.12em',
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        lineHeight: 1.3, whiteSpace: 'nowrap',
      }}>GIPFEL</span>
    </div>
  )
