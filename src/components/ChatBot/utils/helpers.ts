import { v4 as uuidv4 } from 'uuid';
import { PropertyImage, PropertyProps } from '../types';

// Helper to generate safe IDs (32 chars max)
export const generateSafeId = () => uuidv4().replace(/-/g, '').slice(0, 32);

// Process property data from API response
export const processPropertyData = (property: any): PropertyProps => {
  // Edge function returns data in a different format than our components expect
  // Process the images array into mainImage and galleryImages format
  let mainImage = "/placeholder.svg";
  let galleryImages: PropertyImage[] = [];
  
  if (property.images && Array.isArray(property.images) && property.images.length > 0) {
    if (property.images[0].url) {
      mainImage = property.images[0].url;
    }
    if (property.images.length > 1) {
      galleryImages = property.images.slice(1).map((img: any) => ({
        url: img.url,
        alt: img.alt || `${property.name} image`,
        description: img.description || ""
      }));
    }
  }
  
  // Handle amenities format conversion
  const amenitiesArray = Array.isArray(property.amenities) 
    ? property.amenities.map((amenity: any) => {
        if (typeof amenity === 'string') {
          return { name: amenity };
        }
        return amenity;
      })
    : [];
    
  // Handle units format conversion  
  const unitsArray = Array.isArray(property.units)
    ? property.units.map((unit: any) => {
        if (typeof unit === 'string') {
          return { type: unit };
        }
        return unit;
      })
    : [];
  
  return {
    id: property.id || generateSafeId(),
    name: property.name || "Property",
    price: property.price || "Price unavailable",
    area: property.area || "Area unavailable",
    mainImage: mainImage,
    location: {
      city: property.location?.city || "Location unavailable",
      mapUrl: property.location?.mapUrl || "",
      coords: property.location?.coords || ""
    },
    galleryImages: galleryImages,
    units: unitsArray,
    amenities: amenitiesArray,
    description: property.description || "No description available",
    websiteUrl: property.websiteUrl || "",
    brochure: property.brochure || ""
  };
};

// Create default time slots for scheduling
export const createDefaultTimeSlots = () => {
  const defaultSlots: Record<string, string[]> = {};
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Format dates as strings
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  const todayStr = today.toLocaleDateString('en-US', dateOptions);
  const tomorrowStr = tomorrow.toLocaleDateString('en-US', dateOptions);
  
  defaultSlots[todayStr] = ["11:00 AM", "4:00 PM"];
  defaultSlots[tomorrowStr] = ["11:00 AM", "4:00 PM"];
  
  return defaultSlots;
};

// Check if a message contains property-related keywords
export const containsPropertyKeyword = (text: string, keywords: string[]): boolean => {
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
};

// Check if message is a trigger message that should be filtered
export const isTriggerMessage = (text: string): boolean => {
  return (
    text.startsWith('{Trigger msg:') ||
    text === "Show the booking confirmation page" ||
    text === "TRIGGER_BOOKING_CONFIRMATION"
  );
};

// Check if message is a SPEAK trigger
export const isSpeakTrigger = (text: string): boolean => {
  return text.startsWith('{Trigger msg: Say ');
}; 