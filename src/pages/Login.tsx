import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ensureUserProfileDocuments } from '../lib/profileBootstrap';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Mail, Lock, Chrome, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  React.useEffect(() => {
    if (!authLoading && user) {
      navigate('/events');
    }
  }, [authLoading, navigate, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/events');
    } catch (err: any) {
      setError(err.message || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserProfileDocuments(result.user);
      sessionStorage.setItem(`profile-bootstrap-pending:${result.user.uid}`, '1');
      sessionStorage.removeItem(`profile-bootstrap-retry:${result.user.uid}`);
      navigate('/events');
    } catch (err: any) {
      setError(err.message || 'Google login failed.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-20 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-clay/10 blur-[100px] -z-10 rounded-full" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-tennis-surface/20 blur-[100px] -z-10 rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-tennis-surface/40 backdrop-blur-xl border border-white/5 p-10 rounded-[3rem] shadow-2xl"
      >
        <div className="text-center space-y-4 mb-10">
          <div className="w-16 h-16 clay-gradient rounded-2xl mx-auto flex items-center justify-center shadow-xl mb-6">
            <span className="text-3xl font-bold text-white">T</span>
          </div>
          <h2 className="text-3xl font-display font-bold text-white">
            {showForgot ? 'Reset Password' : 'Welcome Back'}
          </h2>
          <p className="text-gray-400">
            {showForgot 
              ? 'Enter your email to receive a reset link.' 
              : 'Sign in to access your tennis profile.'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {resetSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6 py-8"
            >
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Email Sent!</h3>
                <p className="text-gray-400">Check your inbox for instructions to reset your password.</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => {
                setResetSent(false);
                setShowForgot(false);
              }}>
                Back to Login
              </Button>
            </motion.div>
          ) : (
            <form onSubmit={showForgot ? handleResetPassword : handleLogin} className="space-y-6">
              {error && (
                <div className="flex items-center space-x-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                {!showForgot && (
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                )}
              </div>

              {!showForgot && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-sm font-medium text-clay hover:text-clay-dark transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <Button type="submit" className="w-full group" isLoading={loading}>
                {showForgot ? 'Send Reset Link' : 'Sign In'}
                {!loading && <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />}
              </Button>

              {!showForgot && (
                <>
                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/5"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-tennis-dark px-4 text-gray-500 font-bold tracking-widest">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full border border-white/5"
                    onClick={handleGoogleLogin}
                  >
                    <Chrome className="mr-2 w-5 h-5" />
                    Google Account
                  </Button>
                </>
              )}

              <div className="text-center pt-6">
                <p className="text-gray-400 text-sm">
                  {showForgot ? (
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      className="text-clay font-bold hover:underline"
                    >
                      Back to Login
                    </button>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <Link to="/signup" className="text-clay font-bold hover:underline">
                        Sign Up
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
