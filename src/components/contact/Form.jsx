'use client';
import React from 'react';
import { useForm } from 'react-hook-form';
import emailjs from '@emailjs/browser';
import { Toaster, toast } from 'sonner';
import { motion } from 'framer-motion';

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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const sendEmail = (params) => {
    const toastId = toast.loading('Sending your message, please wait...');

    toast.info(
      'Form submissions are demo-only here. Please checkout the final code repo to enable it. If you want to connect you can reach out to me via codebucks27@gmail.com.',
      {
        id: toastId,
      },
    );

    // comment out the above toast.info and uncomment the below code to enable emailjs

    // emailjs
    //   .send(
    //     process.env.NEXT_PUBLIC_SERVICE_ID,
    //     process.env.NEXT_PUBLIC_TEMPLATE_ID,
    //     params,
    //     {
    //       publicKey: process.env.NEXT_PUBLIC_PUBLIC_KEY,
    //       limitRate: {
    //         throttle: 5000, // you can not send more then 1 email per 5 seconds
    //       },
    //     }
    //   )
    //   .then(
    //     () => {
    //       toast.success(
    //         "I have received your message, I will get back to you soon!",
    //         {
    //           id: toastId,
    //         }
    //       );
    //     },
    //     (error) => {
    //       // console.log("FAILED...", error.text);
    //       toast.error(
    //         "There was an error sending your message, please try again later!",
    //         {
    //           id: toastId,
    //         }
    //       );
    //     }
    //   );
  };

  const onSubmit = (data) => {
    const templateParams = {
      to_name: 'CodeBucks',
      from_name: data.name,
      reply_to: data.email,
      message: data.message,
    };

    sendEmail(templateParams);
  };

  return (
    <>
      <Toaster richColors={true} />
      <motion.form
        variants={container}
        initial="hidden"
        animate="show"
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full max-w-md flex-col items-center justify-center space-y-4"
      >
        <motion.input
          variants={item}
          type="text"
          placeholder="name"
          {...register('name', {
            required: 'This field is required!',
            minLength: {
              value: 3,
              message: 'Name should be atleast 3 characters long.',
            },
          })}
          className="custom-bg w-full rounded-md p-2 text-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        {errors.name && (
          <span className="inline-block self-start text-accent">
            {errors.name.message}
          </span>
        )}
        <motion.input
          variants={item}
          type="email"
          placeholder="email"
          {...register('email', { required: 'This field is required!' })}
          className="custom-bg w-full rounded-md p-2 text-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        {errors.email && (
          <span className="inline-block self-start text-accent">
            {errors.email.message}
          </span>
        )}
        <motion.textarea
          variants={item}
          placeholder="message"
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
          className="custom-bg w-full rounded-md p-2 text-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        {errors.message && (
          <span className="inline-block self-start text-accent">
            {errors.message.message}
          </span>
        )}

        <motion.input
          variants={item}
          value="Cast your message!"
          className="cursor-pointer rounded-md border border-solid border-accent/30 bg-background px-10 py-4 capitalize text-foreground shadow-lg backdrop-blur-sm hover:shadow-glass-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          type="submit"
        />
      </motion.form>
    </>
  );
}
