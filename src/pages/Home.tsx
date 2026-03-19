import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Users, Trophy, MapPin, Clock } from 'lucide-react';

export const Home = () => {
  return (
    <div className="bg-rg-deep">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-rg-deep text-white">
        <div className="absolute inset-0">
          <img
            src="https://picsum.photos/seed/tennis-hero/1920/1080?blur=2"
            alt="Tennis Court"
            className="w-full h-full object-cover opacity-40"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center md:text-left"
          >
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
              <span className="block text-clay">Game. Set.</span>
              <span className="block text-white">Events.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-xl text-slate-200 mx-auto md:mx-0 mb-10">
              Toronto's premier community tennis league. Find partners, join tournaments, and elevate your game.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-full text-white bg-clay hover:bg-clay-dark transition-transform hover:scale-105"
              >
                Sign Up Now
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-8 py-4 border-2 border-clay/50 text-lg font-bold rounded-full text-white hover:bg-rg-green transition-colors"
              >
                Login
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-rg-green/50 rounded-2xl p-8 shadow-sm border border-white/10 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 bg-clay/20 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-clay" />
            </div>
            <h3 className="text-4xl font-bold text-white mb-2">100+</h3>
            <p className="text-slate-200 font-medium">Active Players</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="bg-rg-green/50 rounded-2xl p-8 shadow-sm border border-white/10 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 bg-rg-green/30 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-clay" />
            </div>
            <h3 className="text-4xl font-bold text-white mb-2">4</h3>
            <p className="text-slate-200 font-medium">Seasonal Tournaments</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
            className="bg-rg-green/50 rounded-2xl p-8 shadow-sm border border-white/10 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 bg-rg-green/30 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-clay" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 mt-2">Weekly Meetups</h3>
            <p className="text-slate-200 font-medium text-sm">Regular weekly meetups give players the opportunity to play, connect with other tennis enthusiasts, and become part of a vibrant tennis community.</p>
          </motion.div>
        </div>
      </div>

      {/* About & Gallery Section */}
      <div id="about" className="bg-rg-green py-20 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-extrabold text-white tracking-tight mb-4">About the League</h2>
            <div className="space-y-6 text-lg text-slate-200">
              <p>
                Our league was created by a group of tennis enthusiasts who enjoy competing and bringing people together through the sport. We run a community-driven tennis league where amateurs and newcomers to the city can meet, play, and connect with other players.
              </p>
              <p>
                We host weekly meetups for casual matches and conversation, along with seasonal tournaments that give players a chance to compete and track their progress. The goal is simple: create a welcoming space where players can improve their game, meet new people, and enjoy a bit of friendly competition.
              </p>
            </div>
          </div>

          <h3 className="text-2xl font-bold text-white mb-8 text-center">Past Tournaments Gallery</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              'PXL_20251019_145836892.jpg',
              'PXL_20250817_153708940.jpg',
              'PXL_20250906_153354689.MP.jpg',
              'PXL_20251011_163303599.MP.jpg',
              'PXL_20251011_171958140.jpg',
              'PXL_20251018_180226625.MP.jpg',
              'PXL_20251011_194500200.MP.jpg',
              'PXL_20250817_174210433.jpg'
            ].map((img, i) => (
              <motion.div
                key={img}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative h-64 rounded-2xl overflow-hidden group"
              >
                <img
                  src={`/${img}`}
                  alt={`Tournament highlight ${i + 1}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-rg-deep/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                  <span className="text-white font-bold">Tournament Highlight</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
