import React from 'react';
import { X, MapPin, ExternalLink } from 'lucide-react';

interface PropertyLocation {
  city?: string;
  mapUrl?: string;
  coords?: string;
}

interface LocationMapProps {
  propertyName: string;
  location: PropertyLocation;
  description?: string;
  onClose: () => void;
}

// Helper function to convert Google Maps URL to embed URL
const getEmbedUrl = (mapUrl: string) => {
  try {
    // If it's already an embed URL, return as is
    if (mapUrl.includes('maps/embed')) return mapUrl;
    
    // Extract the place coordinates or query
    const url = new URL(mapUrl);
    let place = url.searchParams.get('q') || 
                url.pathname.split('@')[1]?.split('/')[0] || 
                url.pathname.split('/place/')[1]?.split('/')[0];
    
    if (!place) return null;
    
    // If place contains coordinates, format them properly
    if (place.includes(',')) {
      const [lat, lng] = place.split(',').map(coord => coord.trim());
      if (!isNaN(Number(lat)) && !isNaN(Number(lng))) {
        place = `${lat},${lng}`;
      }
    }
    
    // Create embed URL with place parameter
    return `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_EMBED_API_KEY}&q=${encodeURIComponent(place)}`;
  } catch (e) {
    console.error('Error parsing map URL:', e);
    return null;
  }
};

// Create map URL from coordinates if available
const getMapUrl = (location: PropertyLocation) => {
  // If we have coordinates, use them
  if (location.coords) {
    const [lat, lng] = location.coords.split(',').map(coord => coord.trim());
    if (!isNaN(Number(lat)) && !isNaN(Number(lng))) {
      return `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_EMBED_API_KEY}&q=${lat},${lng}`;
    }
  }
  
  // If we have a mapUrl, convert it to embed URL
  if (location.mapUrl) {
    return getEmbedUrl(location.mapUrl);
  }
  
  // If we have a city, use that as fallback
  if (location.city) {
    return `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_EMBED_API_KEY}&q=${encodeURIComponent(location.city)}`;
  }
  
  return null;
};

// Get the external Google Maps URL for "Open in Maps" functionality
const getExternalMapUrl = (location: PropertyLocation) => {
  if (location.coords) {
    const [lat, lng] = location.coords.split(',').map(coord => coord.trim());
    if (!isNaN(Number(lat)) && !isNaN(Number(lng))) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
  }
  
  if (location.mapUrl && !location.mapUrl.includes('maps/embed')) {
    return location.mapUrl;
  }
  
  if (location.city) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.city)}`;
  }
  
  return null;
};

export default function LocationMap({ propertyName, location, description, onClose }: LocationMapProps) {
  const embedUrl = getMapUrl(location);
  const externalUrl = getExternalMapUrl(location);

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-auto overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-50">
        <div className="flex items-center">
          <MapPin size={20} className="text-blue-600 mr-2" />
          <h3 className="font-semibold text-gray-800">Location</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded-full transition-colors"
        >
          <X size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Property Name */}
        <h4 className="font-medium text-lg mb-2 text-gray-800">{propertyName}</h4>
        
        {/* Location Details */}
        <div className="mb-4">
          <p className="text-gray-600 flex items-center">
            <MapPin size={16} className="mr-1" />
            {location.city || "Location details"}
          </p>
          {description && (
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          )}
        </div>

        {/* Map */}
        {embedUrl ? (
          <div className="relative w-full h-64 rounded-lg overflow-hidden border border-gray-200 mb-4">
            <iframe
              src={embedUrl}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0"
              title={`Map of ${propertyName}`}
            />
          </div>
        ) : (
          <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <div className="text-center text-gray-500">
              <MapPin size={48} className="mx-auto mb-2 opacity-50" />
              <p>Map not available</p>
              <p className="text-sm">Location: {location.city || "Unknown"}</p>
            </div>
          </div>
        )}

        {/* Open in Maps Button */}
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center transition-colors"
          >
            <ExternalLink size={16} className="mr-2" />
            Open in Google Maps
          </a>
        )}
      </div>
    </div>
  );
} 