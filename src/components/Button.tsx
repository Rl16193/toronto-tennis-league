import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { tapScale } from '../lib/motion';

/** The homepage focus ring. Every focusable control wears it. */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay';

const variants = {
  clay: 'bg-clay hover:bg-clay-dark text-white shadow-lg shadow-clay/20',
  secondary: 'bg-fg/5 hover:bg-fg/10 text-fg',
  outline: 'border-2 border-clay text-clay hover:bg-clay hover:text-white',
  ghost: 'hover:bg-fg/10 text-fg',
  white: 'bg-white hover:bg-white/90 text-ink shadow-lg shadow-black/10',
  // Support CTAs only (Donate / Subscribe / Volunteer). `text-ink` is deliberate and fixed:
  // the lime fill is light in BOTH themes, so `text-fg` would go invisible in dark. See index.css.
  lime: 'bg-lime hover:bg-lime-press text-ink shadow-lg shadow-lime/20',
};

// Fixed heights: `sm` (36px) is for actions inside a dense row, `md` (44px) for everything else.
const sizes = {
  sm: 'h-9 px-3 text-sm [&_svg]:size-3.5',
  md: 'h-11 px-6 text-base [&_svg]:size-4',
  lg: 'h-12 px-8 text-lg [&_svg]:size-5',
};

export type ButtonVariant = keyof typeof variants | 'primary';
export type ButtonSize = keyof typeof sizes;

/** Button's classes, for anything button-shaped that can't be a <button> (a link, a label). */
export const buttonCls = (variant: ButtonVariant = 'clay', size: ButtonSize = 'md') => cn(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold leading-none',
  'cursor-pointer transition-colors duration-200 [&_svg]:shrink-0 disabled:opacity-50 disabled:cursor-not-allowed',
  focusRing,
  variants[variant === 'primary' ? 'clay' : variant],
  sizes[size],
);

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  isLoading,
  children,
  disabled,
  ...props
}) => {
  return (
    <motion.button
      whileTap={disabled || isLoading ? undefined : tapScale.whileTap}
      transition={tapScale.transition}
      className={cn(buttonCls(variant, size), className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </motion.button>
  );
};
