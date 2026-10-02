import { Component } from 'react'
import type { ReactNode } from 'react'
export default class ErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div role="alert" className="gallery-error">Community tools could not open. The campus is still available. <button onClick={() => { this.props.onClose(); this.setState({ failed: false }) }}>Close</button><button onClick={() => this.setState({ failed: false })}>Retry</button></div> : this.props.children }
}
