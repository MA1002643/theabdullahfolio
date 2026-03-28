"use client";
import React, { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";

const Carousel3D = () => {
    const cards = [
        {
            id: 1,
            title: "Certificate of Completion",
            category: "Educational",
            img: "https://marketplace.canva.com/EAGTnx__MrY/1/0/1131w/canva-black-gold-modern-workshop-completion-certificate-TLZbgjF3mN0.jpg",
        },
        {
            id: 2,
            title: "Skill Achievement Badge",
            category: "Skills",
            img: "https://marketplace.canva.com/EAGTnx__MrY/1/0/1131w/canva-black-gold-modern-workshop-completion-certificate-TLZbgjF3mN0.jpg",
        },
        {
            id: 3,
            title: "Workshop Participation",
            category: "Educational",
            img: "https://images.template.net/385923/Landscape-Certificate-Template-edit-online.png",
        },
        {
            id: 4,
            title: "Professional Skill Training",
            category: "Skills",
            img: "https://marketplace.canva.com/EAGTnx__MrY/1/0/1131w/canva-black-gold-modern-workshop-completion-certificate-TLZbgjF3mN0.jpg",
        },
        {
            id: 5,
            title: "Certification of Excellence",
            category: "Educational",
            img: "https://marketplace.canva.com/EAGTnx__MrY/1/0/1131w/canva-black-gold-modern-workshop-completion-certificate-TLZbgjF3mN0.jpg",
        },
    ];

    const categories = ["All", "Educational", "Skills", "Random"];
    const [activeCategory, setActiveCategory] = useState("All");
    const [hasAnimated, setHasAnimated] = useState(false);

    const categoryCounts = useMemo(() => {
        const counts = { All: cards.length };
        categories.forEach((cat) => {
            if (cat !== "All") {
                counts[cat] = cards.filter((c) => c.category === cat).length;
            }
        });
        return counts;
    }, [cards]);

    const filteredCards =
        activeCategory === "All"
            ? cards
            : cards.filter((c) => c.category === activeCategory);

    const [activeIndex, setActiveIndex] = useState(2);

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

    return (
        <div className="relative flex flex-col items-center justify-center w-full max-h-full overflow-hidden">
            {/* Category Filters */}
            <div className="flex flex-wrap items-center justify-center gap-6 mb-10 mt-10">
                {categories.map((cat, idx) => {
                    const isDisabled = cat !== "All" && categoryCounts[cat] === 0;
                    const isActive = activeCategory === cat;

                    return (
                        <div key={idx}>
                            <span
                                onClick={() => {
                                    if (isDisabled)
                                        return toast.info("No qualifications in this category", {
                                            style: {
                                                color: "#ffb347",
                                                backgroundColor: "rgb(0 0 0 / 0.7)",
                                                border: "none",
                                            },
                                        });
                                    setActiveCategory(cat);
                                }}
                                className={`transition text-[1rem] md:text-[1.2rem] font-semibold uppercase cursor-pointer
                    ${isActive
                                        ? "text-glow-stroke-neon"
                                        : "glitter-text !tracking-normal !text-shadow-none"
                                    }`}
                                style={{
                                    textShadow: isActive
                                        ? "none"
                                        : "0 0 2px #ff55f7, 0 0 4px #ff55f7, 0 0 6px #ff55f7",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.textShadow =
                                            "0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7, 0 0 30px #ff55f7";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.textShadow =
                                            "0 0 2px #ff55f7, 0 0 4px #ff55f7, 0 0 6px #ff55f7";
                                    }
                                }}
                            >
                                {cat}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Carousel 3D Container */}
            <div className="relative w-full flex items-center justify-center perspective-3d h-[74vh]">
                {filteredCards.length > 0 ? (
                    filteredCards.map((card, index) => {
                        let offset = index - normalizedIndex;
                        if (offset < -Math.floor(filteredCards.length / 2)) {
                            offset += filteredCards.length;
                        } else if (offset > Math.floor(filteredCards.length / 2)) {
                            offset -= filteredCards.length;
                        }

                        const absOffset = Math.abs(offset);
                        const translateX = offset * 200;
                        const translateZ = -absOffset * 80;
                        const rotateY = offset * -25;
                        const scale = offset === 0 ? 1 : 0.8;

                        return (
                            <div
                                key={card.id}
                                className="absolute w-auto h-full py-6 text-[#ff6d05] rounded-2xl flex flex-col items-center justify-between text-xl font-bold gap-6"
                                style={{
                                    transform: hasAnimated
                                        ? `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`
                                        : "translateX(0px) translateZ(-400px) rotateY(0deg) scale(0.5)",
                                    zIndex: 100 - absOffset,
                                    opacity: hasAnimated ? 1 - absOffset * 0.25 : 0,
                                    filter: `brightness(${1 - absOffset * 0.25})`,
                                    transition: `all 700ms ease-in-out ${absOffset * 200}ms`,
                                }}
                            >
                                {/* === IMAGE + REFLECTION SECTION === */}
                                <div className="relative w-full h-full flex flex-col items-center justify-start rounded-lg overflow-visible">
                                    {/* Main Image */}
                                    <div className="relative w-full h-[80%] p-[0.3rem] flex items-center justify-center rounded-lg custom-bg-abt">
                                        <img
                                            src={card.img}
                                            alt={card.title}
                                            className="w-full h-full object-cover rounded-lg"
                                            style={{
                                                filter:
                                                    "sepia(70%) saturate(310%) hue-rotate(3deg) brightness(78%)",
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400/10 via-transparent to-yellow-500/5 rounded-lg mix-blend-overlay pointer-events-none"></div>
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
                <div className="relative flex flex-col items-center mt-10 mb-4">
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
