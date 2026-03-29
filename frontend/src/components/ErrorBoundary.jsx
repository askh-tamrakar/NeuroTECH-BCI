import React from 'react';
import { AlertCircle, RefreshCw, Cpu } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const isWebGL = this.state.error?.toString().toLowerCase().includes('webgl');
            
            return (
                <div style={{ 
                    padding: '40px', 
                    color: '#f8fafc', 
                    background: '#0f172a', 
                    minHeight: '100vh', 
                    fontFamily: 'Inter, sans-serif',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center'
                }}>
                    <div style={{ background: '#1e293b', padding: '40px', borderRadius: '16px', border: '1px solid #ef4444', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                            <AlertCircle size={64} color="#ef4444" />
                        </div>
                        
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Dashboard Rendering Error</h2>
                        <p style={{ color: '#94a3b8', marginBottom: '24px', lineHeight: '1.6' }}>
                            Something went wrong while rendering the interface. This is often caused by a failed graphics context or a missing resource.
                        </p>

                        {isWebGL && (
                            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '8px', border: '1px solid #3b82f6', marginBottom: '24px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontWeight: 'bold', marginBottom: '8px' }}>
                                    <Cpu size={18} />
                                    <span>WebGL Issue Detected</span>
                                </div>
                                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                                    Your browser failed to create a WebGL context. Please ensure <strong>Hardware Acceleration</strong> is enabled in your browser settings.
                                </p>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button 
                                onClick={() => window.location.reload()}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    fontWeight: 'bold',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                            >
                                <RefreshCw size={18} />
                                Reload Application
                            </button>
                        </div>

                        <details style={{ marginTop: '30px', textAlign: 'left', background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
                            <summary style={{ padding: '4px', opacity: 0.7 }}>View Technical Details</summary>
                            <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                                <code style={{ color: '#ef4444' }}>{this.state.error && this.state.error.toString()}</code>
                                <pre style={{ marginTop: '10px', fontSize: '10px', opacity: 0.5 }}>
                                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                                </pre>
                            </div>
                        </details>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;

