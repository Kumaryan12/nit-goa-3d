import { Component } from 'react'
import type { ReactNode } from 'react'
export default class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <main className="campus-load-failure" role="alert"><span className="eyebrow">NITG EXPLORED</span><h1>Let’s get you back to campus.</h1><p>The page could not finish loading. Reload to reconnect and get the latest campus version.</p><button className="navigate-button" onClick={() => window.location.reload()}>Reload campus</button></main> : this.props.children
  }
}
