import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, MapPin, ExternalLink, Info } from 'lucide-react';
import courtsData from '../data/courts.geojson?url';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper to calculate distance between two coordinates in km
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// Component to update map view when location changes
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

export const CourtLocator = () => {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<[number, number]>([43.7, -79.4]); // Default Toronto
  const [isSearching, setIsSearching] = useState(false);
  
  // Filters
  const [winterPlayFilter, setWinterPlayFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [lightsFilter, setLightsFilter] = useState('All');

  useEffect(() => {
    fetch(courtsData)
      .then(res => res.json())
      .then(data => {
        // Transform data based on rules
        const transformedFeatures = data.features.map((feature: any) => {
          const props = { ...feature.properties };
          
          if (props.WinterPlay === 'Yes' && props.Type === 'Public') {
            props.WinterPlay = 'Weather-dependent';
          }
          
          if (props.Lights === 'Yes') {
            props.Insight = 'Courts available for play till 11 pm';
          }
          
          return { ...feature, properties: props };
        });
        
        setGeoJsonData({ ...data, features: transformedFeatures });
      })
      .catch(err => console.error("Failed to load geojson", err));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ' Toronto')}`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        setUserLocation([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      } else {
        alert('Location not found. Please try another search.');
      }
    } catch (error) {
      console.error('Error searching location:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Filter and sort courts
  const nearestCourts = useMemo(() => {
    if (!geoJsonData) return [];

    let filtered = geoJsonData.features.filter((feature: any) => {
      const props = feature.properties;
      
      const winterPlayValue = props.WinterPlay || 'No';
      if (winterPlayFilter !== 'All' && winterPlayValue !== winterPlayFilter) return false;
      if (typeFilter !== 'All' && props.Type !== typeFilter) return false;
      if (lightsFilter !== 'All' && props.Lights !== lightsFilter) return false;
      
      return true;
    });

    // Calculate distance and sort
    const withDistance = filtered.map((feature: any) => {
      // GeoJSON coordinates are [longitude, latitude]
      const [lon, lat] = feature.geometry.coordinates;
      const distance = getDistanceFromLatLonInKm(userLocation[0], userLocation[1], lat, lon);
      return { ...feature, distance };
    });

    withDistance.sort((a: any, b: any) => a.distance - b.distance);
    
    return withDistance.slice(0, 5); // Get top 5
  }, [geoJsonData, userLocation, winterPlayFilter, typeFilter, lightsFilter]);

  const onEachFeature = (feature: any, layer: any) => {
    if (feature.properties && feature.properties.Name) {
      const p = feature.properties;
      const popupContent = `
        <div class="font-sans text-blue-950">
          <h3 class="font-bold mb-1">${p.Name}</h3>
          <p class="text-sm mb-1"><strong>Courts:</strong> ${p.Courts || 'Unknown'}</p>
          <p class="text-sm mb-1"><strong>Lights:</strong> ${p.Lights || 'Unknown'}</p>
          <p class="text-sm mb-1"><strong>Type:</strong> ${p.Type || 'Unknown'}</p>
          <p class="text-sm"><strong>Winter Play:</strong> ${p.WinterPlay || 'No'}</p>
        </div>
      `;
      layer.bindPopup(popupContent);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">Court Locator</h1>
        <p className="mt-2 text-lg text-blue-200">Find the best tennis courts near you.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Search & Filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-blue-900 rounded-3xl shadow-sm border border-blue-800 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Search Location</h2>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-grow">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-blue-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-blue-700 rounded-xl leading-5 bg-blue-950 text-white placeholder-blue-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 sm:text-sm"
                  placeholder="Enter your location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-blue-950 bg-cyan-400 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-400 disabled:opacity-50"
              >
                {isSearching ? '...' : 'Find'}
              </button>
            </form>
          </div>

          <div className="bg-blue-900 rounded-3xl shadow-sm border border-blue-800 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Filters</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1">Winter Play</label>
                <select
                  value={winterPlayFilter}
                  onChange={(e) => setWinterPlayFilter(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-blue-700 bg-blue-950 text-white focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 sm:text-sm rounded-xl"
                >
                  <option value="All">All</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Weather-dependent">Weather-dependent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-blue-700 bg-blue-950 text-white focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 sm:text-sm rounded-xl"
                >
                  <option value="All">All</option>
                  <option value="Public">Public</option>
                  <option value="Club">Club</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1">Lights</label>
                <select
                  value={lightsFilter}
                  onChange={(e) => setLightsFilter(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-blue-700 bg-blue-950 text-white focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 sm:text-sm rounded-xl"
                >
                  <option value="All">All</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Map */}
        <div className="lg:col-span-2">
          <div className="bg-blue-900 rounded-3xl shadow-sm border border-blue-800 p-2 h-[500px]">
            <div className="relative h-full w-full rounded-2xl overflow-hidden z-0">
              <MapContainer 
                center={userLocation} 
                zoom={12} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                <MapUpdater center={userLocation} />
                
                {/* User Location Marker */}
                <Marker position={userLocation}>
                  <Popup>Your Location</Popup>
                </Marker>

                {/* Filtered Courts */}
                {geoJsonData && (
                  <GeoJSON 
                    key={JSON.stringify({ winterPlayFilter, typeFilter, lightsFilter })} // Force re-render on filter change
                    data={{
                      type: "FeatureCollection",
                      features: geoJsonData.features.filter((feature: any) => {
                        const props = feature.properties;
                        const winterPlayValue = props.WinterPlay || 'No';
                        if (winterPlayFilter !== 'All' && winterPlayValue !== winterPlayFilter) return false;
                        if (typeFilter !== 'All' && props.Type !== typeFilter) return false;
                        if (lightsFilter !== 'All' && props.Lights !== lightsFilter) return false;
                        return true;
                      })
                    }} 
                    onEachFeature={onEachFeature} 
                  />
                )}
              </MapContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Nearest Courts Table */}
      <div className="mt-8 bg-blue-900 rounded-3xl shadow-sm border border-blue-800 overflow-hidden">
        <div className="px-6 py-5 border-b border-blue-800">
          <h3 className="text-lg leading-6 font-medium text-white flex items-center">
            <MapPin className="w-5 h-5 mr-2 text-cyan-400" />
            5 Nearest Courts
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-blue-800">
            <thead className="bg-blue-950">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-200 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-200 uppercase tracking-wider">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-200 uppercase tracking-wider">Lights</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-200 uppercase tracking-wider">Winter Play</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-200 uppercase tracking-wider">Insight</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-200 uppercase tracking-wider">Link</th>
              </tr>
            </thead>
            <tbody className="bg-blue-900 divide-y divide-blue-800">
              {nearestCourts.map((court: any, idx: number) => {
                const p = court.properties;
                return (
                  <tr key={idx} className="hover:bg-blue-800 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {p.Name}
                      <div className="text-xs text-blue-400">{court.distance.toFixed(2)} km away</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-200">{p.Type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-200">{p.Lights}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-200">{p.WinterPlay || 'No'}</td>
                    <td className="px-6 py-4 text-sm text-blue-200">
                      {p.Insight ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-900 text-cyan-200">
                          <Info className="w-3 h-3 mr-1" />
                          {p.Insight}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-200">
                      {p.ClubWebsite ? (
                        <a href={p.ClubWebsite} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center">
                          Visit <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
              {nearestCourts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-blue-400">
                    No courts found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
