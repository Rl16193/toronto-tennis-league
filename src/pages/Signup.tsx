import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';

const COURTS = [
  'Trinity Bellwoods',
  'High Park',
  'Riverdale Park East',
  'Ramsden Park',
  'Eglinton Flats',
  'Marilyn Bell',
  'Sorauren Park',
];

export const Signup = () => {
  const navigate = useNavigate();
  const { signup, login, loginWithGoogle } = useAuth();
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [motto, setMotto] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    email: '',
    password: '',
    phone: '',
    skillLevel: 3.0,
    preferredCourts: [] as string[],
    joinLeague: true,
    acceptRules: false,
  });

  const handleCourtToggle = (court: string) => {
    setFormData(prev => ({
      ...prev,
      preferredCourts: prev.preferredCourts.includes(court)
        ? prev.preferredCourts.filter(c => c !== court)
        : [...prev.preferredCourts, court]
    }));
  };

  const handleGoogleSignup = () => {
    loginWithGoogle();
    navigate('/events');
  };

  const handleFinalize = async () => {
    setIsGenerating(true);
    // Simulate AI motto generation
    setTimeout(() => {
      const generatedMotto = "Play with heart, win with grace.";
      setMotto(generatedMotto);
      setIsGenerating(false);
      
      setTimeout(() => {
        signup({
          ...formData,
          motto: generatedMotto,
          avatar: `https://picsum.photos/seed/${formData.displayName || 'user'}/200/200`
        });
        navigate('/events');
      }, 2000);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-rg-deep py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 bg-rg-green p-8 rounded-3xl shadow-sm border border-white/10">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">
            {step === 1 && "Create your profile"}
            {step === 2 && "Tennis details"}
            {step === 3 && "Finalize"}
            {step === 4 && "Welcome to the League"}
          </h2>
          <div className="mt-4 flex justify-center space-x-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-12 rounded-full ${
                  s <= step ? 'bg-clay' : 'bg-white/10'
                } transition-colors duration-300`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-center">
                <div className="relative w-24 h-24 bg-rg-deep rounded-full flex items-center justify-center border-2 border-dashed border-white/10 cursor-pointer hover:bg-rg-deep/80 transition-colors">
                  <Camera className="w-8 h-8 text-slate-400" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/5 rounded-full transition-opacity">
                    <span className="text-xs font-medium text-slate-200">Upload</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200">Full Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="mt-1 block w-full rounded-xl border-white/10 shadow-sm focus:border-clay focus:ring-clay sm:text-sm px-4 py-3 bg-rg-deep border text-white placeholder-slate-500"
                    placeholder="Roger Federer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200">Display Name</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={e => setFormData({...formData, displayName: e.target.value})}
                    className="mt-1 block w-full rounded-xl border-white/10 shadow-sm focus:border-clay focus:ring-clay sm:text-sm px-4 py-3 bg-rg-deep border text-white placeholder-slate-500"
                    placeholder="RogerF"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="mt-1 block w-full rounded-xl border-white/10 shadow-sm focus:border-clay focus:ring-clay sm:text-sm px-4 py-3 bg-rg-deep border text-white placeholder-slate-500"
                    placeholder="roger@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="mt-1 block w-full rounded-xl border-white/10 shadow-sm focus:border-clay focus:ring-clay sm:text-sm px-4 py-3 bg-rg-deep border text-white placeholder-slate-500"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="mt-1 block w-full rounded-xl border-white/10 shadow-sm focus:border-clay focus:ring-clay sm:text-sm px-4 py-3 bg-rg-deep border text-white placeholder-slate-500"
                    placeholder="416-555-0123"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => setStep(2)}
                  disabled={!formData.name || !formData.email || !formData.password}
                  className="w-full inline-flex justify-center py-3 px-6 border border-transparent shadow-sm text-sm font-medium rounded-full text-white bg-clay hover:bg-clay-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clay disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next Step
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-rg-green text-slate-400">Or sign up with</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleGoogleSignup}
                    className="w-full inline-flex justify-center py-2.5 px-4 border border-white/10 rounded-xl shadow-sm bg-rg-deep text-sm font-medium text-slate-200 hover:bg-rg-deep/80 transition-colors"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2" />
                    Google
                  </button>
                  <button
                    onClick={handleGoogleSignup}
                    className="w-full inline-flex justify-center py-2.5 px-4 border border-white/10 rounded-xl shadow-sm bg-rg-deep text-sm font-medium text-slate-200 hover:bg-rg-deep/80 transition-colors"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/facebook.svg" alt="Facebook" className="w-5 h-5 mr-2" />
                    Facebook
                  </button>
                </div>
              </div>

              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-sm font-medium text-slate-400 hover:text-white"
                >
                  Already have an account? Log in
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  NTRP Skill Level: {formData.skillLevel.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.5"
                  value={formData.skillLevel}
                  onChange={e => setFormData({...formData, skillLevel: parseFloat(e.target.value)})}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-clay"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>Beginner (1.0)</span>
                  <span>Advanced (5.0)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-3">
                  Preferred Courts (Select up to 3)
                </label>
                <div className="flex flex-wrap gap-2">
                  {COURTS.map(court => (
                    <button
                      key={court}
                      onClick={() => handleCourtToggle(court)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                        formData.preferredCourts.includes(court)
                          ? 'bg-clay/20 border-clay text-clay'
                          : 'bg-rg-deep border-white/10 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      {court}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm font-medium text-slate-400 hover:text-white"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={formData.preferredCourts.length === 0}
                  className="inline-flex justify-center py-3 px-6 border border-transparent shadow-sm text-sm font-medium rounded-full text-white bg-clay hover:bg-clay-dark disabled:opacity-50 transition-colors"
                >
                  Next Step
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-rg-deep p-6 rounded-2xl border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">Join Seasonal League</span>
                  <button
                    onClick={() => setFormData({...formData, joinLeague: !formData.joinLeague})}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formData.joinLeague ? 'bg-clay' : 'bg-white/10'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formData.joinLeague ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
                
                <div className="flex items-start">
                  <div className="flex h-5 items-center">
                    <input
                      id="rules"
                      type="checkbox"
                      checked={formData.acceptRules}
                      onChange={e => setFormData({...formData, acceptRules: e.target.checked})}
                      className="h-4 w-4 rounded border-white/10 text-clay focus:ring-clay bg-rg-deep"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="rules" className="font-medium text-slate-200">
                      I accept the community rules
                    </label>
                    <p className="text-slate-400">Play fair, respect others, and have fun.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="text-sm font-medium text-slate-400 hover:text-white"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    setStep(4);
                    handleFinalize();
                  }}
                  disabled={!formData.acceptRules}
                  className="inline-flex justify-center py-3 px-6 border border-transparent shadow-sm text-sm font-medium rounded-full text-white bg-clay hover:bg-clay-dark disabled:opacity-50 transition-colors"
                >
                  Complete Profile
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center space-y-6"
            >
              {isGenerating ? (
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="w-12 h-12 text-clay animate-spin" />
                  <p className="text-slate-300 font-medium animate-pulse">
                    AI is generating your player motto...
                  </p>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="w-20 h-20 bg-clay/20 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-clay" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Your AI Motto</h3>
                    <p className="mt-4 text-2xl font-serif italic text-clay">
                      "{motto}"
                    </p>
                  </div>
                  <p className="text-sm text-slate-400">Redirecting to events...</p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
