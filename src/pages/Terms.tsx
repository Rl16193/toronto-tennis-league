import React from 'react';
import { motion } from 'motion/react';

export const Terms = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-8 md:p-12"
      >
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-8">Terms & Conditions</h1>
        
        <div className="prose prose-invert max-w-none space-y-6 text-slate-200">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Participation Agreement</h2>
            <p>
              By joining the Community Tennis League (CTL), you agree to participate in a sportsmanlike manner. Our league is built on mutual respect and a shared love for tennis.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Player Conduct</h2>
            <p>
              Players are expected to be punctual for matches and communicate clearly with their opponents. Any form of harassment, discrimination, or unsportsmanlike behavior will result in immediate removal from the league.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. Liability Waiver</h2>
            <p>
              Participation in tennis matches involves physical activity and inherent risks. By participating in CTL events, you acknowledge that you are playing at your own risk. The league organizers are not responsible for any injuries, medical expenses, or property damage incurred during matches or at court locations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Match Rules</h2>
            <p>
              All matches must follow the official league rules as outlined on our Rules page. This includes scoring formats, challenge protocols, and court etiquette.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Fees and Refunds</h2>
            <p>
              Tournament entry fees are used to cover administrative costs and prizes. Fees are generally non-refundable unless a tournament is cancelled by the organizers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Amendments</h2>
            <p>
              The league organizers reserve the right to update these terms and the league rules at any time to ensure the best experience for all participants.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
};
