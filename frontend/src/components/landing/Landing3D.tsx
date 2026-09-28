import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'

type SceneProps = { active: boolean; reduced: boolean }

class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function usePointer() {
  const pointer = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  return pointer
}

function Rig({ children, strength = 1 }: { children: ReactNode; strength?: number }) {
  const group = useRef<THREE.Group>(null)
  const pointer = usePointer()
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, pointer.current.x * 0.35 * strength, 0.04)
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, pointer.current.y * 0.2 * strength, 0.04)
  })
  return <group ref={group}>{children}</group>
}

function SceneCanvas({ active, children, camera = 8 }: { active: boolean; children: ReactNode; camera?: number }) {
  const supported = useMemo(hasWebGL, [])
  if (!supported) return null
  return (
    <SilentBoundary>
      <Canvas
        frameloop={active ? 'always' : 'never'}
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, camera], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ pointerEvents: 'none' }}
      >
        {children}
      </Canvas>
    </SilentBoundary>
  )
}

function useDotTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.85)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 64, 64)
    }
    return new THREE.CanvasTexture(canvas)
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function ParticleGalaxy({ count, speed }: { count: number; speed: number }) {
  const points = useRef<THREE.Points>(null)
  const dot = useDotTexture()
  const [positions, colors] = useMemo(() => {
    const p = new Float32Array(count * 3)
    const c = new Float32Array(count * 3)
    const teal = new THREE.Color('#2dd4bf')
    const mint = new THREE.Color('#ccfbf1')
    const amber = new THREE.Color('#fbbf24')
    for (let i = 0; i < count; i++) {
      const r = 3.4 + Math.random() * 5.5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      p[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6
      p[i * 3 + 2] = r * Math.cos(phi) - 2
      const roll = Math.random()
      const color = roll < 0.12 ? amber : roll < 0.3 ? mint : teal
      c[i * 3] = color.r
      c[i * 3 + 1] = color.g
      c[i * 3 + 2] = color.b
    }
    return [p, c]
  }, [count])

  useFrame((_, dt) => {
    if (!points.current) return
    points.current.rotation.y += dt * 0.04 * speed
    points.current.rotation.z += dt * 0.008 * speed
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={dot}
        size={0.11}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function OrbitRing({
  radius,
  tilt,
  speed,
  color,
}: {
  radius: number
  tilt: [number, number, number]
  speed: number
  color: string
}) {
  const spin = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.z += dt * speed
  })
  return (
    <group rotation={tilt}>
      <group ref={spin}>
        <mesh>
          <torusGeometry args={[radius, 0.012, 8, 200]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
        <mesh position={[radius, 0, 0]}>
          <sphereGeometry args={[0.09, 20, 20]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[-radius, 0, 0]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  )
}

function IntelligenceCore({ speed }: { speed: number }) {
  const shell = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    if (shell.current) {
      shell.current.rotation.x += dt * 0.12 * speed
      shell.current.rotation.y += dt * 0.18 * speed
    }
    if (core.current) {
      core.current.rotation.y -= dt * 0.35 * speed
      core.current.rotation.z += dt * 0.1 * speed
      core.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.045 * speed)
    }
    if (halo.current) {
      const material = halo.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.12 + Math.sin(t * 1.6) * 0.05 * speed
    }
  })
  return (
    <group>
      <mesh ref={halo}>
        <sphereGeometry args={[2.05, 48, 48]} />
        <meshBasicMaterial color="#14b8a6" transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.62, 1]} />
        <meshBasicMaterial color="#5eead4" wireframe transparent opacity={0.6} />
      </mesh>
      <mesh ref={core}>
        <icosahedronGeometry args={[1.08, 3]} />
        <meshStandardMaterial color="#0f766e" emissive="#14b8a6" emissiveIntensity={0.55} roughness={0.2} metalness={0.7} flatShading />
      </mesh>
      <OrbitRing radius={2.5} tilt={[1.2, 0.3, 0]} speed={0.5 * speed} color="#2dd4bf" />
      <OrbitRing radius={2.95} tilt={[-0.9, 0.6, 0.4]} speed={-0.35 * speed} color="#fbbf24" />
      <OrbitRing radius={3.4} tilt={[0.3, -0.8, 0.9]} speed={0.25 * speed} color="#99f6e4" />
    </group>
  )
}

function DataWave({ speed }: { speed: number }) {
  const points = useRef<THREE.Points>(null)
  const dot = useDotTexture()
  const cols = 90
  const rows = 34
  const gap = 0.3
  const base = useMemo(() => {
    const p = new Float32Array(cols * rows * 3)
    let k = 0
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        p[k++] = (i - cols / 2) * gap
        p[k++] = 0
        p[k++] = (j - rows / 2) * gap
      }
    }
    return p
  }, [])
  const positions = useMemo(() => base.slice(), [base])

  useFrame((state) => {
    const geometry = points.current?.geometry
    if (!geometry) return
    const t = state.clock.elapsedTime * 0.8 * speed
    const arr = geometry.attributes.position.array as Float32Array
    for (let k = 0; k < arr.length; k += 3) {
      const x = base[k]
      const z = base[k + 2]
      arr[k + 1] = Math.sin(x * 0.5 + t) * 0.32 + Math.cos(z * 0.7 + t * 0.9) * 0.22 + Math.sin((x + z) * 0.25 + t * 0.6) * 0.18
    }
    geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={points} position={[0, -3.1, -1.5]} rotation={[0.22, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={dot}
        size={0.085}
        color="#2dd4bf"
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function ResponsiveCore({ speed }: { speed: number }) {
  const width = useThree((s) => s.size.width)
  const wide = width >= 1024
  const float = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (float.current) float.current.position.y = (wide ? 0.1 : 1.5) + Math.sin(state.clock.elapsedTime * 0.9) * 0.15 * speed
  })
  return (
    <group ref={float} position={[wide ? 2.9 : 0, wide ? 0.1 : 1.5, wide ? 0 : -2.5]} scale={wide ? 1 : 0.72}>
      <IntelligenceCore speed={speed} />
    </group>
  )
}

export function HeroScene({ active, reduced }: SceneProps) {
  const speed = reduced ? 0.15 : 1
  return (
    <SceneCanvas active={active} camera={9}>
      <ambientLight intensity={0.35} />
      <pointLight position={[4, 3, 5]} intensity={60} color="#5eead4" />
      <pointLight position={[-5, -2, 3]} intensity={30} color="#fbbf24" />
      <Rig strength={reduced ? 0 : 1}>
        <ParticleGalaxy count={2200} speed={speed} />
        <ResponsiveCore speed={speed} />
        <DataWave speed={speed} />
      </Rig>
    </SceneCanvas>
  )
}

const LAYERS = [4, 7, 7, 3]

function NeuralNet({ speed }: { speed: number }) {
  const pulses = useRef<THREE.InstancedMesh>(null)
  const group = useRef<THREE.Group>(null)

  const { nodes, edges, edgePositions } = useMemo(() => {
    const nodeList: { position: THREE.Vector3; layer: number }[] = []
    LAYERS.forEach((count, layer) => {
      for (let n = 0; n < count; n++) {
        nodeList.push({
          position: new THREE.Vector3((layer - (LAYERS.length - 1) / 2) * 2, (n - (count - 1) / 2) * 0.78, Math.sin(n * 1.7 + layer) * 0.55),
          layer,
        })
      }
    })
    const edgeList: [THREE.Vector3, THREE.Vector3][] = []
    for (let layer = 0; layer < LAYERS.length - 1; layer++) {
      const from = nodeList.filter((n) => n.layer === layer)
      const to = nodeList.filter((n) => n.layer === layer + 1)
      from.forEach((a) => to.forEach((b) => edgeList.push([a.position, b.position])))
    }
    const flat = new Float32Array(edgeList.length * 6)
    edgeList.forEach(([a, b], i) => {
      flat.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)
    })
    return { nodes: nodeList, edges: edgeList, edgePositions: flat }
  }, [])

  const pulseCount = 26
  const pulseState = useMemo(
    () => Array.from({ length: pulseCount }, (_, i) => ({ edge: (i * 7) % edges.length, offset: i / pulseCount })),
    [edges.length],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((state, dt) => {
    if (group.current) group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.45 * speed
    const mesh = pulses.current
    if (!mesh) return
    pulseState.forEach((p, i) => {
      p.offset += dt * 0.55 * speed
      if (p.offset >= 1) {
        p.offset -= 1
        p.edge = Math.floor(Math.random() * edges.length)
      }
      const [a, b] = edges[p.edge]
      dummy.position.lerpVectors(a, b, p.offset)
      dummy.scale.setScalar(0.6 + Math.sin(p.offset * Math.PI) * 0.8)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edgePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#2dd4bf" transparent opacity={0.18} />
      </lineSegments>
      {nodes.map((n, i) => (
        <mesh key={i} position={n.position}>
          <sphereGeometry args={[n.layer === LAYERS.length - 1 ? 0.16 : 0.12, 24, 24]} />
          <meshStandardMaterial
            color={n.layer === LAYERS.length - 1 ? '#fbbf24' : '#14b8a6'}
            emissive={n.layer === LAYERS.length - 1 ? '#f59e0b' : '#2dd4bf'}
            emissiveIntensity={0.9}
            roughness={0.3}
            metalness={0.4}
          />
        </mesh>
      ))}
      <instancedMesh ref={pulses} args={[undefined, undefined, pulseCount]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color="#ecfeff" />
      </instancedMesh>
    </group>
  )
}

export function NeuralScene({ active, reduced }: SceneProps) {
  return (
    <SceneCanvas active={active} camera={8.5}>
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 4, 6]} intensity={50} color="#5eead4" />
      <Rig strength={reduced ? 0 : 0.8}>
        <NeuralNet speed={reduced ? 0.15 : 1} />
      </Rig>
    </SceneCanvas>
  )
}
