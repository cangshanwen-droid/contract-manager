import React, { useRef, useEffect, useState } from 'react'

export interface GlobeRegion {
  name: string
  lat: number
  lng: number
  population?: number
  carbon_emissions?: number
  contract_count?: number
  happiness?: number
}

interface GlobeViewProps {
  regions: GlobeRegion[]
  width?: number
  height?: number
}

/** Convert lat/lng (degrees) to 3D cartesian on unit sphere */
function toCartesian(lat: number, lng: number): { x: number; y: number; z: number } {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = lng * (Math.PI / 180)
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  }
}

/** Rotate point around Y axis */
function rotateY(p: { x: number; y: number; z: number }, angle: number) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: p.x * cos + p.z * sin,
    y: p.y,
    z: -p.x * sin + p.z * cos,
  }
}

const GlobeView: React.FC<GlobeViewProps> = ({ regions, width = 520, height = 520 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<GlobeRegion | null>(null)
  const [tooltipXY, setTooltipXY] = useState({ x: 0, y: 0 })
  const rotationRef = useRef(0)
  const rafRef = useRef(0)
  const projectedRef = useRef<Array<{ sx: number; sy: number; sz: number; r: GlobeRegion }>>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const cx = width / 2
    const cy = height / 2
    const R = Math.min(width, height) * 0.34
    const focal = R * 2.8

    // Precompute wireframe lines
    const meridians: Array<Array<{ x: number; y: number; z: number }>> = []
    for (let lng = 0; lng < 360; lng += 15) {
      const pts: Array<{ x: number; y: number; z: number }> = []
      for (let lat = -90; lat <= 90; lat += 3) {
        pts.push(toCartesian(lat, lng))
      }
      meridians.push(pts)
    }

    const parallels: Array<Array<{ x: number; y: number; z: number }>> = []
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts: Array<{ x: number; y: number; z: number }> = []
      for (let lng = 0; lng <= 360; lng += 3) {
        pts.push(toCartesian(lat, lng))
      }
      parallels.push(pts)
    }

    // Region cartesian positions
    const regionPts = regions.map((r) => ({
      pos: toCartesian(r.lat, r.lng),
      region: r,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      const angle = rotationRef.current

      // Background circle (subtle)
      ctx.beginPath()
      ctx.arc(cx, cy, R + 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(22, 119, 255, 0.03)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(22, 119, 255, 0.08)'
      ctx.lineWidth = 1
      ctx.stroke()

      // --- Draw meridians ---
      ctx.lineWidth = 0.6
      for (const m of meridians) {
        ctx.beginPath()
        let started = false
        for (const pt3 of m) {
          const r = rotateY(pt3, angle)
          const scale = focal / (focal + r.z)
          const sx = cx + r.x * R * scale
          const sy = cy - r.y * R * scale
          if (!started) {
            ctx.moveTo(sx, sy)
            started = true
          } else {
            ctx.lineTo(sx, sy)
          }
        }
        // Determine if this meridian is mostly front-facing
        const mid = rotateY(m[45], angle) // lat=45 => index 45
        const alpha = mid.z > 0 ? 0.12 : 0.04
        ctx.strokeStyle = `rgba(91,155,213,${alpha})`
        ctx.stroke()
      }

      // --- Draw parallels ---
      ctx.lineWidth = 0.5
      for (const p of parallels) {
        ctx.beginPath()
        let started = false
        for (const pt3 of p) {
          const r = rotateY(pt3, angle)
          const scale = focal / (focal + r.z)
          const sx = cx + r.x * R * scale
          const sy = cy - r.y * R * scale
          if (!started) {
            ctx.moveTo(sx, sy)
            started = true
          } else {
            ctx.lineTo(sx, sy)
          }
        }
        const mid = rotateY(p[60], angle)
        const alpha = mid.z > 0 ? 0.10 : 0.03
        ctx.strokeStyle = `rgba(91,155,213,${alpha})`
        ctx.stroke()
      }

      // --- Draw equator (slightly brighter) ---
      const eq = parallels[5] // 0° latitude
      if (eq) {
        ctx.beginPath()
        let started = false
        for (const pt3 of eq) {
          const r = rotateY(pt3, angle)
          const scale = focal / (focal + r.z)
          const sx = cx + r.x * R * scale
          const sy = cy - r.y * R * scale
          if (!started) { ctx.moveTo(sx, sy); started = true }
          else { ctx.lineTo(sx, sy) }
        }
        ctx.strokeStyle = 'rgba(91,155,213,0.18)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // --- Draw region markers ---
      const projected: Array<{ sx: number; sy: number; sz: number; r: GlobeRegion }> = []
      for (const rp of regionPts) {
        const r = rotateY(rp.pos, angle)
        const scale = focal / (focal + r.z)
        const sx = cx + r.x * R * scale
        const sy = cy - r.y * R * scale

        projected.push({ sx, sy, sz: r.z, r: rp.region })

        // Only draw front-facing points (z > -0.3 for slight tolerance)
        if (r.z > -0.3) {
          const alpha = Math.min(1, (r.z + 0.3) / 1.3)
          const isHovered = hovered?.name === rp.region.name

          // Outer glow ring
          ctx.beginPath()
          ctx.arc(sx, sy, isHovered ? 9 : 6, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(91,155,213,${(isHovered ? 0.3 : 0.15) * alpha})`
          ctx.fill()

          // Inner dot
          ctx.beginPath()
          ctx.arc(sx, sy, isHovered ? 4 : 2.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(91,155,213,${(isHovered ? 0.9 : 0.7) * alpha})`
          ctx.fill()

          // Pulse ring when hovered
          if (isHovered) {
            const pulsePhase = (Date.now() % 1500) / 1500
            const pulseR = 5 + pulsePhase * 7
            const pulseAlpha = 0.4 * (1 - pulsePhase) * alpha
            ctx.beginPath()
            ctx.arc(sx, sy, pulseR, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(91,155,213,${pulseAlpha})`
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
        }
      }

      projectedRef.current = projected
      rotationRef.current += 0.004
      rafRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [regions, width, height, hovered])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let found: GlobeRegion | null = null
    let minDist = Infinity

    for (const p of projectedRef.current) {
      if (p.sz < -0.2) continue // skip back-facing
      const dx = mx - p.sx
      const dy = my - p.sy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 18 && dist < minDist) {
        minDist = dist
        found = p.r
      }
    }

    if (found !== hovered) {
      setHovered(found as GlobeRegion | null)
      if (found) {
        setTooltipXY({ x: e.clientX, y: e.clientY })
      }
    }
  }

  const handleMouseLeave = () => {
    setHovered(null)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width, height, cursor: hovered ? 'pointer' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'fixed',
            left: tooltipXY.x + 16,
            top: tooltipXY.y - 10,
            background: '#0f0f0f',
            border: '1px solid #1a2740',
            borderRadius: 4,
            padding: '10px 14px',
            zIndex: 1000,
            pointerEvents: 'none',
            minWidth: 160,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>
            {hovered.name}
          </div>
          {hovered.population != null && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
              人口：<span style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#e2e8f0',
                fontWeight: 500,
              }}>{hovered.population.toLocaleString()}</span>
            </div>
          )}
          {hovered.contract_count != null && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
              项目：<span style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#e2e8f0',
                fontWeight: 500,
              }}>{hovered.contract_count.toLocaleString()}</span>
            </div>
          )}
          {hovered.carbon_emissions != null && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
              碳排：<span style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#e2e8f0',
                fontWeight: 500,
              }}>{hovered.carbon_emissions.toLocaleString()} 吨</span>
            </div>
          )}
          {hovered.happiness != null && (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              幸福度：<span style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#e2e8f0',
                fontWeight: 500,
              }}>{hovered.happiness.toFixed(1)}/100</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GlobeView
