"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";

const FullScreenLoader = ({ children }) => {
  const [loading, setLoading] = useState(true);

  // useEffect(() => {
  //   const timer = setTimeout(() => setLoading(false), 1000);
  //   return () => clearTimeout(timer);
  // }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/90 z-[9999]">
        <div className="relative w-24 h-24">
          {/* Outer halo glow */}
          <div className="absolute inset-0 rounded-full border-4 border-ember-halo opacity-50 animate-ping"></div>

          {/* Spinning loader */}
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-ember-neon animate-spin"></div>

        </div>
      </div>



    );
  }

  // Show page content after loader disappears
  return <>{children}</>;
};

export default FullScreenLoader;
