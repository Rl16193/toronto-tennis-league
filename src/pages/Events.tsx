import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Calendar, ArrowRight, X } from 'lucide-react';
import { mockEvents } from '../data/mockData';
import { Event } from '../types';

export const Events = () => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">Upcoming Events</h1>
        <p className="mt-2 text-lg text-slate-200">Join tournaments, casual meetups, and clinics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {mockEvents.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-rg-green rounded-3xl overflow-hidden shadow-sm border border-white/10 hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => setSelectedEvent(event)}
          >
            <div className="relative h-48 overflow-hidden">
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-4 left-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  event.type === 'Tournament' ? 'bg-clay text-white' :
                  event.type === 'Clinic' ? 'bg-slate-700 text-white' :
                  'bg-white/20 text-white backdrop-blur-md'
                }`}>
                  {event.type}
                </span>
              </div>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2">{event.title}</h3>
              <div className="space-y-2 mb-6">
                <div className="flex items-center text-slate-400 text-sm">
                  <MapPin className="w-4 h-4 mr-2" />
                  {event.location}
                </div>
                <div className="flex items-center text-slate-400 text-sm">
                  <Calendar className="w-4 h-4 mr-2" />
                  {event.date}
                </div>
              </div>
              <button className="w-full flex items-center justify-center py-3 px-4 border border-white/10 rounded-xl text-sm font-medium text-slate-200 hover:bg-white/5 transition-colors group-hover:border-clay group-hover:bg-clay/10">
                View Details
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Event Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvent(null)}
              className="fixed inset-0 bg-rg-deep/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-rg-green rounded-3xl shadow-xl z-50 overflow-hidden border border-white/10"
            >
              <div className="relative h-64">
                <img
                  src={selectedEvent.image}
                  alt={selectedEvent.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 ${
                  selectedEvent.type === 'Tournament' ? 'bg-clay/20 text-clay' :
                  selectedEvent.type === 'Clinic' ? 'bg-white/10 text-slate-200' :
                  'bg-white/10 text-slate-200'
                }`}>
                  {selectedEvent.type}
                </span>
                <h2 className="text-3xl font-bold text-white mb-4">{selectedEvent.title}</h2>
                <div className="space-y-3 mb-8">
                  <div className="flex items-center text-slate-300">
                    <MapPin className="w-5 h-5 mr-3 text-slate-400" />
                    {selectedEvent.location}
                  </div>
                  <div className="flex items-center text-slate-300">
                    <Calendar className="w-5 h-5 mr-3 text-slate-400" />
                    {selectedEvent.date}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="w-full py-4 px-6 rounded-full text-center font-bold text-white bg-clay hover:bg-clay-dark transition-colors"
                >
                  Join Event
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
