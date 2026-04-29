import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, MapPin, Star } from 'lucide-react';
import { getDownloadURL, listAll, ref } from 'firebase/storage';
import { Button } from '../components/Button';
import { storage } from '../lib/firebase';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

export const Home: React.FC = () => {
  const { user } = useAuth();
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const galleryPreview = useMemo(() => galleryImages.slice(0, 4), [galleryImages]);

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
    <div className="space-y-12 pb-16 overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[55vh] flex items-center pt-12">
        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-clay/5 blur-[120px] -z-10 rounded-full translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-1/3 h-full bg-tennis-surface/20 blur-[100px] -z-10 rounded-full -translate-x-1/4 translate-y-1/4" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 gap-6 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            <img
              src="https://firebasestorage.googleapis.com/v0/b/toronto-tennis-league.firebasestorage.app/o/LandingPage%2FScreenshot%202026-04-26%20165830.png?alt=media&token=6f61bcf6-6424-4852-83ba-a8f1865849dd"
              alt="Racquets & Strings"
              className="w-full max-w-sm md:max-w-md lg:max-w-lg object-contain opacity-85 mix-blend-lighten mb-6"
              referrerPolicy="no-referrer"
            />
            <p className="text-base md:text-lg text-gray-400 leading-relaxed max-w-xl mx-auto text-center mb-6">
              Join a thriving community of Tennis Enthusiasts in Toronto.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              {user ? (
                <Link to="/events" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto">
                    Explore Events
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/events" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto">
                      Explore Events
                    </Button>
                  </Link>
                  <Link to="/signup?returnTo=%2Fevents&intent=join-league" className="w-full sm:w-auto">
                    <Button size="lg" className="w-full sm:w-auto">
                      Join the League
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">Test Your Racquet Skills</h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-sm md:text-base">
            Join the league to get event updates and access to your player profile.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              title: 'Events',
              desc: '4 last year. More to come!',
              icon: Trophy,
              color: 'bg-clay'
            },
            {
              title: 'Community',
              desc: 'Connect with other players at our events. Find your doubles partner.',
              icon: Users,
              color: 'bg-tennis-surface'
            },
            {
              title: 'Flexible',
              desc: 'Play your matches at times that work for you.',
              icon: MapPin,
              color: 'bg-clay-dark'
            },
          ].map((feature, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="p-6 md:p-8 rounded-[2rem] bg-tennis-surface/30 border border-white/5 hover:border-clay/30 transition-all duration-300 group"
            >
              <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Gallery Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-3 mb-8">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-white">2025</h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg">
            Our past events.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {galleryPreview.map((img, i) => (
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
              Loading...
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
