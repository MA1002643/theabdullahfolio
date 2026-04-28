"use client";
import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { toast } from "sonner";
import DIMS from "./_dimensions.json";

// Cards beyond this offset from the active card are skipped entirely —
// keeps DOM and image fetches bounded regardless of category size.
const RENDER_WINDOW = 4;

// Look up the aspect ratio for an image path like "/qualifications/foo.webp".
// Falls back to A4 portrait so a missing entry never crashes the layout.
const aspectFor = (img) => {
    const slug = img.split("/").pop().replace(/\.webp$/, "");
    return DIMS[slug]?.aspectRatio ?? 0.71;
};

const CATEGORY_TREE = {
    All: null,
    Education: ["School", "College", "University"],
    Employment: ["Security", "Tech"],
};

const PARENT_CATEGORIES = Object.keys(CATEGORY_TREE);

const CARDS = [
    // Employment > Security
    { id: 1, title: "Level 2 - SIA Door Supervisors", category: "Employment", sub: "Security", img: "/qualifications/sia-certificate.webp" },
        { id: 2, title: "Spoken English (GESE) Speaking and Listening (Entry 3)", category: "Education", sub: "College", img: "/qualifications/b1-certificate.webp" },
        { id: 23, title: "Attendance certificate", category: "Education", sub: "College", img: "/qualifications/attendance-certificate.webp" },
        { id: 24, title: "Attitude to Learning", category: "Education", sub: "College", img: "/qualifications/Attitude-to-learning-certificate.webp" },
        { id: 25, title: "BCS Level 2 ECDL Certificate", category: "Education", sub: "School", img: "/qualifications/bcs-level-2-ecdl-certificate-it-appliction-skills-(qcf).webp" },
        { id: 26, title: "Behaviour certificate", category: "Education", sub: "College", img: "/qualifications/behaviour-certificate.webp" },
        { id: 33, title: "Enrichment Certificate", category: "Education", sub: "College", img: "/qualifications/enrichment-certificate.webp" },
        { id: 34, title: "GCSE English", category: "Education", sub: "College", img: "/qualifications/gcse-english.webp" },
        { id: 35, title: "GCSE Mathematics", category: "Education", sub: "College", img: "/qualifications/gcse-maths.webp" },
        { id: 36, title: "Learner Voice Award 2020-2021", category: "Education", sub: "College", img: "/qualifications/learner-voice-award-2020-2021.webp" },
        { id: 38, title: "Lockdown Legend Certificate", category: "Education", sub: "College", img: "/qualifications/lockdown-legend-certificate.webp" },
        { id: 40, title: "OCNLR Entry Level Certificate in Digital Skills (Entry 3)", category: "Education", sub: "College", img: "/qualifications/ocnlr-entry-level-certificate-in-digital-skills-entry-3.webp" },
        { id: 41, title: "OCNLR Level 1 Certificate in Digital Skills", category: "Education", sub: "College", img: "/qualifications/ocnlr-level-1-certificate-in-digital-skills.webp" },
        { id: 42, title: "Pearson BTEC Level 3 Extended Diploma", category: "Education", sub: "College", img: "/qualifications/pearson-btec-level-3-extended-diploma.webp" },
        { id: 46, title: "Professionalism Certificate", category: "Education", sub: "College", img: "/qualifications/professionalism-certificate.webp" },
        { id: 47, title: "Touch Type Read and Spell Computer Course", category: "Education", sub: "College", img: "/qualifications/touch-type-read-and-spell-computer-course.webp" },
        { id: 48, title: "Volunteering Award 2018-2019", category: "Education", sub: "College", img: "/qualifications/volunteering-award-2018-2019.webp" },
        { id: 3, title: "Level 2 Award for CCTV Operators", category: "Employment", sub: "Security", img: "/qualifications/cctv-certificate.webp" },
        { id: 4, title: "Basic Handcuff Training", category: "Employment", sub: "Security", img: "/qualifications/handcuff-certificate.webp" },
        { id: 5, title: "Cyber Security", category: "Employment", sub: "Security", img: "/qualifications/get-licensed-cyber-security.webp" },
        { id: 6, title: "Fire Marshal", category: "Employment", sub: "Security", img: "/qualifications/get-licensed-fire-marshal.webp" },
        { id: 7, title: "Introduction to Risk Assessment", category: "Employment", sub: "Security", img: "/qualifications/get-licensed-risk-assessment.webp" },
        { id: 8, title: "Mental Health Awareness (Get Licensed)", category: "Employment", sub: "Security", img: "/qualifications/get-licensed-mental-health.webp" },
        { id: 9, title: "Workplace Health and Safety", category: "Employment", sub: "Security", img: "/qualifications/get-licensed-workplace-hs.webp" },
        { id: 10, title: "Office Safety Essentials Interactive", category: "Employment", sub: "Tech", img: "/qualifications/office-safety-essentials.webp" },
        { id: 11, title: "First Aid at Work", category: "Employment", sub: "Security", img: "/qualifications/emergency-first-aid-at-work.webp" },
        { id: 12, title: "Introduction to Social Housing", category: "Employment", sub: "Security", img: "/qualifications/social-housing-intro.webp" },
        { id: 13, title: "Awareness of Health and Safety", category: "Employment", sub: "Tech", img: "/qualifications/awareness-health-safety.webp" },
        { id: 14, title: "Confidentiality in the Workplace.", category: "Employment", sub: "Tech", img: "/qualifications/confidentiality-workplace.webp" },
        { id: 15, title: "Front Line Worker - Coroners Inquest", category: "Employment", sub: "Security", img: "/qualifications/coroners-inquest-front-line.webp" },
        { id: 16, title: "Cyber Security Awareness", category: "Employment", sub: "Tech", img: "/qualifications/cyber-security-awareness-ma.webp" },
        { id: 17, title: "Equality, Diversity and Inclusion", category: "Employment", sub: "Security", img: "/qualifications/edi-employees.webp" },
        { id: 18, title: "Safeguarding Everyone", category: "Employment", sub: "Security", img: "/qualifications/level-1-safeguarding.webp" },
        { id: 19, title: "Mental Health Awareness (Virtual College)", category: "Employment", sub: "Security", img: "/qualifications/mental-health-awareness-ma.webp" },
        { id: 20, title: "Sexual Harassment in the Workplace for Employees", category: "Employment", sub: "Security", img: "/qualifications/sexual-harassment-workplace.webp" },
        { id: 21, title: "The Essentials of Data Protection (GDPR)", category: "Employment", sub: "Tech", img: "/qualifications/gdpr-essentials-ma.webp" },

        // Employment > Tech
        { id: 22, title: "Code of Ethics - ||", category: "Employment", sub: "Tech", img: "/qualifications/code-of-ethics-2022-ii.webp" },
        { id: 27, title: "ACT AWARENESS e-Learning", category: "Employment", sub: "Security", img: "/qualifications/act-awareness-elearning.webp" },
        { id: 28, title: "ACT EDUCATION E-LEARNING", category: "Employment", sub: "Security", img: "/qualifications/act-for-education.webp" },
        { id: 29, title: "ACT SECURITY E-LEARNING", category: "Employment", sub: "Security", img: "/qualifications/act-security-elearning.webp" },
        { id: 30, title: "Data Ethics: Making Data-Driven Decisions", category: "Education", sub: "University", img: "/qualifications/data-ethics-data-driven-decisions.webp" },
        { id: 31, title: "GDPR Compliance", category: "Education", sub: "University", img: "/qualifications/gdpr-compliance-essential.webp" },
        { id: 32, title: "Including Sustainability in Your Cloud Strategy", category: "Education", sub: "University", img: "/qualifications/sustainability-cloud-strategy.webp" },
        { id: 37, title: "Intellectual Property & Trade Secrets", category: "Employment", sub: "Tech", img: "/qualifications/intellectual-property-trade-secrets.webp" },
        { id: 39, title: "Cyber Security", category: "Employment", sub: "Tech", img: "/qualifications/sa-cyber-security.webp" },
        { id: 43, title: "Unisys - Data Privacy (2022)", category: "Employment", sub: "Tech", img: "/qualifications/unisys-data-privacy-2022.webp" },
        { id: 44, title: "Unisys - Respectful Workplace (2023)", category: "Employment", sub: "Tech", img: "/qualifications/unisys-respectful-workplace-2022.webp" },
        { id: 45, title: "Unisys - Data Privacy (2023)", category: "Employment", sub: "Tech", img: "/qualifications/unisys-data-privacy-2023-v2.webp" },

    // Random
    { id: 50, title: "Virtual Bootcamp for new Admins", category: "Education", sub: "University", img: "/qualifications/certificate-misc.webp" },
];

const Carousel3D = () => {
    const [activeCategory, setActiveCategory] = useState("All");
    const [activeSub, setActiveSub] = useState(null);
    const [hasAnimated, setHasAnimated] = useState(false);

    const subCategories = CATEGORY_TREE[activeCategory];

    const parentCounts = useMemo(() => {
        const counts = { All: CARDS.length };
        for (const cat of PARENT_CATEGORIES) {
            if (cat !== "All") counts[cat] = CARDS.filter((c) => c.category === cat).length;
        }
        return counts;
    }, []);

    const subCounts = useMemo(() => {
        if (!subCategories) return {};
        const counts = {};
        for (const sub of subCategories) {
            counts[sub] = CARDS.filter((c) => c.category === activeCategory && c.sub === sub).length;
        }
        return counts;
    }, [activeCategory, subCategories]);

    const filteredCards = useMemo(() => {
        if (activeCategory === "All") return CARDS;
        if (!activeSub) return CARDS.filter((c) => c.category === activeCategory);
        return CARDS.filter((c) => c.category === activeCategory && c.sub === activeSub);
    }, [activeCategory, activeSub]);

    const [activeIndex, setActiveIndex] = useState(0);

    // Recenter on the middle card whenever the filter changes.
    useEffect(() => {
        setActiveIndex(filteredCards.length > 0 ? Math.floor(filteredCards.length / 2) : 0);
    }, [activeCategory, activeSub, filteredCards.length]);

    const normalizedIndex =
        filteredCards.length > 0
            ? ((activeIndex % filteredCards.length) + filteredCards.length) %
            filteredCards.length
            : 0;


    const nextSlide = () => {
        setActiveIndex((prev) => (prev + 1) % filteredCards.length);
    };

    const prevSlide = () => {
        setActiveIndex((prev) =>
            prev === 0 ? filteredCards.length - 1 : prev - 1
        );
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setHasAnimated(true);
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const emptyToast = (label) =>
        toast.info(`No qualifications in ${label} yet`, {
            style: {
                color: "#ffb347",
                backgroundColor: "rgb(0 0 0 / 0.7)",
                border: "none",
            },
        });

    const handleParentClick = (cat) => {
        if (cat !== "All" && parentCounts[cat] === 0) return emptyToast(cat);
        setActiveCategory(cat);
        setActiveSub(null);
    };

    const handleSubClick = (sub) => {
        if (subCounts[sub] === 0) return emptyToast(sub);
        setActiveSub(sub);
    };

    const tabClasses = (isActive) =>
        // !text-... overrides .glitter-text's hardcoded font-size: 3rem so the
        // inactive tabs don't balloon to 48px on mobile while the active one
        // stays at 1rem. Both states now share the same responsive sizing.
        `transition !text-[1rem] md:!text-[1.2rem] font-semibold uppercase cursor-pointer ${isActive
            ? "text-glow-stroke-neon"
            : "glitter-text !tracking-normal !text-shadow-none"
        }`;

    const tabHandlers = (isActive) => ({
        style: {
            textShadow: isActive
                ? "none"
                : "0 0 2px #ff55f7, 0 0 4px #ff55f7, 0 0 6px #ff55f7",
        },
        onMouseEnter: (e) => {
            if (!isActive) {
                e.currentTarget.style.textShadow =
                    "0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7, 0 0 30px #ff55f7";
            }
        },
        onMouseLeave: (e) => {
            if (!isActive) {
                e.currentTarget.style.textShadow =
                    "0 0 2px #ff55f7, 0 0 4px #ff55f7, 0 0 6px #ff55f7";
            }
        },
    });

    return (
        <div className="relative flex flex-col items-center justify-center w-full max-h-full overflow-hidden">
            {/* Parent category filters */}
            <div className="flex flex-wrap items-center justify-center gap-6 mb-4 mt-10">
                {PARENT_CATEGORIES.map((cat) => {
                    const isActive = activeCategory === cat;
                    return (
                        <span
                            key={cat}
                            onClick={() => handleParentClick(cat)}
                            className={tabClasses(isActive)}
                            {...tabHandlers(isActive)}
                        >
                            {cat}
                        </span>
                    );
                })}
            </div>

            {/* Sub-category filters (only when parent has subs) */}
            {subCategories && (
                <div className="flex flex-wrap items-center justify-center gap-6 mb-8">
                    {subCategories.map((sub) => {
                        const isActive = activeSub === sub;
                        return (
                            <span
                                key={sub}
                                onClick={() => handleSubClick(sub)}
                                className={tabClasses(isActive)}
                                {...tabHandlers(isActive)}
                            >
                                {sub}
                            </span>
                        );
                    })}
                </div>
            )}

            {!subCategories && <div className="mb-6" />}

            {/* Carousel 3D Container. CSS vars feed every dimension so we can
                tune them per breakpoint and the gap-to-card ratio
                (slot/cap ≈ 0.65) stays constant on mobile, tablet, and
                desktop:
                  --cert-cap   — image height cap
                  --cert-w-cap — image width cap (mobile uses ~90vw so cards
                                 nearly fill the screen width; desktop value
                                 is academic because the height cap wins)
                  --slot-vh    — translateX spacing between cards            */}
            <div className="relative w-full flex items-center justify-center perspective-3d h-[68vh] md:h-[80vh] [--cert-cap:56vh] md:[--cert-cap:68vh] [--cert-w-cap:90vw] md:[--cert-w-cap:70vw] [--slot-vh:36vh] md:[--slot-vh:44vh]">
                {filteredCards.length > 0 ? (
                    filteredCards.map((card, index) => {
                        let offset = index - normalizedIndex;
                        if (offset < -Math.floor(filteredCards.length / 2)) {
                            offset += filteredCards.length;
                        } else if (offset > Math.floor(filteredCards.length / 2)) {
                            offset -= filteredCards.length;
                        }

                        const absOffset = Math.abs(offset);
                        // Skip cards outside the render window. Cards beyond
                        // RENDER_WINDOW are invisible (opacity 0) and not
                        // interactive, so unmounting them avoids fetching
                        // their images and keeps the DOM small.
                        if (absOffset > RENDER_WINDOW) return null;
                        const ar = aspectFor(card.img);
                        // Image area: width and height share the same min() so
                        // the box's aspect ratio always equals the image's.
                        // --cert-cap (height) and --cert-w-cap (width) are
                        // set on the carousel container and breakpoint-aware,
                        // so cards grow on mobile (filling the width) and
                        // get a moderate bump on desktop.
                        const imgW = `min(var(--cert-w-cap), calc(${ar} * var(--cert-cap)))`;
                        const imgH = `min(calc(var(--cert-w-cap) / ${ar}), var(--cert-cap))`;
                        // Uniform slot width via the --slot-vh CSS var (set on
                        // the carousel container, breakpoint-aware). Every
                        // card sits at offset × var(--slot-vh) regardless of
                        // its own width, and because --slot-vh scales with
                        // --cert-cap, the gap-to-card ratio is identical on
                        // mobile, tablet and desktop.
                        const translateX = `calc(${offset} * var(--slot-vh))`;
                        // Coverflow depth/tilt to match the reference Swiper
                        // config (depth: 200, rotate: 20). Side cards recede
                        // ~200px per step and tilt 20° inward — this is what
                        // sells the "centred card sits in front of its
                        // neighbours" effect rather than just being a row.
                        const translateZ = -absOffset * 200;
                        const rotateY = offset * -20;
                        const scale = offset === 0 ? 1 : 0.85;

                        return (
                            <div
                                key={card.id}
                                className="absolute h-full py-6 text-[#ff6d05] rounded-2xl flex flex-col items-center justify-between text-xl font-bold gap-6"
                                style={{
                                    width: imgW,
                                    transform: hasAnimated
                                        ? `translateX(${translateX}) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`
                                        : "translateX(0px) translateZ(-400px) rotateY(0deg) scale(0.5)",
                                    zIndex: 100 - absOffset,
                                    // Cards within the visible window stay fully
                                    // opaque (Swiper-coverflow look). Anything
                                    // past the window is invisible — and that's
                                    // exactly where the wrap sweep happens, so
                                    // the loop reads as seamless.
                                    opacity: !hasAnimated
                                        ? 0
                                        : absOffset <= 2
                                            ? 1
                                            : absOffset === 3
                                                ? 0.55
                                                : 0,
                                    filter: `brightness(${1 - absOffset * 0.18})`,
                                    // Same timing for every card so they move
                                    // as a single wheel — no staggered ripple.
                                    transition: "transform 650ms ease-in-out, opacity 400ms ease-in-out",
                                    pointerEvents: absOffset > 3 ? "none" : "auto",
                                }}
                            >
                                {/* === IMAGE + REFLECTION SECTION === */}
                                {/* Landscape images (ar > 1) center vertically so the
                                    shorter image + title sit in the middle of the card
                                    instead of clinging to the top. Portrait stays top-aligned. */}
                                <div className={`relative w-full h-full flex flex-col items-center ${ar > 1 ? "justify-center" : "justify-start"} rounded-lg overflow-visible`}>
                                    {/* Main Image — width/height pinned to the image's aspect ratio so the frame hugs it edge-to-edge */}
                                    <div
                                        className="relative flex items-center justify-center rounded-lg custom-bg-abt p-[0.3rem]"
                                        style={{ width: imgW, height: imgH }}
                                    >
                                        <a
                                            href={card.img}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={`Open ${card.title} in a new tab`}
                                            className="relative block w-full h-full cursor-pointer"
                                        >
                                            <Image
                                                src={card.img}
                                                alt={card.title}
                                                fill
                                                sizes="(max-width: 768px) 90vw, 50vw"
                                                priority={absOffset === 0}
                                                className="object-contain rounded-lg"
                                            />
                                            {/* Subtle ember tint to tie cards
                                                into the page palette. Lives
                                                in the DOM only — clicking the
                                                card opens the raw WebP in a
                                                new tab with no overlay. */}
                                            <div
                                                aria-hidden
                                                className="absolute inset-0 rounded-lg pointer-events-none bg-gradient-to-br from-[#ff6d05]/85 via-[#ff6d05]/65 to-[#ff6d05]/80 mix-blend-multiply"
                                            />
                                        </a>
                                    </div>


                                    {/* Certificate Title + Reflection */}
                                    <div className="relative w-full text-center rounded-lg border custom-bg-abt before:absolute before:inset-0 before:rounded-lg before:pointer-events-none p-3 mt-3">
                                        <h3 className="text-center text-lg font-semibold text-shadow-neon-light-orange tracking-wide relative z-10">
                                            {card.title}
                                        </h3>

                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-[#FFB627] text-lg font-semibold drop-shadow-[0_0_5px_#ffb627]">
                        No items found in this category!
                    </div>
                )}
            </div>

            {/* Next / Prev Buttons + Reflection */}
            {filteredCards.length > 0 && (
                <div className="relative flex flex-col items-center mt-3 md:mt-10 mb-4">
                    <div className="flex gap-6 z-10">
                        <button
                            onClick={prevSlide}
                            className="px-4 py-2 custom-bg-abt text-shadow-neon-light-orange rounded-lg"
                            style={{ textShadow: "none" }}
                        >
                            Prev
                        </button>
                        <button
                            onClick={nextSlide}
                            className="px-4 py-2 custom-bg-abt text-shadow-neon-light-orange rounded-lg"
                            style={{ textShadow: "none" }}
                        >
                            Next
                        </button>
                    </div>

                </div>
            )}
        </div>
    );
};

export default Carousel3D;
