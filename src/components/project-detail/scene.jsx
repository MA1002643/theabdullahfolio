"use client"

// The entire WebGL scene for /projects/[id] — Canvas, camera, lights, and the
// tree/laptop models. This module is the ONLY place in the route that imports
// three / @react-three/*, and it is loaded exclusively through the dynamic
// (ssr:false) wrapper in scene-loader.jsx. Keeping the heavy imports isolated
// here is what lets the page shell (background, title, aurora) commit and
// paint while this chunk is still downloading (issue #83). Do not import this
// file directly from the page — that would fold three.js back into the
// route's entry chunk and reintroduce the navigation freeze.

import { Canvas } from "@react-three/fiber"
import { PerspectiveCamera, OrbitControls, Environment } from "@react-three/drei"
import { useRef, useEffect } from "react"
import * as THREE from "three"
import RealisticTree from "@/components/project-detail/tree-stump"
import LaptopModel from "@/components/project-detail/laptop-model"
import { isSoftwareRenderer } from "@/lib/softwareRenderer"

// No GPU (software WebGL): draw on demand at 1x instead of every frame, so the
// laptop holds still and the main thread stays free for the page around it.
// The only per-frame motion is a 0.06-unit float, which a CPU renderer was
// paying for with the whole page's responsiveness. See softwareRenderer.js.
function settleOnSoftware(state) {
    if (!isSoftwareRenderer(state.gl.getContext())) return
    state.setDpr(1)
    state.setFrameloop("demand")
}

function Scene({ links, copy }) {
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

            {/* Self-hosted (issue #92). `preset="night"` made every visitor's
                browser fetch this file from raw.githack.com, a free dev CDN:
                an undisclosed third party receiving each visitor's IP, and a
                single point of failure for the scene. Found by the e2e suite's
                hermetic network, which blocks every foreign origin. Same file,
                byte for byte: drei-assets@456060a, hdri/dikhololo_night_1k.hdr. */}
            <Environment files="/hdri/dikhololo_night_1k.hdr" />

            {/* Models */}
            <RealisticTree position={[0, -2.5, 0]} />
            <LaptopModel position={[0, -1.1, 0]} links={links} copy={copy} />

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

// `copy` is the laptop screen's translated text (see useScreenCopy in
// scene-loader.jsx); it only passes through on its way to the <Html> root.
export default function ProjectScene({ links, copy }) {
    return (
        <Canvas
            shadows
            gl={{
                antialias: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.2,
            }}
            className="absolute inset-0 w-full h-full overflow-hidden z-[0]"
            onCreated={settleOnSoftware}
        >
            <Scene links={links} copy={copy} />
        </Canvas>
    )
}
