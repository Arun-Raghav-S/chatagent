import { useState, useCallback } from 'react';

// --- SIMPLE UI MODE TYPES ---
export type UIMode = 
  | 'INTRO'
  | 'CHAT'
  | 'PROPERTY_LIST'
  | 'PROPERTY_DETAILS'
  | 'IMAGE_GALLERY'
  | 'LOCATION_MAP'
  | 'BROCHURE_VIEWER'
  | 'SCHEDULING_FORM'
  | 'VERIFICATION_FORM'
  | 'OTP_FORM'
  | 'VERIFICATION_SUCCESS'
  | 'BOOKING_CONFIRMATION';

// --- UI DATA INTERFACE ---
export interface UIData {
  properties?: any[];
  selectedProperty?: any;
  galleryData?: { propertyName: string; images: any[] };
  locationData?: { propertyName: string; location: any; description?: string };
  brochureData?: { propertyName: string; brochureUrl: string };
  schedulingData?: { property: any; slots: Record<string, string[]> };
  bookingDetails?: any;
  verificationReason?: string;
}

// --- UI STATE INTERFACE ---
export interface UIState {
  mode: UIMode;
  data: UIData;
  previousMode?: UIMode;
}

// --- FOOLPROOF UI MANAGER ---
export const useSimpleUIManager = () => {
  const [uiState, setUIState] = useState<UIState>({
    mode: 'INTRO',
    data: {}
  });

  // Simple, reliable mode change function
  const changeMode = useCallback((newMode: UIMode, newData: UIData = {}, reason = 'Mode change') => {
    console.log(`🎯 [UI MANAGER] ${uiState.mode} -> ${newMode} | ${reason}`);
    
    setUIState(prev => ({
      mode: newMode,
      data: { ...prev.data, ...newData },
      previousMode: prev.mode
    }));
  }, [uiState.mode]);

  // Force mode change (for emergency situations)
  const forceMode = useCallback((mode: UIMode, data: UIData = {}, reason = 'Force change') => {
    console.log(`🔧 [UI MANAGER] FORCE -> ${mode} | ${reason}`);
    
    setUIState({
      mode,
      data,
      previousMode: uiState.mode
    });
  }, [uiState.mode]);

  // Go back to previous mode
  const goBack = useCallback(() => {
    const previousMode = uiState.previousMode || 'CHAT';
    console.log(`⬅️ [UI MANAGER] Going back to ${previousMode}`);
    
    setUIState(prev => ({
      mode: previousMode,
      data: prev.data,
      previousMode: prev.mode
    }));
  }, [uiState.previousMode]);

  // Reset to safe state
  const reset = useCallback(() => {
    console.log(`🔄 [UI MANAGER] Resetting to CHAT`);
    
    setUIState({
      mode: 'CHAT',
      data: {},
      previousMode: uiState.mode
    });
  }, [uiState.mode]);

  // Smart mode detection from agent response
  const handleAgentResponse = useCallback((response: any, fallback: UIMode = 'CHAT') => {
    console.log(`🤖 [UI MANAGER] Processing agent response:`, response);

    try {
      // Handle based on UI hint
      if (response.ui_display_hint) {
        switch (response.ui_display_hint) {
          case 'PROPERTY_LIST':
            if (response.properties?.length > 0) {
              changeMode('PROPERTY_LIST', { properties: response.properties }, 'Agent provided properties');
            } else {
              changeMode(fallback, {}, 'No properties in response');
            }
            break;

          case 'SCHEDULING_FORM':
            if (response.property && response.slots) {
              changeMode('SCHEDULING_FORM', { 
                schedulingData: { property: response.property, slots: response.slots }
              }, 'Agent initiated scheduling');
            } else {
              changeMode(fallback, {}, 'Invalid scheduling data');
            }
            break;

          case 'VERIFICATION_FORM':
            changeMode('VERIFICATION_FORM', { 
              verificationReason: response.reason || 'Verification required' 
            }, 'Agent requested verification');
            break;

          case 'OTP_FORM':
            changeMode('OTP_FORM', {}, 'Agent requested OTP');
            break;

          case 'VERIFICATION_SUCCESS':
            changeMode('VERIFICATION_SUCCESS', {}, 'Verification successful');
            break;

          case 'BOOKING_CONFIRMATION':
            if (response.booking_details) {
              changeMode('BOOKING_CONFIRMATION', { 
                bookingDetails: response.booking_details 
              }, 'Booking confirmed');
            } else {
              changeMode(fallback, {}, 'No booking details');
            }
            break;

          case 'IMAGE_GALLERY':
            if (response.propertyName && response.images?.length > 0) {
              changeMode('IMAGE_GALLERY', { 
                galleryData: { propertyName: response.propertyName, images: response.images }
              }, 'Images provided');
            } else {
              changeMode(fallback, {}, 'No image data');
            }
            break;

          case 'LOCATION_MAP':
            if (response.propertyName && response.location) {
              changeMode('LOCATION_MAP', { 
                locationData: { 
                  propertyName: response.propertyName, 
                  location: response.location,
                  description: response.description 
                }
              }, 'Location provided');
            } else {
              changeMode(fallback, {}, 'No location data');
            }
            break;

          case 'PROPERTY_DETAILS':
            if (response.property_details) {
              changeMode('PROPERTY_DETAILS', { 
                selectedProperty: response.property_details
              }, 'Property details provided');
            } else if (response.property) {
              changeMode('PROPERTY_DETAILS', { 
                selectedProperty: response.property
              }, 'Property details provided');
            } else {
              changeMode(fallback, {}, 'No property details data');
            }
            break;

          case 'BROCHURE_VIEWER':
            if (response.propertyName && response.brochureUrl) {
              changeMode('BROCHURE_VIEWER', { 
                brochureData: { propertyName: response.propertyName, brochureUrl: response.brochureUrl }
              }, 'Brochure provided');
            } else {
              changeMode(fallback, {}, 'No brochure data');
            }
            break;

          default:
            changeMode(fallback, {}, `Unknown hint: ${response.ui_display_hint}`);
        }
      } else {
        // Auto-detect based on content
        if (response.properties?.length > 0) {
          changeMode('PROPERTY_LIST', { properties: response.properties }, 'Auto-detected properties');
        } else if (response.booking_details) {
          changeMode('BOOKING_CONFIRMATION', { bookingDetails: response.booking_details }, 'Auto-detected booking');
        } else {
          changeMode(fallback, {}, 'No hint provided, using fallback');
        }
      }
    } catch (error) {
      console.error(`❌ [UI MANAGER] Error processing response:`, error);
      changeMode(fallback, {}, 'Error processing response');
    }
  }, [changeMode]);

  // Convenience functions
  const showProperties = useCallback((properties: any[]) => {
    if (properties?.length > 0) {
      changeMode('PROPERTY_LIST', { properties }, 'Show properties');
    } else {
      console.warn('[UI MANAGER] No properties to show');
    }
  }, [changeMode]);

  const showPropertyDetails = useCallback((property: any) => {
    if (property) {
      changeMode('PROPERTY_DETAILS', { selectedProperty: property }, 'Show property details');
    } else {
      console.warn('[UI MANAGER] No property to show details for');
    }
  }, [changeMode]);

  const showScheduling = useCallback((property: any, slots: Record<string, string[]>) => {
    if (property && slots) {
      changeMode('SCHEDULING_FORM', { 
        schedulingData: { property, slots } 
      }, 'Show scheduling form');
    } else {
      console.warn('[UI MANAGER] Invalid scheduling data');
    }
  }, [changeMode]);

  return {
    // State
    mode: uiState.mode,
    data: uiState.data,
    previousMode: uiState.previousMode,
    
    // Actions
    changeMode,
    forceMode,
    goBack,
    reset,
    handleAgentResponse,
    
    // Convenience functions
    showProperties,
    showPropertyDetails,
    showScheduling
  };
};

// --- HELPER FUNCTIONS ---
export const getUIDisplayComponent = (mode: UIMode) => {
  const components = {
    'INTRO': 'Intro Screen',
    'CHAT': 'Chat Interface',
    'PROPERTY_LIST': 'Property List',
    'PROPERTY_DETAILS': 'Property Details Modal',
    'IMAGE_GALLERY': 'Image Gallery',
    'LOCATION_MAP': 'Location Map',
    'BROCHURE_VIEWER': 'Brochure Viewer',
    'SCHEDULING_FORM': 'Scheduling Form',
    'VERIFICATION_FORM': 'Verification Form',
    'OTP_FORM': 'OTP Input Form',
    'VERIFICATION_SUCCESS': 'Verification Success',
    'BOOKING_CONFIRMATION': 'Booking Confirmation'
  };
  
  return components[mode] || 'Unknown Component';
};

export const isModalMode = (mode: UIMode): boolean => {
  return ['PROPERTY_DETAILS', 'IMAGE_GALLERY', 'LOCATION_MAP', 'BROCHURE_VIEWER'].includes(mode);
};

export const isFormMode = (mode: UIMode): boolean => {
  return ['SCHEDULING_FORM', 'VERIFICATION_FORM', 'OTP_FORM'].includes(mode);
};

export const isFullScreenMode = (mode: UIMode): boolean => {
  return ['INTRO', 'CHAT', 'PROPERTY_LIST', 'VERIFICATION_SUCCESS', 'BOOKING_CONFIRMATION'].includes(mode);
}; 