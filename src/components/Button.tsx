import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { tapScale } from '../lib/motion';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'clay' | 'white';
  size?: 'sm' | 'md' | 'lg';
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
  const variants = {
    primary: 'bg-clay hover:bg-clay-dark text-white shadow-lg shadow-clay/20',
    secondary: 'bg-tennis-surface hover:bg-tennis-surface/80 text-fg',
    outline: 'border-2 border-clay text-clay hover:bg-clay hover:text-white',
    ghost: 'hover:bg-fg/10 text-fg',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    clay: 'bg-clay hover:bg-clay-dark text-white shadow-lg shadow-clay/20',
    white: 'bg-white hover:bg-white/90 text-ink shadow-lg shadow-black/10',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-2.5',
    lg: 'px-8 py-3.5 text-lg',
  };

  return (
    <motion.button
      whileTap={disabled || isLoading ? undefined : tapScale.whileTap}
      transition={tapScale.transition}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : null}
      {children}
    </motion.button>
  );
};
