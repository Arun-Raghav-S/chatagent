import type { AgentMetadata } from "@/types/types"

// Extended AgentMetadata interface to include new authentication flow properties
export interface ExtendedAgentMetadata extends AgentMetadata {
  flow_context?:
    | "from_full_scheduling"
    | "from_direct_auth"
    | "from_scheduling_verification"
    | "from_question_auth"
  pending_question?: string
}

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

// --- Add Props Interface ---
export interface RealEstateAgentProps {
  chatbotId: string // Receive chatbotId from parent page
}

// --- UI Display Modes ---
export type ActiveDisplayMode =
  | "CHAT"
  | "PROPERTY_LIST"
  | "PROPERTY_DETAILS"
  | "IMAGE_GALLERY"
  | "SCHEDULING_FORM" // For TimePick
  | "VERIFICATION_FORM" // For VerificationForm
  | "OTP_FORM" // For OTPInput
  | "VERIFICATION_SUCCESS" // For showing verification success before returning to CHAT
  | "BOOKING_CONFIRMATION" // For showing booking details card
  | "LOCATION_MAP" // For showing location map
  | "BROCHURE_VIEWER" // For showing brochure viewer

export interface PropertyGalleryData {
  propertyName: string
  images: PropertyImage[]
}

// Add new interface for booking details
export interface BookingDetails {
  customerName: string
  propertyName:string
  date: string
  time: string
  phoneNumber?: string
}

// Add new interface for location map data
export interface LocationMapData {
  propertyName: string
  location: PropertyLocation
  description?: string
}

// Add new interface for brochure data
export interface BrochureData {
  propertyName: string
  brochureUrl: string
} 