'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { Mail, MapPin, User } from 'lucide-react';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.3,
            delayChildren: 0.2,
        },
    },
};

const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 },
};

export default function Details() {
    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex items-center justify-center w-full h-full py-6 custom-bg-abt px-12 rounded-lg max-w-md flex-col space-y-4"
        >
            <motion.div variants={item} className="w-full">
                <h2 className="text-[2em] text-shadow-neon-orange">Get In Touch</h2>
            </motion.div>

            <motion.div variants={item} className="w-full">
                {/* <h3 className="text-lg font-semibold text-shadow-neon-orange">Name</h3> */}
                <p className="text-shadow-neon-light-orange flex gap-2 text-[1.2em]"><User /> Muhammad Abdullah</p>
                {/* <h3 className="text-lg font-semibold text-shadow-neon-orange">Phone</h3>
                <p className="text-shadow-neon-light-orange">+1 234 567 890</p> */}
            </motion.div>

            <motion.div variants={item} className="w-full">
                {/* <h3 className="text-lg font-semibold text-shadow-neon-orange">Location</h3> */}
                <p className="text-shadow-neon-light-orange leading-relaxed flex gap-2 text-[1.2em]">
                    <MapPin /> Bolton, <br />
                    Manchestar, <br />
                    England
                </p>
                {/* <h3 className="text-lg font-semibold text-shadow-neon-orange">About Me</h3>
                <p className="text-shadow-neon-light-orange leading-relaxed">
                    Lorem ipsum dolor sit amet consectetur adipisicing elit. Sunt quibusdam maiores praesentium velit quis ratione quam nihil, magni aliquid architecto, fuga pariatur? Eius necessitatibus minus nobis ad pariatur facere dignissimos?
                </p> */}
            </motion.div>

            <motion.div variants={item} className="w-full">
                {/* <h3 className="text-lg font-semibold text-shadow-neon-orange">Email</h3> */}
                <p className="text-shadow-neon-light-orange flex items-center gap-2 text-[1.2em]"> <Mail /> mabdullah30924@gmail.com</p>
            </motion.div>
        </motion.div>
    );
}
