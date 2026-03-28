"use client"

import { useRef, useMemo } from "react"
import * as THREE from "three"

export default function RealisticTree({ position }) {
    const groupRef = useRef(null)

    const barkTexture = useMemo(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 1024
        canvas.height = 512
        const ctx = canvas.getContext("2d")

        // Rich bark base with gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
        gradient.addColorStop(0, "#5a4a38")
        gradient.addColorStop(0.5, "#4a3828")
        gradient.addColorStop(1, "#3a2818")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Deep vertical grooves
        for (let i = 0; i < 40; i++) {
            const x = (i / 40) * canvas.width + Math.random() * 20
            ctx.strokeStyle = `rgba(0, 0, 0, ${Math.random() * 0.5 + 0.3})`
            ctx.lineWidth = Math.random() * 6 + 3
            ctx.beginPath()
            ctx.moveTo(x, 0)
            const segments = 15
            for (let j = 0; j <= segments; j++) {
                const y = (j / segments) * canvas.height
                const offset = Math.sin(j * 0.5) * (Math.random() * 8 + 4)
                ctx.lineTo(x + offset, y)
            }
            ctx.stroke()
        }

        // Horizontal cracks and ridges
        for (let i = 0; i < 80; i++) {
            const y = Math.random() * canvas.height
            const x = Math.random() * canvas.width
            const width = Math.random() * 60 + 30
            ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.4 + 0.2})`
            ctx.fillRect(x, y, width, Math.random() * 3 + 1)
        }

        // Fine texture detail
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * canvas.width
            const y = Math.random() * canvas.height
            const size = Math.random() * 2 + 0.5
            ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.3})`
            ctx.fillRect(x, y, size, size)
        }

        // Lighter patches for variation
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * canvas.width
            const y = Math.random() * canvas.height
            const size = Math.random() * 10 + 5
            ctx.fillStyle = `rgba(139, 119, 101, ${Math.random() * 0.15})`
            ctx.fillRect(x, y, size, size * 0.5)
        }

        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(2, 3)
        return texture
    }, [])

    const topTexture = useMemo(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 512
        canvas.height = 512
        const ctx = canvas.getContext("2d")

        // Wood grain base
        const gradient = ctx.createRadialGradient(256, 256, 50, 256, 256, 256)
        gradient.addColorStop(0, "#8b7355")
        gradient.addColorStop(0.5, "#6b5345")
        gradient.addColorStop(1, "#5a4535")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Growth rings
        for (let i = 1; i < 20; i++) {
            const radius = (i / 20) * 250 + Math.random() * 10
            ctx.strokeStyle = `rgba(0, 0, 0, ${Math.random() * 0.3 + 0.15})`
            ctx.lineWidth = Math.random() * 3 + 1
            ctx.beginPath()
            ctx.arc(256 + Math.random() * 20 - 10, 256 + Math.random() * 20 - 10, radius, 0, Math.PI * 2)
            ctx.stroke()
        }

        // Radial cracks
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3
            ctx.strokeStyle = `rgba(0, 0, 0, ${Math.random() * 0.4 + 0.2})`
            ctx.lineWidth = Math.random() * 4 + 2
            ctx.beginPath()
            ctx.moveTo(256, 256)
            const len = Math.random() * 150 + 100
            ctx.lineTo(256 + Math.cos(angle) * len, 256 + Math.sin(angle) * len)
            ctx.stroke()
        }

        // Weathering spots
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * canvas.width
            const y = Math.random() * canvas.height
            const size = Math.random() * 8 + 2
            ctx.fillStyle = `rgba(${Math.random() * 40 + 40}, ${Math.random() * 30 + 20}, 0, ${Math.random() * 0.4})`
            ctx.beginPath()
            ctx.arc(x, y, size, 0, Math.PI * 2)
            ctx.fill()
        }

        const texture = new THREE.CanvasTexture(canvas)
        return texture
    }, [])

    return (
        <group ref={groupRef} position={position}>
            {/* Main trunk - irregular shape with visible wood grain */}
            <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
                <cylinderGeometry args={[0.72, 0.88, 1.4, 20, 15]} />
                <meshStandardMaterial
                    map={barkTexture}
                    color="#5a4a38"
                    metalness={0.05}
                    roughness={0.98}
                    normalScale={new THREE.Vector2(0.8, 0.8)}
                />
            </mesh>

            {/* Cut top surface showing wood rings */}
            <mesh castShadow receiveShadow position={[0, 1.3, 0]} rotation={[0, Math.random() * Math.PI * 2, 0]}>
                <cylinderGeometry args={[0.72, 0.72, 0.05, 32]} />
                <meshStandardMaterial
                    map={topTexture}
                    color="#7a6a5a"
                    metalness={0.0}
                    roughness={0.85}
                />
            </mesh>

            {/* Bottom surface */}
            <mesh receiveShadow position={[0, -0.1, 0]} rotation={[Math.PI, 0, 0]}>
                <cylinderGeometry args={[0.88, 0.88, 0.05, 32]} />
                <meshStandardMaterial
                    map={topTexture}
                    color="#4a3828"
                    metalness={0.0}
                    roughness={0.95}
                />
            </mesh>

        </group>
    )
}