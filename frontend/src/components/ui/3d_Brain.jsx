import React, { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Stage } from '@react-three/drei';

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

const Brain3D = () => {
  return (
    <div className="relative w-[120px] h-[80px] group transition-all duration-500 m-0 p-0">
      <Suspense fallback={
        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted font-mono uppercase tracking-widest animate-pulse">
          ...
        </div>
      }>
        <Canvas
          shadows
          camera={{ position: [0, 0.2, 2.0], fov: 25 }} // Slightly further back and up
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent', margin: 0, padding: 0, overflow: 'visible' }}
        >
          <Stage
            intensity={0.4}
            environment="city"
            adjustCamera={false}
            shadows={false}
            center={{ precise: true }}
          >
            <Suspense fallback={null}>
              <Model url="/Resources/NeuroTECH.glb" />
            </Suspense>
          </Stage>

          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate={false}
            enableDamping={true}
            dampingFactor={0.05}
          />
        </Canvas>
      </Suspense>
    </div>
  );
};

export default Brain3D;
