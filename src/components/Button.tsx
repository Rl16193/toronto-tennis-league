import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { tapScale } from '../lib/motion';

interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
> {
  variant?: 'secondary' | 'outline' | 'ghost' | 'clay' | 'white';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'clay',
  size = 'md',
  isLoading,
  children,
  disabled,
  ...props
}) => {
  const variants = {
    secondary: 'bg-tennis-surface hover:bg-tennis-surface/80 text-fg border border-fg/10',
    outline: 'border border-clay text-clay-fg hover:bg-clay hover:text-white',
    ghost: 'hover:bg-fg/10 text-fg',
    clay: 'bg-clay hover:bg-clay-press text-white shadow-lg shadow-clay/20',
    white: 'bg-white hover:bg-white/90 text-ink shadow-lg shadow-black/10',
  };

  const sizes = {
    sm: 'h-11 px-6 rounded-2xl text-base',
    md: 'h-11 px-6 rounded-2xl text-base',
    lg: 'h-11 px-6 rounded-2xl text-base',
  };

  return (
    <motion.button
      whileTap={disabled || isLoading ? undefined : tapScale.whileTap}
      transition={tapScale.transition}
      type={props.type ?? 'button'}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl border border-transparent font-semibold transition-colors duration-200 disabled:cursor-not-allowed focus-visible',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </motion.button>
  );
};
