'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';

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
  hidden: { scale: 0 },
  show: { scale: 1 },
};

export default function Form() {
  const [launch, setLaunch] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm();

  const sendEmail = async (params) => {
    try {
      const res = await fetch(`/api/send-mail`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params)
        });
      const data = await res.json();
      if (data.success) {
        toast.success("Form submitted successfully!")
      } else { toast.error("Error submitting form") }
    } catch (error) {
      toast.error("Error submitting form")
    }
    reset();
  };

  const onSubmit = (data) => {
    const templateParams = {
      subject: data.subject,
      name: data.name,
      email: data.email,
      message: data.message,
    };

    setLaunch("rocket"); // start rocket phase
    sendEmail(templateParams);
  };

  return (
    <>
      <Toaster richColors position="top-center" />
      <motion.form
        variants={container}
        initial="hidden"
        animate="show"
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full h-full py-6 px-12 max-w-xl flex-col items-center justify-center space-y-4"
      >
        {/* <motion.div variants={item} className="w-full">
          <h2 className="text-[2em] text-amethyst-neon">Message Me</h2>
        </motion.div> */}

        <motion.div variants={item} className="w-full">
          <label htmlFor="name" className="sr-only">Full Name</label>
          <motion.input
            id="name"
            name="name"
            type="text"
            placeholder="Full Name"
            {...register('name', {
              required: 'This field is required!',
              minLength: {
                value: 3,
                message: 'Name should be atleast 3 characters long.',
              },
            })}
            className="custom-bg-2 w-full rounded-md p-2 text-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/50 hover:shadow-[0_0_15px_#5c0099]"
          />
        </motion.div>
        {errors.name && (
          <span className="inline-block self-start" style={{ color: '#ff6d05' }}>
            {errors.name.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <label htmlFor="email" className="sr-only">Email</label>
          <motion.input
            id="email"
            name="email"
            type="email"
            placeholder="Email"
            {...register('email', { required: 'This field is required!' })}
            className="custom-bg-2 w-full rounded-md p-2 text-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/50 hover:shadow-[0_0_15px_#5c0099]"
          />
        </motion.div>
        {errors.email && (
          <span className="inline-block self-start" style={{ color: '#ff6d05' }}>
            {errors.email.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <label htmlFor="subject" className="sr-only">Subject</label>
          <motion.input
            id="subject"
            name="subject"
            type="text"
            placeholder="Subject"
            {...register('subject', { required: 'This field is required!' })}
            className="custom-bg-2 w-full rounded-md p-2 text-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/50 hover:shadow-[0_0_15px_#5c0099]"
          />
        </motion.div>
        {errors.subject && (
          <span className="inline-block self-start" style={{ color: '#ff6d05' }}>
            {errors.subject.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <label htmlFor="message" className="sr-only">Message</label>
          <motion.textarea
            id="message"
            name="message"
            placeholder="Message"
            {...register('message', {
              required: 'This field is required!',
              maxLength: {
                value: 500,
                message: 'Message should be less than 500 characters',
              },
              minLength: {
                value: 50,
                message: 'Message should be more than 50 characters',
              },
            })}
            className="custom-bg-2 w-full rounded-md p-2 text-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/50 hover:shadow-[0_0_15px_#5c0099]"
          />
        </motion.div>
        {errors.message && (
          <span className="inline-block self-start" style={{ color: '#ff6d05' }}>
            {errors.message.message}
          </span>
        )}
        {/* <motion.input
          variants={item}
          value="Cast your message!"
          className="cursor-pointer py-2.5 px-3 rounded-md border border-ember-neon bg-yellow-400/10 backdrop-blur-md  text-[#ff6d05] hover:shadow-[inset_0_4px_12px_rgba(251,191,36,0.25)]"
          type="submit"
        /> */}

        <AnimatePresence mode="wait">
          {!launch ? (
            <motion.input
              key="submit"
              type="submit"
              value="SEND MESSAGE!"
              className="cursor-pointer py-2 px-6 rounded-full custom-bg-abt text-shadow-neon-light-orange font-semibold tracking-wide shadow-sm hover:shadow-[0_0_20px_rgba(255,109,5,0.6)] transition-all duration-300"
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.95 }}
              initial={{ scale: 1 }}
            />
          ) : launch === "rocket" ? (
            <motion.div
              key="rocket"
              initial={{ scale: 1, opacity: 1, y: 0 }}
              animate={{ y: -500, opacity: 0 }}
              transition={{ duration: 1.4, ease: "easeIn", delay: 0.6 }}
              className="relative flex flex-col items-center"
              onAnimationComplete={() => setLaunch("check")}
            >
              {/* 🚀 Rocket Body */}
              <motion.div
                initial={{ rotate: 0 }}
                animate={{
                  x: [0, -3, 3, -3, 3, 0],
                  rotate: [0, -2, 2, -2, 2, 0]
                }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="relative w-10 h-20 bg-gradient-to-b from-gray-100 via-gray-300 to-gray-500 rounded-t-full rounded-b-lg border-2 border-gray-400 shadow-[0_0_20px_rgba(255,109,5,0.6)]"
              >
                {/* Rocket Nose Cone */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-0 h-0 
                border-l-[20px] border-r-[20px] border-b-[24px] 
                border-l-transparent border-r-transparent border-b-red-500 shadow-lg" />
                
                {/* Window */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-gradient-to-br from-sky-300 to-sky-600 border-2 border-gray-600 shadow-inner" />
                
                {/* Fins */}
                <div className="absolute -bottom-1 -left-4 w-5 h-8 bg-gradient-to-br from-red-500 to-red-700 rotate-12 rounded-sm shadow-lg border border-red-800" />
                <div className="absolute -bottom-1 -right-4 w-5 h-8 bg-gradient-to-bl from-red-500 to-red-700 -rotate-12 rounded-sm shadow-lg border border-red-800" />
                
                {/* Flame/Exhaust */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.8 }}
                  animate={{ 
                    scale: [1, 1.4, 1.2, 1.5, 1], 
                    opacity: [1, 0.8, 0.9, 0.7, 1],
                    scaleY: [1, 1.3, 1.1, 1.4, 1]
                  }}
                  transition={{ repeat: Infinity, duration: 0.2 }}
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-8 h-12 bg-gradient-to-b from-yellow-300 via-orange-500 to-red-600 rounded-full blur-sm shadow-[0_0_20px_rgba(255,165,0,0.8)]"
                />
              </motion.div>

              {/* Glowing Trail */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, height: 0 }}
                animate={{ 
                  opacity: [0, 0.9, 0.7, 0.5, 0], 
                  scale: [0.8, 1, 1.2, 1.3, 1],
                  height: [0, 100, 200, 300, 400]
                }}
                transition={{ duration: 1.8, ease: "easeOut" }}
                className="absolute top-16 left-1/2 -translate-x-1/2 w-6 bg-gradient-to-b from-orange-400 via-orange-600 to-transparent blur-xl rounded-full shadow-[0_0_30px_rgba(255,109,5,0.8)]"
              />
            </motion.div>
          ) : (
            <motion.div
              key="checkmark"
              initial={{ scale: 0, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.5, ease: "backOut" }}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 border-2 border-green-300 shadow-[0_0_25px_rgba(34,197,94,0.8),0_0_50px_rgba(34,197,94,0.4)]"
              onAnimationComplete={() => {
                setTimeout(() => setLaunch(false), 2000); // show for 2 seconds
              }}
            >
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="text-white text-4xl font-bold"
              >
                ✓
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.form>
    </>
  );
}
