"use client"

import { useRef, useMemo, useEffect, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { Html } from "@react-three/drei"
import LaptopContent from "./laptop-content"
import { motion } from "framer-motion"

export default function LaptopModel({ position }) {
    const groupRef = useRef(null)

    // ----------------------------
    // Keyboard Texture Generation
    // ----------------------------
    const keyboardTexture = useMemo(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 2100
        canvas.height = 1400
        const ctx = canvas.getContext("2d")

        // --- Laptop base gradient (darker than before) ---
        const baseGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
        baseGradient.addColorStop(0, "#0f0f0f") // darker top
        baseGradient.addColorStop(0.5, "#1a1a1a")
        baseGradient.addColorStop(1, "#0a0a0a") // darker bottom
        ctx.fillStyle = baseGradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // --- Keyboard key layout ---
        const keyRows = [
            ["Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Del"],
            ["~`", "1!", "2@", "3#", "4$", "5%", "6^", "7&", "8*", "9(", "0)", "-_", "+=", "Backspace"],
            ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{[", "}]", "|\\"],
            ["Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":;", "\"'", "Enter"],
            ["Shift", "Z", "X", "C", "V", "B", "N", "M", "<,", ">.", "?/", "Shift"],
            ["Fn", "Ctrl", "Opt", "Cmd", "Space", "Cmd", "Opt", "Ctrl"]
        ]

        const startX = 85
        const endX = 2015
        const startY = 75
        const keyBaseSize = 108
        const keyGap = 9
        const rowHeight = keyBaseSize + keyGap
        const cornerRadius = 14

        // Helper to draw rounded rectangle
        const roundRect = (x, y, w, h, r) => {
            ctx.beginPath()
            ctx.moveTo(x + r, y)
            ctx.lineTo(x + w - r, y)
            ctx.quadraticCurveTo(x + w, y, x + w, y + r)
            ctx.lineTo(x + w, y + h - r)
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
            ctx.lineTo(x + r, y + h)
            ctx.quadraticCurveTo(x, y + h, x, y + h - r)
            ctx.lineTo(x, y + r)
            ctx.quadraticCurveTo(x, y, x + r, y)
            ctx.closePath()
        }

        keyRows.forEach((row, rowIndex) => {
            const availableWidth = endX - startX

            // Adjust width for special keys
            const keyWidths = row.map(key => {
                const text = key.includes('!') || key.includes('@') ? key.split('')[0] : key
                if (["Backspace", "Enter"].includes(text)) return 2.1
                if (text === "Tab") return 1.55
                if (text === "Caps Lock") return 1.85
                if (["Shift"].includes(text)) return 2.45
                if (text === "Space") return 6.2
                if (["Fn", "Ctrl", "Opt", "Cmd"].includes(text)) return 1.25
                return 1
            })

            const totalUnits = keyWidths.reduce((a, b) => a + b, 0)
            const totalGaps = (row.length - 1) * keyGap
            const unitWidth = (availableWidth - totalGaps) / totalUnits
            let xOffset = startX

            row.forEach((keyLabel, keyIndex) => {
                const isSymbolKey = /[!@#$%^&*()_+={}\[\]|\\:";'<>?,./]/.test(keyLabel)
                const mainText = isSymbolKey ? keyLabel[0] : keyLabel
                const subText = isSymbolKey ? keyLabel[1] : null

                const width = keyWidths[keyIndex] * unitWidth
                const x = xOffset
                const y = startY + rowIndex * rowHeight

                // Key shadow (depth)
                ctx.fillStyle = "rgba(0,0,0,0.5)"
                roundRect(x + 3, y + 3, width, keyBaseSize, cornerRadius)
                ctx.fill()

                // Key gradient (plastic)
                const keyGrad = ctx.createLinearGradient(x, y, x, y + keyBaseSize)
                keyGrad.addColorStop(0, "#303030")
                keyGrad.addColorStop(0.05, "#383838")
                keyGrad.addColorStop(0.5, "#262626")
                keyGrad.addColorStop(0.95, "#1f1f1f")
                keyGrad.addColorStop(1, "#191919")
                ctx.fillStyle = keyGrad
                roundRect(x, y, width, keyBaseSize, cornerRadius)
                ctx.fill()

                // Top highlight
                ctx.fillStyle = "rgba(255,255,255,0.06)"
                roundRect(x + 2, y + 2, width - 4, 32, cornerRadius - 2)
                ctx.fill()

                // Inner bevel
                ctx.strokeStyle = "rgba(80,80,80,0.4)"
                ctx.lineWidth = 1
                roundRect(x + 1, y + 1, width - 2, keyBaseSize - 2, cornerRadius - 1)
                ctx.stroke()

                // Text
                ctx.shadowColor = "rgba(0,0,0,0.7)"
                ctx.shadowBlur = 2
                ctx.shadowOffsetX = 0
                ctx.shadowOffsetY = 1

                const fontSize = mainText.length > 7 ? 18 : mainText.length > 4 ? 22 : 26
                const subFontSize = 14
                ctx.fillStyle = "#e0e0e0"
                ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText(mainText, x + width / 2, y + keyBaseSize / 2 + 2)

                if (subText) {
                    ctx.font = `${subFontSize}px -apple-system, BlinkMacSystemFont`
                    ctx.fillStyle = "#aaaaaa"
                    ctx.fillText(subText, x + width / 2 + fontSize / 3, y + keyBaseSize / 2 - fontSize / 3)
                }

                ctx.shadowBlur = 0
                xOffset += width + keyGap
            })
        })

        // ----------------------------
        // Trackpad
        // ----------------------------
        const tpX = 1050 - 320
        const tpY = 850
        const tpW = 640
        const tpH = 500

        ctx.strokeStyle = "#333333"
        ctx.lineWidth = 3
        roundRect(tpX - 1, tpY - 1, tpW + 2, tpH + 2, 28)
        ctx.stroke()

        const tpGrad = ctx.createRadialGradient(tpX + tpW / 2, tpY + tpH / 2, 0, tpX + tpW / 2, tpY + tpH / 2, tpW)
        tpGrad.addColorStop(0, "#2a2a2a")
        tpGrad.addColorStop(0.7, "#222222")
        tpGrad.addColorStop(1, "#1a1a1a")
        ctx.fillStyle = tpGrad
        roundRect(tpX, tpY, tpW, tpH, 26)
        ctx.fill()

        ctx.fillStyle = "rgba(255,255,255,0.04)"
        roundRect(tpX + 20, tpY + 20, tpW - 40, 80, 20)
        ctx.fill()

        const texture = new THREE.CanvasTexture(canvas)
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.anisotropy = 16
        return texture
    }, [])

    // ----------------------------
    // Floating Animation
    // ----------------------------
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.06
        }
    })

    const [LCX, setLCX] = useState(getValue(window.innerWidth));

    function getValue(width) {
        if (width < 640) return 0;
        if (width < 1024) return 0;
        if (width < 1440) return 0;
        return 0;
    }

    useEffect(() => {
        function handleResize() {
            setLCX(getValue(window.innerWidth));
        }

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <group ref={groupRef} position={position} rotation={[0, Math.PI, 0]}>
            {/* ----------------------------
                Laptop Base & Body
            ---------------------------- */}
            <mesh position={[0, -0.015, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.3, 0.025, 1.5]} />
                <meshStandardMaterial color="#0a0a0a" metalness={0.85} roughness={0.12} envMapIntensity={1.5} />
            </mesh>

            {/* Inner body layer */}
            <mesh position={[0, 0.02, -0.09]} castShadow receiveShadow>
                <boxGeometry args={[2.3, 0.04, 1.4]} />
                <meshStandardMaterial color="#0a0a0a" metalness={0.8} roughness={0.15} envMapIntensity={1.2} />
            </mesh>

            {/* ----------------------------
                Keyboard
            ---------------------------- */}
            <mesh position={[0, 0.048, -0.02]} rotation={[1.58, 0, 0]} castShadow receiveShadow>
                <planeGeometry args={[2.3, 1.45]} />
                <meshStandardMaterial map={keyboardTexture} metalness={0.5} roughness={0.1} side={THREE.BackSide} />
            </mesh>

            {/* ----------------------------
                Screen Group
            ---------------------------- */}
            <group position={[0, 0, 0.73]} rotation={[0.2, 0, 0]}>
                {/* Back Cover */}
                <mesh position={[0, 0.68, 0.018]} castShadow>
                    <boxGeometry args={[2.3, 1.32, 0.028]} />
                    <meshStandardMaterial color="#0a0a0a" metalness={0.85} roughness={0.1} envMapIntensity={1.5} />
                </mesh>

                {/* Bezel */}
                <mesh position={[0, 0.68, -0.002]} castShadow>
                    <boxGeometry args={[2.18, 1.33, 0.012]} />
                    <meshStandardMaterial color="#000" metalness={0.7} roughness={0.2} />
                </mesh>

                {/* Screen with HTML content */}
                <motion.mesh position={[LCX, 0.68, 0]} rotation={[0, Math.PI, 0]}>
                    <planeGeometry args={[2.1, 1.22]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.4} metalness={0.05} roughness={0.08} side={THREE.BackSide} />
                    <Html transform distanceFactor={1} occlude={false} zIndexRange={[100, 0]} className="w-[880px] h-[480px] overflow-hidden rounded-md">
                        <LaptopContent />
                    </Html>
                </motion.mesh>

                {/* Webcam and status lights */}
                <mesh position={[0, 1.33, -0.005]} castShadow>
                    <cylinderGeometry args={[0.018, 0.018, 0.01, 20]} />
                    <meshStandardMaterial color="#0a0a0a" metalness={0.6} roughness={0.2} />
                </mesh>
                <mesh position={[0, 1.33, -0.01]} castShadow>
                    <cylinderGeometry args={[0.01, 0.01, 0.006, 20]} />
                    <meshStandardMaterial color="#1a3a5a" metalness={0.9} roughness={0.05} emissive="#0a2a4a" emissiveIntensity={0.3} />
                </mesh>
                <mesh position={[0.04, 1.33, -0.01]}>
                    <sphereGeometry args={[0.004, 12, 12]} />
                    <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.8} />
                </mesh>
            </group>

            {/* ----------------------------
                Rubber feet
            ---------------------------- */}
            {[[-0.95, -0.025, -0.65], [0.95, -0.025, -0.65], [-0.95, -0.025, 0.65], [0.95, -0.025, 0.65]].map((pos, i) => (
                <mesh key={i} position={pos}>
                    <cylinderGeometry args={[0.035, 0.035, 0.012, 12]} />
                    <meshStandardMaterial color="#0a0a0a" metalness={0.05} roughness={0.95} />
                </mesh>
            ))}

            {/* ----------------------------
                Vents
            ---------------------------- */}
            {[-1.1, 1.1].map((x, i) => (
                <group key={`vent-${i}`}>
                    {[0, 1, 2, 3, 4, 5].map(j => (
                        <mesh key={j} position={[x, 0.025, -0.4 + j * 0.15]} rotation={[0, Math.PI / 2, 0]}>
                            <planeGeometry args={[0.08, 0.015]} />
                            <meshStandardMaterial color="#0a0a0a" metalness={0.4} roughness={0.6} />
                        </mesh>
                    ))}
                </group>
            ))}

            {/* ----------------------------
                Ports
            ---------------------------- */}
            {[0, 1].map(i => (
                <mesh key={`port-${i}`} position={[-1.13, 0.025, -0.2 + i * 0.15]} rotation={[0, Math.PI / 2, 0]}>
                    <planeGeometry args={[0.06, 0.025]} />
                    <meshStandardMaterial color="#0a0a0a" metalness={0.5} roughness={0.3} />
                </mesh>
            ))}
        </group>
    )
}
