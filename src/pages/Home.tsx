import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, MapPin, ChevronRight, Star, CalendarDays } from 'lucide-react';
import { getDownloadURL, listAll, ref } from 'firebase/storage';
import { Button } from '../components/Button';
import { storage } from '../lib/firebase';
import { motion } from 'motion/react';

export const Home: React.FC = () => {
  const [galleryImages, setGalleryImages] = useState<string[]>([]);

  useEffect(() => {
    const loadGalleryImages = async () => {
      try {
        const galleryRef = ref(storage, 'Gallery');
        const result = await listAll(galleryRef);
        const urls = await Promise.all(result.items.map((item) => getDownloadURL(item)));
        setGalleryImages(urls);
      } catch (error) {
        console.error('Error loading gallery images:', error);
        setGalleryImages([]);
      }
    };

    loadGalleryImages();
  }, []);

  return (
    <div className="space-y-32 pb-32 overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20">
        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-clay/5 blur-[120px] -z-10 rounded-full translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-1/3 h-full bg-tennis-surface/20 blur-[100px] -z-10 rounded-full -translate-x-1/4 translate-y-1/4" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8"
          >
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-display font-black leading-[1.1] tracking-tighter text-white">
              Master the <span className="text-clay">Court.</span> <br />
              Own the <span className="text-clay">Game.</span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed max-w-xl">
              Join an exclusive tennis community in Toronto for some friendly competitions. Find your perfect match and elevate your game.
            </p>
            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 pt-4">
              <Link to="/signup" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto group">
                  Join the League
                  <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/events" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Explore Events
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: 5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="relative hidden lg:block"
          >
            <div className="relative z-10 rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white/5 transform hover:scale-[1.02] transition-transform duration-500">
              <img
                src="https://firebasestorage.googleapis.com/v0/b/toronto-tennis-league.firebasestorage.app/o/LandingPage%2FTennis%20Collage.jpg?alt=media&token=48ab775f-29a4-4bbb-abfc-3c98c694f8b1"
                alt="Toronto Tennis League collage"
                className="w-full h-auto"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Decorative Elements */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-clay/20 blur-3xl -z-10 rounded-full" />
            <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-tennis-surface/30 blur-3xl -z-10 rounded-full" />
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-20">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white">Why Join the League?</h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            We've built the ultimate platform for tennis enthusiasts to connect, compete, and grow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              title: 'Premium Events',
              desc: '4+ tournaments organized.',
              icon: Trophy,
              color: 'bg-clay'
            },
            {
              title: 'Local Community',
              desc: 'Connect with over 80+ players that have participated in our events.',
              icon: Users,
              color: 'bg-tennis-surface'
            },
            {
              title: 'Flexible Scheduling',
              desc: 'Play tournament matches whenever and wherever.',
              icon: MapPin,
              color: 'bg-clay-dark'
            },
            {
              title: 'Weekly Meetups',
              desc: 'Join an active group of tennis players at weekly events to learn more about the community.',
              icon: CalendarDays,
              color: 'bg-tennis-surface'
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="p-10 rounded-[2.5rem] bg-tennis-surface/30 border border-white/5 hover:border-clay/30 transition-all duration-300 group"
            >
              <div className={`w-16 h-16 ${feature.color} rounded-2xl flex items-center justify-center mb-8 shadow-xl group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Gallery Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-20">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white">Past Tournaments</h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            A look back at some of our most exciting matches and community events across Toronto.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {galleryImages.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              viewport={{ once: true }}
              className="aspect-square rounded-3xl overflow-hidden border border-white/5 group relative"
            >
              <img 
                src={img} 
                alt={`Tournament ${i + 1}`} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-clay/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Star className="w-6 h-6 text-white fill-white" />
                </div>
              </div>
            </motion.div>
          ))}
          {galleryImages.length === 0 && (
            <div className="col-span-2 md:col-span-4 rounded-[2rem] border border-dashed border-white/10 p-10 text-center text-gray-400">
              Gallery images will appear here once files are added to Firebase Storage under `Gallery/`.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
