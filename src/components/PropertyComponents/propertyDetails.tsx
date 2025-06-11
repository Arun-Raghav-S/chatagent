"use client"

import { useState, useRef, memo, useCallback } from "react"
import { motion } from "framer-motion"
import { X, ExternalLink, MapPin, Maximize2 } from "lucide-react"
import ImageCarousel from "./imageCarousel"

// Optimized animation configurations
const FAST_TRANSITION = { duration: 0.1, ease: "easeOut" }
const INSTANT_TRANSITION = { duration: 0.05, ease: "easeOut" }

interface PropertyUnit {
  type: string
}

interface Amenity {
  name: string
}

interface PropertyLocation {
  city?: string
  mapUrl?: string
  coords?: string
}

interface PropertyImage {
  url?: string
  alt?: string
}

interface PropertyDetailsProps {
  id?: string
  name?: string
  price?: string
  area?: string
  location?: PropertyLocation
  mainImage?: string
  galleryImages?: PropertyImage[]
  units?: PropertyUnit[]
  amenities?: Amenity[]
  description?: string
  websiteUrl?: string
  brochure?: string
  onClose: () => void
  onScheduleVisit?: (property: PropertyDetailsProps) => void
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
const getMapUrl = (location: PropertyLocation | undefined) => {
  if (!location) return null;
  
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

function PropertyDetails({
  id,
  name,
  price,
  area,
  location,
  mainImage,
  galleryImages,
  units,
  amenities,
  description,
  websiteUrl,
  brochure,
  onClose,
  onScheduleVisit
}: PropertyDetailsProps) {
  const [showImageCarousel, setShowImageCarousel] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)
  // Track failed images to prevent repeated errors
  const failedImages = useRef<Set<string>>(new Set())

  // Optimized handlers with useCallback
  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleScheduleVisit = useCallback(() => {
    if (onScheduleVisit) {
      onScheduleVisit({
        id, name, price, area, location, mainImage, galleryImages,
        units, amenities, description, websiteUrl, brochure, onClose, onScheduleVisit
      })
    }
  }, [onScheduleVisit, id, name, price, area, location, mainImage, galleryImages, units, amenities, description, websiteUrl, brochure, onClose])

  const handleImageCarouselOpen = useCallback((index: number) => {
    setCarouselIndex(index)
    setShowImageCarousel(true)
  }, [])

  const handleImageCarouselClose = useCallback(() => {
    setShowImageCarousel(false)
  }, []);

  // Process images for the carousel
  const allImages: PropertyImage[] = [];
  
  // Add main image to carousel if it exists
  if (mainImage) {
    allImages.push({ url: mainImage, alt: name });
  }
  
  // Add gallery images if available
  if (galleryImages && Array.isArray(galleryImages)) {
    allImages.push(...galleryImages);
  }

  // If no images at all, add a placeholder
  if (allImages.length === 0) {
    allImages.push({ url: "/placeholder.svg", alt: "Placeholder image" });
  }

  const handleImageError = (imageUrl: string | undefined, e: React.SyntheticEvent<HTMLImageElement>) => {
    // Only log once and update if not already marked as failed
    if (imageUrl && !failedImages.current.has(imageUrl)) {
      console.log(`[PropertyDetails] Image error for ${imageUrl}, using placeholder`);
      failedImages.current.add(imageUrl);
      e.currentTarget.src = "/placeholder.svg";
      e.currentTarget.onerror = null; // Prevent further errors
    }
  };

  // Get image source with fallback handling
  const getImageSrc = (url: string | undefined) => {
    const src = url || "/placeholder.svg";
    return failedImages.current.has(src) ? "/placeholder.svg" : src;
  };


  return (
    <motion.div 
      className="overflow-hidden rounded-lg text-black"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={FAST_TRANSITION}
    >
      {/* Image Carousel */}
      {showImageCarousel && (
        <motion.div 
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={INSTANT_TRANSITION}
        >
          <ImageCarousel
            images={allImages}
            initialIndex={carouselIndex}
            onClose={handleImageCarouselClose}
          />
        </motion.div>
      )}
      
      {/* Main Container */}
      <motion.div 
        className="bg-white rounded-lg overflow-hidden flex flex-col h-[490px]"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={FAST_TRANSITION}
      >
        {/* Close Button */}
        <motion.button
          onClick={handleClose}
          className="absolute top-1 right-1 z-10 bg-white rounded-full p-1 shadow-md transition-all duration-100 hover:bg-gray-100 active:scale-95"
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
        >
          <X size={18} />
        </motion.button>
        
        {/* Header Image */}
        <div className="relative h-48">
          <img
            src={getImageSrc(mainImage)}
            alt={name || "Property image"}
            className="w-full h-full object-cover"
            onError={(e) => handleImageError(mainImage, e)}
          />
          
          {/* Fullscreen button */}
          <motion.button
            onClick={() => handleImageCarouselOpen(0)}
            className="absolute bottom-2 right-2 bg-white rounded-full p-1 shadow-md transition-all duration-100 hover:bg-gray-100 active:scale-95"
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
          >
            <Maximize2 size={16} />
          </motion.button>
          
          {/* Photo gallery thumbnails */}
          {galleryImages && galleryImages.length > 0 && (
            <div className="absolute bottom-2 left-2 flex space-x-1">
              {galleryImages.slice(0, 3).map((image, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setCarouselIndex(index + 1) // +1 because main image is first
                    setShowImageCarousel(true)
                  }}
                  className="h-8 w-8 bg-white rounded overflow-hidden shadow-md"
                >
                  <img 
                    src={getImageSrc(image.url)} 
                    alt={image.alt || `Gallery image ${index + 1}`} 
                    className="h-full w-full object-cover"
                    onError={(e) => handleImageError(image.url, e)}
                  />
                </button>
              ))}
              {galleryImages.length > 3 && (
                <button
                  onClick={() => {
                    setCarouselIndex(3) // Show the 4th image (index 3)
                    setShowImageCarousel(true)
                  }}
                  className="h-8 w-8 bg-white rounded overflow-hidden shadow-md flex items-center justify-center text-xs font-medium"
                >
                  +{galleryImages.length - 3}
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Title and Price */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-bold text-lg">{name || "Property"}</h3>
              <p className="text-gray-500 flex items-center text-sm">
                <MapPin size={14} className="mr-1" />
                {location?.city || "Location unavailable"}
              </p>
            </div>
            <p className="text-green-600 font-bold">{price || "Price unavailable"}</p>
          </div>
          
          {/* Area */}
          {area && (
            <div className="mb-3 flex items-center text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" className="mr-1">
                <path d="M12 6L15.75 2.25M15.75 2.25H12M15.75 2.25V6M6 6L2.25 2.25M2.25 2.25L2.25 6M2.25 2.25L6 2.25M6 12L2.25 15.75M2.25 15.75H6M2.25 15.75L2.25 12M12 12L15.75 15.75M15.75 15.75V12M15.75 15.75H12" 
                  stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{area}</span>
            </div>
          )}
          
          {/* Description */}
          {description && (
            <div className="mb-4">
              <h4 className="font-medium mb-1">About this property</h4>
              <p className="text-sm text-gray-600">{description}</p>
            </div>
          )}

          {/* Interactive Map */}
          {location && (
            <div className="mb-4">
              <h4 className="font-medium mb-2">Location Map</h4>
              <div className="relative w-full h-48 rounded-lg overflow-hidden">
                <iframe
                  src={getMapUrl(location) || undefined}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0"
                ></iframe>
              </div>
            </div>
          )}
          
          {/* Units */}
          {units && units.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium mb-1">Available Units</h4>
              <div className="flex flex-wrap gap-2">
                {units.map((unit, index) => (
                  <span key={index} className="text-xs bg-gray-100 py-1 px-2 rounded">
                    {unit.type}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Amenities */}
          {amenities && amenities.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium mb-1">Amenities</h4>
              <div className="flex flex-wrap gap-2">
                {amenities.map((amenity, index) => (
                  <span key={index} className="text-xs bg-gray-100 py-1 px-2 rounded">
                    {amenity.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Website link */}
          {websiteUrl && (
            <div className="mb-4">
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 flex items-center text-sm"
              >
                Visit Website <ExternalLink size={14} className="ml-1" />
              </a>
            </div>
          )}
        </div>
        
                  {/* Actions */}
        <div className="p-3 border-t border-gray-200 flex justify-between">
          <motion.button
            onClick={handleScheduleVisit}
            className="bg-blue-600 text-white px-4 py-2 rounded font-medium flex-1 transition-all duration-100 hover:bg-blue-700 active:scale-95"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
          >
            Schedule a Visit
          </motion.button>
          
          {brochure && (
            <button 
              onClick={() => window.open(brochure, '_blank')}
              className="ml-2 bg-green-100 hover:bg-green-200 p-2 rounded transition-colors"
              title="Download Brochure"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15L7 10H10V3H14V10H17L12 15Z" fill="currentColor"/>
                <path d="M20 18H4V20H20V18Z" fill="currentColor"/>
              </svg>
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Memoize the component to prevent unnecessary re-renders
export default memo(PropertyDetails, (prevProps, nextProps) => {
  // Re-render if any of the key props change
  return (
    prevProps.id === nextProps.id &&
    prevProps.name === nextProps.name &&
    prevProps.mainImage === nextProps.mainImage &&
    prevProps.galleryImages === nextProps.galleryImages &&
    prevProps.onClose === nextProps.onClose &&
    prevProps.onScheduleVisit === nextProps.onScheduleVisit
  )
})