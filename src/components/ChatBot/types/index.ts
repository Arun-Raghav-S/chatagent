// Import base types first
import type { 
  SessionStatus, 
  TranscriptItem, 
  AgentConfig, 
  AgentMetadata, 
  ServerEvent 
} from "@/types/types";

// Types for property-related components
export interface PropertyUnit {
  type: string
}

export interface Amenity {
  name: string
}

export interface PropertyLocation {
  city?: string
  mapUrl?: string
  coords?: string
}

export interface PropertyImage {
  url?: string
  alt?: string
  description?: string
}

export interface PropertyProps {
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
  onClose?: () => void
}

// Extended metadata for authentication flow
export interface ExtendedAgentMetadata extends AgentMetadata {
  flow_context?: 'from_full_scheduling' | 'from_direct_auth' | 'from_scheduling_verification' | 'from_question_auth';
  pending_question?: string;
}

// Component props
export interface RealEstateAgentProps {
  chatbotId: string;
}

// UI Display modes
export type ActiveDisplayMode = 
  | 'CHAT' 
  | 'PROPERTY_LIST' 
  | 'PROPERTY_DETAILS' 
  | 'IMAGE_GALLERY' 
  | 'SCHEDULING_FORM'
  | 'VERIFICATION_FORM'
  | 'OTP_FORM'
  | 'VERIFICATION_SUCCESS'
  | 'BOOKING_CONFIRMATION'
  | 'LOCATION_MAP'
  | 'BROCHURE_VIEWER';

// Property display data types
export interface PropertyGalleryData {
  propertyName: string
  images: PropertyImage[]
}

export interface BookingDetails {
  customerName: string;
  propertyName: string;
  date: string;
  time: string;
  phoneNumber?: string;
}

export interface LocationMapData {
  propertyName: string
  location: PropertyLocation
  description?: string
}

export interface BrochureData {
  propertyName: string
  brochureUrl: string
}

// Verification data
export interface VerificationData {
  name: string;
  phone: string;
  date: string;
  time: string;
}

// Re-export types for convenience
export type { 
  SessionStatus, 
  TranscriptItem, 
  AgentConfig, 
  AgentMetadata, 
  ServerEvent 
}; 