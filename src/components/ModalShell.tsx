import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';

type Props = {
  children: React.ReactNode;
  maxWidthClassName?: string;
  onClose: () => void;
};

export const ModalShell: React.FC<Props> = ({
  children,
  maxWidthClassName = 'max-w-3xl',
  onClose,
}) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 bg-tennis-dark/80 backdrop-blur-md"
    />
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 20 }}
      className={`relative w-full ${maxWidthClassName} bg-tennis-surface border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto`}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 z-10 w-10 h-10 bg-tennis-dark/50 hover:bg-tennis-dark rounded-full flex items-center justify-center text-white transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
      {children}
    </motion.div>
  </div>
);
