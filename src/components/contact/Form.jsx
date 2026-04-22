'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.45,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { scale: 0 },
  show: { scale: 1 },
};

function FormContent({ onReset }) {
  const [launch, setLaunch] = useState('idle');
  const timersRef = useRef([]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const schedule = (cb, ms) => {
    timersRef.current.push(setTimeout(cb, ms));
  };

  const sendEmail = async (params) => {
    try {
      const res = await fetch(`/api/send-mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        toast.success('Message sent successfully!', {
          icon: '✅',
        });
        return true;
      } else {
        const messages = data?.errors ?? ['Failed to send message'];
        messages.forEach((msg) => toast.error(msg, { icon: '⚠️' }));
        return false;
      }
    } catch (error) {
      toast.error('Failed to send message', {
        icon: '⚠️',
      });
      return false;
    }
  };

  const onSubmit = async (data) => {
    if (launch !== 'idle') return;

    const templateParams = {
      subject: data.subject,
      name: data.name,
      email: data.email,
      message: data.message,
    };

    setLaunch('sending');
    const success = await sendEmail(templateParams);
    if (success) {
      setLaunch('rocket');
      // Deterministic state machine: timeouts aligned with animation durations
      // Rocket: 0.6s delay + 1.4s fly-up = ~2s, Checkmark: 0.5s enter + 2s display
      schedule(() => setLaunch('check'), 2000);
      // Remount the entire form component to get a fresh useForm() instance.
      // This avoids the known issue where reset() inside handleSubmit's callback
      // gets its state overridden by handleSubmit's finally block.
      schedule(onReset, 4500);
    } else {
      setLaunch('idle');
    }
  };

  return (
    <>
      <motion.form
        variants={container}
        initial="hidden"
        animate="show"
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full w-full max-w-xl flex-col items-center justify-center space-y-4 px-12 py-6"
      >
        {/* <motion.div variants={item} className="w-full">
          <h2 className="text-[2em] text-amethyst-neon">Message Me</h2>
        </motion.div> */}

        <motion.div variants={item} className="w-full">
          <label htmlFor="name" className="sr-only">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Full Name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name', {
              required: 'Full Name is required!',
              minLength: {
                value: 3,
                message: 'Name should be at least 3 characters long.',
              },
              maxLength: {
                value: 100,
                message: 'Name should be at most 100 characters long.',
              },
            })}
            className="custom-bg-2 w-full rounded-md p-2 text-foreground shadow-lg hover:shadow-[0_0_15px_#5c0099] focus:shadow-[0_0_10px_rgba(155,89,182,0.6)] focus:outline-none focus:ring-1 focus:ring-[rgba(155,89,182,0.8)]"
          />
        </motion.div>
        {errors.name && (
          <span
            id="name-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05' }}
          >
            {errors.name.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email', { required: 'Email is required!' })}
            className="custom-bg-2 w-full rounded-md p-2 text-foreground shadow-lg hover:shadow-[0_0_15px_#5c0099] focus:shadow-[0_0_10px_rgba(155,89,182,0.6)] focus:outline-none focus:ring-1 focus:ring-[rgba(155,89,182,0.8)]"
          />
        </motion.div>
        {errors.email && (
          <span
            id="email-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05' }}
          >
            {errors.email.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <label htmlFor="subject" className="sr-only">
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            placeholder="Subject"
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={errors.subject ? 'subject-error' : undefined}
            {...register('subject', {
              required: 'Subject is required!',
              maxLength: {
                // Keep in sync with maxRawSubjectLength in api/send-mail/route.js
                value: 175,
                message: 'Subject should be at most 175 characters long.',
              },
            })}
            className="custom-bg-2 w-full rounded-md p-2 text-foreground shadow-lg hover:shadow-[0_0_15px_#5c0099] focus:shadow-[0_0_10px_rgba(155,89,182,0.6)] focus:outline-none focus:ring-1 focus:ring-[rgba(155,89,182,0.8)]"
          />
        </motion.div>
        {errors.subject && (
          <span
            id="subject-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05' }}
          >
            {errors.subject.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <label htmlFor="message" className="sr-only">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={5}
            placeholder="Message"
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? 'message-error' : undefined}
            {...register('message', {
              required: 'Message is required!',
              maxLength: {
                value: 500,
                message: 'Message should be less than 500 characters',
              },
              minLength: {
                value: 50,
                message: 'Message should be more than 50 characters',
              },
            })}
            className="custom-bg-2 w-full resize-y rounded-md p-2 text-foreground shadow-lg hover:shadow-[0_0_15px_#5c0099] focus:shadow-[0_0_10px_rgba(155,89,182,0.6)] focus:outline-none focus:ring-1 focus:ring-[rgba(155,89,182,0.8)]"
          />
        </motion.div>
        {errors.message && (
          <span
            id="message-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05' }}
          >
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
          {launch === 'idle' || launch === 'sending' ? (
            <motion.input
              key="submit"
              id="submit-btn"
              name="submit"
              type="submit"
              aria-label="Send message"
              value={launch === 'sending' ? 'SENDING...' : 'SEND MESSAGE!'}
              disabled={launch === 'sending'}
              aria-busy={launch === 'sending'}
              className={`custom-bg-abt text-shadow-neon-light-orange rounded-full px-6 py-2 font-semibold tracking-wide shadow-sm transition-all duration-300 ${
                launch === 'sending'
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer hover:shadow-[0_0_20px_rgba(255,109,5,0.6)]'
              }`}
              whileHover={
                launch === 'sending' ? undefined : { scale: 1.08, y: -2 }
              }
              whileTap={launch === 'sending' ? undefined : { scale: 0.95 }}
              initial={{ scale: 1 }}
            />
          ) : launch === 'rocket' ? (
            <motion.div
              key="rocket"
              initial={{ scale: 1, opacity: 1, y: 0 }}
              animate={{ y: -500, opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeIn', delay: 0.6 }}
              className="relative flex flex-col items-center"
            >
              {/* 🚀 Rocket Body */}
              <motion.div
                initial={{ rotate: 0 }}
                animate={{
                  x: [0, -3, 3, -3, 3, 0],
                  rotate: [0, -2, 2, -2, 2, 0],
                }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
                className="relative h-20 w-10 rounded-b-lg rounded-t-full border-2 border-gray-400 bg-gradient-to-b from-gray-100 via-gray-300 to-gray-500 shadow-[0_0_20px_rgba(255,109,5,0.6)]"
              >
                {/* Rocket Nose Cone */}
                <div className="absolute -top-6 left-1/2 h-0 w-0 -translate-x-1/2 border-b-[24px] border-l-[20px] border-r-[20px] border-b-red-500 border-l-transparent border-r-transparent shadow-lg" />

                {/* Window */}
                <div className="absolute left-1/2 top-2 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-gray-600 bg-gradient-to-br from-sky-300 to-sky-600 shadow-inner" />

                {/* Fins */}
                <div className="absolute -bottom-1 -left-4 h-8 w-5 rotate-12 rounded-sm border border-red-800 bg-gradient-to-br from-red-500 to-red-700 shadow-lg" />
                <div className="absolute -bottom-1 -right-4 h-8 w-5 -rotate-12 rounded-sm border border-red-800 bg-gradient-to-bl from-red-500 to-red-700 shadow-lg" />

                {/* Flame/Exhaust */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.8 }}
                  animate={{
                    scale: [1, 1.4, 1.2, 1.5, 1],
                    opacity: [1, 0.8, 0.9, 0.7, 1],
                    scaleY: [1, 1.3, 1.1, 1.4, 1],
                  }}
                  transition={{ repeat: Infinity, duration: 0.2 }}
                  className="absolute -bottom-8 left-1/2 h-12 w-8 -translate-x-1/2 rounded-full bg-gradient-to-b from-yellow-300 via-orange-500 to-red-600 shadow-[0_0_20px_rgba(255,165,0,0.8)] blur-sm"
                />
              </motion.div>

              {/* Glowing Trail */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, height: 0 }}
                animate={{
                  opacity: [0, 0.9, 0.7, 0.5, 0],
                  scale: [0.8, 1, 1.2, 1.3, 1],
                  height: [0, 100, 200, 300, 400],
                }}
                transition={{ duration: 1.8, ease: 'easeOut' }}
                className="absolute left-1/2 top-16 w-6 -translate-x-1/2 rounded-full bg-gradient-to-b from-orange-400 via-orange-600 to-transparent shadow-[0_0_30px_rgba(255,109,5,0.8)] blur-xl"
              />
            </motion.div>
          ) : (
            <motion.div
              key="checkmark"
              initial={{ scale: 0, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.5, ease: 'backOut' }}
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-green-300 bg-gradient-to-br from-green-400 to-green-600 shadow-[0_0_25px_rgba(34,197,94,0.8),0_0_50px_rgba(34,197,94,0.4)]"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="text-4xl font-bold text-white"
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

// Wrapper that remounts FormContent via key after a successful send.
// This gives useForm() a completely fresh instance — no stale state.
export default function Form() {
  const [formKey, setFormKey] = useState(0);
  return <FormContent key={formKey} onReset={() => setFormKey((k) => k + 1)} />;
}
