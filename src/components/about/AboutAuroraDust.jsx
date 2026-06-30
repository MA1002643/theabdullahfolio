'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── About background: scroll-reactive contact aurora ──────────────────────────
// Reproduces the contact page's aurora (AuroraBackground) — a domain-warped fBm
// amber field that drifts and bends toward the cursor — and makes the WHOLE field
// react to scroll: a gentle vertical parallax shifts the aurora as the page
// scrolls and eases to rest when scrolling stops. The earlier discrete dust
// motes (a GPU points field) were removed; the soft aurora "dust" itself now
// carries the scroll reaction. Composited mix-blend:screen by the mount.

// ── Aurora plane (clip-space quad; vertex shader bypasses the camera) ─────────
// NOTE: AURORA_VERT / AURORA_FRAG started as a verbatim clone of
// contact/AuroraBackground.jsx (so the contact hover-bend look is preserved),
// with one deliberate divergence here: the `uScroll` uniform + the `p.y`
// parallax shift that makes the about-page aurora scroll-reactive. Keep the
// shared parts in sync with the contact sibling if that shader ever changes.
const AURORA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const AURORA_FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uPointer;     // cursor, 0..1 (origin bottom-left)
  uniform vec2  uResolution;
  uniform float uScroll;      // eased, normalized scroll offset (vertical parallax)

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec2(11.7, 3.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 uv = vUv;
    vec2 uva = vec2(uv.x * aspect.x, uv.y);
    float t = uTime * 0.05;

    // Bend the field gently toward the cursor (the contact page's hover effect).
    vec2 pc = vec2(uPointer.x * aspect.x, uPointer.y);
    vec2 toC = uva - pc;
    float cd = length(toC);
    uva -= normalize(toC + 1e-4) * 0.05 * smoothstep(0.7, 0.0, cd);

    // Domain-warped fBm -> flowing soft field. The scroll parallax (uScroll)
    // shifts the whole field vertically so the aurora visibly drifts as the page
    // scrolls. fBm is infinite + seamless, so this can translate any distance
    // with no wrap or popping.
    vec2 p = uva * 1.8;
    p.y += uScroll;
    float w1 = fbm(p + vec2(0.0, t));
    float w2 = fbm(p + vec2(t * 0.7, 0.0) + 5.2);
    vec2 q = p + vec2(w1, w2) * 0.8;
    float field = fbm(q + vec2(-t * 0.4, t * 0.2));

    // Warm palette: deep maroon -> ember -> amber -> gold highlight.
    vec3 c0 = vec3(0.18, 0.03, 0.05);
    vec3 c1 = vec3(0.80, 0.20, 0.02);
    vec3 c2 = vec3(1.00, 0.45, 0.06);
    vec3 c3 = vec3(1.00, 0.72, 0.30);
    vec3 col = c0;
    col = mix(col, c1, smoothstep(0.25, 0.55, field));
    col = mix(col, c2, smoothstep(0.45, 0.75, field));
    col = mix(col, c3, smoothstep(0.70, 0.95, field));

    // A flowing aurora ribbon riding the warped field.
    float ribbon = sin((q.y * 1.6 + field * 4.0 + t * 1.5) * 3.14159);
    ribbon = smoothstep(0.55, 1.0, ribbon);
    col += c3 * ribbon * 0.25;

    // Denser low, softer toward the top.
    float vfall = smoothstep(1.1, -0.05, uv.y);
    col *= vfall;

    // Faint warmth pooling around the cursor.
    col += c2 * smoothstep(0.35, 0.0, cd) * 0.06;

    col *= 0.7;
    col = clamp(col, 0.0, 1.0);
    float a = max(col.r, max(col.g, col.b));
    gl_FragColor = vec4(col, a);
  }
`;

function AuroraPlane({ pointer, scroll }) {
  const materialRef = useRef(null);
  const eased = useRef([0.5, 0.5]); // eased pointer so the bend glides
  const scrollOffset = useRef(0); // eased vertical parallax offset (in fBm units)
  // window.innerHeight is a layout-flushing read — cache it and refresh on
  // resize rather than reading it every frame.
  const vhRef = useRef(typeof window !== 'undefined' ? window.innerHeight || 1 : 1);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      vhRef.current = window.innerHeight || 1;
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uScroll: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const mat = materialRef.current;
    if (!mat) return;
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const k = Math.min(1, delta * 2.5);
    eased.current[0] += (pointer.current.x - eased.current[0]) * k;
    eased.current[1] += (pointer.current.y - eased.current[1]) * k;
    u.uPointer.value.set(eased.current[0], eased.current[1]);
    u.uResolution.value.set(state.size.width, state.size.height);

    // Scroll parallax: ease a vertical field offset toward the ABSOLUTE scroll
    // position (normalized by viewport height) so the aurora drifts as the page
    // scrolls and glides to rest when it stops. The 0.6 gain keeps it gentle
    // relative to the field scale (p = uva * 1.8) — a restrained drift, not a
    // jarring sweep. The exp-decay ease de-jitters wheel steps without lagging.
    const target = (scroll.current.y / vhRef.current) * 0.6;
    scrollOffset.current += (target - scrollOffset.current) * (1 - Math.exp(-delta * 4));
    u.uScroll.value = scrollOffset.current;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={AURORA_VERT}
        fragmentShader={AURORA_FRAG}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function AboutAuroraDust() {
  // Pointer feeds the aurora bend (the preserved contact hover effect); scroll
  // feeds the aurora's vertical parallax. One listener each, one shared space.
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const scroll = useRef({ y: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onScroll = () => {
      scroll.current.y = window.scrollY || window.pageYOffset || 0;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Coarse pointer = touch/mobile: there's no hovering cursor to bend the
    // aurora toward, so skip the global pointermove listener entirely (scroll
    // parallax is what carries the reaction there). Same check the DPR cap uses.
    const coarse =
      window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    let onMove;
    if (!coarse) {
      onMove = (e) => {
        pointer.current.x = e.clientX / window.innerWidth;
        pointer.current.y = 1 - e.clientY / window.innerHeight;
      };
      window.addEventListener('pointermove', onMove, { passive: true });
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (onMove) window.removeEventListener('pointermove', onMove);
    };
  }, []);

  // Coarse pointer = touch/mobile: cap DPR to 1 (the 6-octave fBm aurora is the
  // real fragment cost; 1.5× would just burn fill-rate). Runs client-only (the
  // mount is dynamic ssr:false), so window is defined.
  const coarse =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : false;

  return (
    <Canvas
      dpr={coarse ? 1 : [1, 1.5]}
      gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%' }}
    >
      <AuroraPlane pointer={pointer} scroll={scroll} />
    </Canvas>
  );
}
