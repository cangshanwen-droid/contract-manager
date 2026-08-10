import React from 'react'
import { tokens as T } from '../styles/design-tokens'
import { Button, Typography } from 'antd'

interface Props {
  children: React.ReactNode
}
interface State {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Render Error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#0a0e17',
          color: '#e8edf5', padding: 24
        }}>
          <Typography.Title level={4} style={{ color: '#C44040' }}>页面出现错误</Typography.Title>
          <Typography.Text style={{ color: T.textSecondary, marginBottom: 16, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message}
          </Typography.Text>
          <Button type="primary" onClick={() => { this.setState({ hasError: false }); window.location.reload() }}>
            重新加载
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
