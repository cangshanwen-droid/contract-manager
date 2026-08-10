import React from 'react'

const GipfelPlatform: React.FC = () => {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <webview
        src="https://106.54.26.86"
        style={{ width: '100%', height: '100%', border: 'none' }}
        // @ts-ignore — Electron webview tag
      />
    </div>
  )
}

export default GipfelPlatform
