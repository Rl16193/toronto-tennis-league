import React from 'react';
import { motion } from 'motion/react';

export const Privacy = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-8 md:p-12"
      >
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-8">Privacy & Data Use Policy</h1>
        
        <div className="prose prose-invert max-w-none space-y-6 text-slate-200">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us when you create an account, such as your name, email address, phone number, skill level, and preferred court locations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. How We Use Your Data</h2>
            <p>
              Your data is used to:
            </p>
            <ul className="list-disc ml-6 space-y-2">
              <li>Facilitate match-making and tournament brackets.</li>
              <li>Communicate league updates and match schedules.</li>
              <li>Display your player profile and stats to other league members.</li>
              <li>Improve our services and community experience.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. Data Sharing</h2>
            <p>
              To facilitate matches, your display name and skill level are visible to other members. Contact information (email/phone) is only shared with players you are matched with for the purpose of scheduling games. We do not sell your personal data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Data Security</h2>
            <p>
              We implement reasonable security measures to protect your personal information from unauthorized access or disclosure. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Your Choices</h2>
            <p>
              You can update your profile information at any time through your account settings. If you wish to delete your account and data, please contact the league organizers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Cookies</h2>
            <p>
              We use cookies to maintain your session and provide a personalized experience. You can disable cookies in your browser settings, but some features of the app may not function correctly.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
};
