"use client"

import { Canvas } from "@react-three/fiber"
import { PerspectiveCamera, OrbitControls, Environment } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useRef, useEffect } from "react"
import { motion } from "framer-motion"
import * as THREE from "three"
import Image from "next/image"
import { projectsData } from "@/app/data"
import RealisticTree from "@/components/project-detail/tree-stump"
import LaptopModel from "@/components/project-detail/laptop-model"
import bg from "../../../../../public/background/home-bg.png"
import GlowingTitle from "@/components/project-detail/glowing-project-name"
import AuroraParallaxBackground from "@/components/project-detail/aurora-bg"
import LanternSweep from "@/components/project-detail/lantern-sweep"

// Orange Glowing Rounded Particles
function OrangeParticles() {
    const particlesRef = useRef(null)

    useFrame((state) => {
        if (particlesRef.current) {
            particlesRef.current.rotation.y += 0.002
            particlesRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.3
        }
    })

    const count = 200
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
        const radius = 9999999
        const angle = (i / count) * Math.PI * 2
        const height = -2 + Math.random() * 6

        positions[i * 3] = Math.cos(angle) * radius
        positions[i * 3 + 1] = height
        positions[i * 3 + 2] = Math.sin(angle) * radius

        sizes[i] = Math.random() * 1.5 + 0.8
    }

    return (
        <points ref={particlesRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={2} />
                <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
            </bufferGeometry>
            <pointsMaterial
                size={0.25}
                color="#ff6b35"
                emissive="#ff4500"
                emissiveIntensity={3}
                transparent
                opacity={0.9}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                sizeAttenuation={true}
            />
        </points>
    )
}

function Scene() {
    const cameraRef = useRef(null)

    useEffect(() => {
        if (cameraRef.current) {
            cameraRef.current.position.set(0, 4, 7)
            cameraRef.current.lookAt(0, 1, 0)
        }
    }, [])

    return (
        <>
            <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 4, 7]} fov={30} />

            {/* Soft warm lighting */}
            <directionalLight position={[5, 10, 5]} intensity={4} castShadow color="#f9d174" />
            <ambientLight intensity={4} color="#f9d174" />
            <pointLight position={[0, 6, 0]} intensity={4} color="#f9d174" />

            {/* Fog for depth */}
            {/* <fog attach="fog" args={["#1a0d00", 8, 25]} /> */}

            <Environment preset="night" />

            {/* Models */}
            <RealisticTree position={[0, -2.5, 0]} />
            <LaptopModel position={[0, -1.1, 0]} />

            {/* Orange glowing rounded particles */}
            {/* <OrangeParticles /> */}

            {/* OrbitControls - Never go below floor */}
            <OrbitControls
                enablePan={false}
                enableZoom={false}
                enableRotate={false}
                // autoRotate
                autoRotateSpeed={1.2}
                minDistance={4}
                maxDistance={14}
                minAzimuthAngle={-Math.PI / 6}
                maxAzimuthAngle={Math.PI / 6}
                minPolarAngle={Math.PI / 3}
                maxPolarAngle={Math.PI / 2.1}  // Locked above stump
            />

            {/* Dark reflective floor */}
            {/* <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial color="#0a0500" metalness={0.9} roughness={0.1} />
            </mesh> */}
        </>
    )
}

export default function ThreeDScene({ params }) {
    const { id } = params
    const project = projectsData.find((p) => p.id === parseInt(id))

    if (!project) {
        return (
            <div className="w-full h-screen flex items-center justify-center bg-black text-[#ff6d05] text-3xl">
                Project not found.
            </div>
        )
    }

    return (
        <>
            {/* Your Original Background Image - Full Screen */}
            <Image
                src={bg}
                alt="background"
                fill
                priority
                className="fixed top-0 left-0 w-full h-full object-cover object-center -z-10"
                quality={100}
            />
            <div
                className="relative w-full h-screen overflow-hidden"
                style={{
                    height: "100vh",
                    width: "100vw",
                    position: "fixed",
                    top: 0,
                    left: 0,
                }}
            >

                {/* Aurora + Lantern placed BETWEEN background and canvas */}
                <div className="absolute inset-0 z-[ -5 ] pointer-events-none">
                    <AuroraParallaxBackground />
                    <LanternSweep />
                </div>

                {/* 3D Canvas */}
                <Canvas
                    shadows
                    gl={{
                        antialias: true,
                        toneMapping: THREE.ACESFilmicToneMapping,
                        toneMappingExposure: 1.2,
                    }}
                    className="absolute inset-0 w-full h-full overflow-hidden z-[0]"
                >
                    <Scene />
                </Canvas>

                {/* Overlay UI */}
                <section className="absolute top-14 sm:top-20 md:top-10 left-1/2 -translate-x-1/2 flex flex-col items-center justify-start text-center space-y-2 px-4 md:px-0 z-20">
                    <GlowingTitle text={project.name || 'Project Name'} />
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 1 }}
                        className="text-[1.1rem] sm:text-[1.3rem] md:text-[1.5rem] !font-thin text-shadow-neon-light-orange"
                    >
                        {project.description || 'Innovative, fast, and futuristic web solutions.'}
                    </motion.p>
                </section>
            </div>

        </>
    )
}