import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode

  title?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in page:', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-xl text-rose-500">!</span>
        <p className="font-medium text-rose-700">{this.props.title ?? 'Something went wrong loading this page'}</p>
        <p className="mt-1 max-w-sm text-sm text-rose-600">{this.state.error.message}</p>
        <button
          onClick={this.reset}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    )
  }
}
