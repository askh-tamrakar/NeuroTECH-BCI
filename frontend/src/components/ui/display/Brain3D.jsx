import React, { Suspense, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Stage } from '@react-three/drei';
import { Brain } from 'lucide-react';

function Model({ url }) {
  const { scene } = useGLTF(url);
  const meshRef = useRef();

  // Smooth rotation
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <primitive
      ref={meshRef}
      object={scene}
      position={[0, -0.2, 0]} // Shift model down slightly
    />
  );
}

// Simple Error Boundary for the 3D Canvas
class ThreeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const Brain3D = React.memo(() => {
    const [webGLAvailable, setWebGLAvailable] = useState(true);

    useEffect(() => {
        const checkWebGL = () => {
            try {
                const canvas = document.createElement('canvas');
                const isAvailable = !!(window.WebGLRenderingContext && 
                    (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
                setWebGLAvailable(isAvailable);
            } catch (e) {
                setWebGLAvailable(false);
            }
        };
        checkWebGL();
    }, []);

    const fallbackUI = (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted group-hover:text-primary transition-colors">
            <Brain size={32} strokeWidth={1.5} className="mb-1 opacity-50" />
            <span className="text-[9px] font-bold uppercase tracking-tighter opacity-40">3D Disabled</span>
        </div>
    );

    if (!webGLAvailable) {
        return (
            <div className="relative w-[160px] h-[100px] m-0 p-0 flex items-center justify-center cursor-help" title="WebGL not supported or hardware acceleration disabled">
                {fallbackUI}
            </div>
        );
    }

    return (
        <div className="relative w-[160px] h-[100px] group transition-all duration-500 m-0 p-0">
            <ThreeErrorBoundary fallback={fallbackUI}>
                <Suspense fallback={
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted font-mono uppercase tracking-widest animate-pulse">
                        ...
                    </div>
                }>
                    <Canvas
                        shadows
                        camera={{ position: [0, 0.2, 1.6], fov: 25 }} // Moved camera closer for a larger appearance
                        gl={{ antialias: true, alpha: true }}
                        style={{ background: 'transparent', margin: 0, padding: 0, overflow: 'visible' }}
                        onError={(e) => {
                            console.warn("Canvas WebGL Error:", e);
                            setWebGLAvailable(false);
                        }}
                    >
                        <ambientLight intensity={1.5} />
                        <directionalLight position={[10, 10, 5]} intensity={2.0} />
                        <Suspense fallback={null}>
                            <Model url="/Resources/NeuroTECH.glb" />
                        </Suspense>

                        <OrbitControls
                            enableZoom={false}
                            enablePan={false}
                            autoRotate={false}
                            enableDamping={true}
                            dampingFactor={0.05}
                        />
                    </Canvas>
                </Suspense>
            </ThreeErrorBoundary>
        </div>
    );
});

export default Brain3D;

// Preload the model to ensure it's cached correctly (safe even if WebGL fails later)
try {
    useGLTF.preload('/Resources/NeuroTECH.glb');
} catch (e) {}

