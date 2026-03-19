import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../types';
import { mockUser } from '../data/mockData';

interface AuthContextType {
  user: User | null;
  login: () => void;
  loginWithEmail: (email: string, password: string) => void;
  loginWithGoogle: () => void;
  logout: () => void;
  signup: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = () => {
    setUser(mockUser);
  };

  const loginWithEmail = (email: string, password: string) => {
    // Mock login logic
    console.log('Logging in with:', email, password);
    setUser({ ...mockUser, email });
  };

  const loginWithGoogle = () => {
    // Mock Google login logic
    console.log('Logging in with Google');
    setUser({ ...mockUser, displayName: 'Google User' });
  };

  const logout = () => {
    setUser(null);
  };

  const signup = (userData: Partial<User>) => {
    const newUser: User = {
      ...mockUser,
      ...userData,
      id: Math.random().toString(36).substr(2, 9),
      stats: { wins: 0, losses: 0, winRate: 0 },
      playingHistory: [],
    };
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithEmail, loginWithGoogle, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
