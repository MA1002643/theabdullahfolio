'use client';

import React from 'react';
import Link from 'next/link';
import {
  Github,
  Home,
  Linkedin,
  Notebook,
  Palette,
  Phone,
  User,
  Briefcase,
} from 'lucide-react';

const getIcon = (icon) => {
  switch (icon) {
    case 'about':
      return <User className="h-auto w-full" strokeWidth={1.5} />;
    case 'projects':
      return <Palette className="h-auto w-full" strokeWidth={1.5} />;
    case 'qualifications':
      return <Briefcase className="h-auto w-full" strokeWidth={1.5} />;
    case 'contact':
      return <Phone className="h-auto w-full" strokeWidth={1.5} />;
    case 'github':
      return <Github className="h-auto w-full" strokeWidth={1.5} />;
    case 'linkedin':
      return <Linkedin className="h-auto w-full" strokeWidth={1.5} />;
    case 'resume':
      return <Notebook className="h-auto w-full" strokeWidth={1.5} />;
    default:
      return <Home className="h-auto w-full" strokeWidth={1.5} />;
  }
};

const NavButton = ({ x, y, label, link, icon, newTab }) => {
  return (
    <div
      className="absolute z-50 cursor-pointer"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <Link
        href={link}
        target={newTab ? '_blank' : '_self'}
        aria-label={label}
        name={label}
        className="custom-bg flex items-center justify-center rounded-full text-foreground transition-colors duration-300 hover:bg-accent/20"
      >
        <span className="hover:pause relative h-14 w-14 animate-spin-slow-reverse p-4 hover:text-accent">
          {getIcon(icon)}

          <span className="peer absolute left-0 top-0 h-full w-full bg-transparent" />

          <span className="absolute left-full top-1/2 mx-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-background px-2 py-1 text-sm text-foreground shadow-lg peer-hover:block">
            {label}
          </span>
        </span>
      </Link>
    </div>
  );
};

export default NavButton;
