/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ["var(--font-inter)"],
      },
      colors: {
        background: "rgb(var(--background))",
        foreground: "rgb(var(--foreground))",
        muted: "rgb(var(--muted))",
        accent: "rgb(var(--accent))",
        // Deep night background tones
        night: {
          950: "#01050b", // near-black blue
          900: "#030c18", // very dark navy
          800: "#141e39", // midnight blue
        },
        // Warm browns / amber base
        ember: {
          950: "#1b100f", // dark espresso
          900: "#3f2011", // deep chocolate
          800: "#72411c", // warm brown
          700: "#a0682c", // golden brown
          core: "#b16612", // inner neon core
          neon: "#eab53e", // bright neon orange
          halo: "#fcf699", // pale outer glow
        },
        // Purples for accent + neon
        amethyst: {
          700: "#5c426c", // muted purple
          neon: "#fc83ff", // neon purple (subtitle)
        },
        neon: {
          700: "#ff6d05", // neon yellow
        },

      },

      backgroundImage: {
        "firefly-radial":
          "radial-gradient(50% 50% at 50% 50%, rgba(255, 109, 5, 0.5) 0%, rgba(217,217,217, 0) 100%)",
      },
      boxShadow: {
        "glass-inset": "inset 0 17px 5px -9px rgba(254,254,91, 0.05)",
        "glass-sm": "5px 5px 20px 0px rgba(254,254,91, 0.3)",
        "glass-sm-2": "5px 5px 20px 0px #f446ff3f",
        "neon-orange":
          "0 0 6px #eab53e, 0 0 18px #b16612, inset 0 0 6px #fcf699",
        "neon-purple":
          "0 0 6px #e3a4e8, 0 0 18px #5c426c, inset 0 0 6px #e3a4e8",
        "ember-neon": `
    0 0 1px #eab53e,
    0 0 1px #b16612,
    0 0 20px #fcf699
  `,
      },
      // Neon glows (box-shadow) for buttons, rings, laptop halo, etc.

      // Text glow style via drop-shadow
      dropShadow: {
        "neon-orange": ["0 0 4px #eab53e", "0 0 10px #b16612"],
        "neon-purple": ["0 0 4px #e3a4e8", "0 0 10px #5c426c"],
      },

      keyframes: {
        "spin-reverse": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(-360deg)" },
        },
        "ripple-neon": {
          // The launch bloom. It was a fully-opaque `0 0 140px #ff6d05`, which
          // over the photographic causeway read as a neon sign firing rather
          // than light spreading across stone; it then moved onto the scene's
          // own fire (rgba(224,163,92), measured at h~32/s~35 for its real
          // flames). It is back on `#ff6d05` by request, so the rings match the
          // MUHAMMAD ABDULLAH headline — but the ALPHA stays: 0.5 rather than
          // an opaque hex is what keeps the bloom reading as spreading light,
          // and that was the half of the fix worth keeping. Matches the ring
          // material in globals.css (.borderline), which carries the full note.
          "0%": {
            transform: "perspective(600px) rotateX(80deg) scale(0)",
            boxShadow: "0 0 140px rgba(255, 109, 5, 0.5)",
          },
          "20%": {
            boxShadow: "0 0 140px rgba(255, 109, 5, 0.5)",
          },
          "70%": {
            opacity: ".8",
          },
          "100%": {
            transform: "perspective(600px) rotateX(80deg) scale(1.2)",
            opacity: "0",
            // boxShadow: "0 0 24px transparent",
            // borderColor: "#eab63e",
          },
        },
        "float-laptop": {
          // Amplitude deliberately kept below the vection threshold (issue #87):
          // the headline is CSS-stable, but a larger bob made the eye attribute
          // the laptop's motion to the static title. translateY 20→6px,
          // scale 1.1→1.02, rotateX 18→6deg. The filter pulses the ember glow
          // in sync with the up-phase so the laptop still reads as "alive".
          "0%, 100%": {
            transform: "translateY(0) rotateX(0deg) rotateZ(0deg) scale(1)",
            filter: "drop-shadow(0 0 0 #ff6d05) drop-shadow(0 0 0 #ff6d05)",
          },
          "50%": {
            transform: "translateY(-6px) rotateX(6deg) rotateZ(-0.5deg) scale(1.02)",
            filter: "drop-shadow(0 0 2px #ff6d05e0) drop-shadow(0 0 3px #ff6d05e1)",
          },
        },
        "wiggle": {
          "0%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-2px)" },
          "50%": { transform: "translateX(2px)" },
          "75%": { transform: "translateX(-2px)" },
          "100%": { transform: "translateX(0)" },
        },
        "glow-ring": {
          "0%, 100%": {
            boxShadow: "0 0 20px #ff7b00, 0 0 40px #ff5100",
            opacity: "0.8",
          },
          "50%": {
            boxShadow: "0 0 40px #ff9933, 0 0 70px #ff6600",
            opacity: "1",
          },
        },
        "lift-shake": {
          "0%": { transform: "translateY(0) rotate(0deg)" },
          "25%": { transform: "translateY(-6px) rotate(-2deg)" },
          "50%": { transform: "translateY(-8px) rotate(2deg)" },
          "75%": { transform: "translateY(-6px) rotate(-2deg)" },
          "100%": { transform: "translateY(0) rotate(0deg)" },
        },
        "logo-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.03)" },
        },
      },
      animation: {
        "spin-slow": "spin 40s linear infinite",
        "spin-slow-reverse": "spin-reverse 40s linear infinite",
        'ripple-neon': 'ripple-neon 3s ease-out infinite',
        "float-laptop": "float-laptop 3s ease-in-out infinite",
        "wiggle": "wiggle 1.5s ease-in-out infinite",
        "glow-ring": "glow-ring 3s ease-in-out infinite",
        "lift-shake": "lift-shake 0.6s ease-in-out",
        "logo-breathe": "logo-breathe 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
