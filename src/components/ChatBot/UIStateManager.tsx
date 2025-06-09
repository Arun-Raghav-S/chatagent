import { useState, useCallback } from 'react';

// --- UI Display State Types ---
export type UIDisplayMode = 
  | { mode: 'INTRO' }
  | { mode: 'CHAT'; lastAgentMessage?: string }
  | { mode: 'PROPERTY_LIST'; properties: any[] }
  | { mode: 'PROPERTY_DETAILS'; property: any }
  | { mode: 'IMAGE_GALLERY'; data: { propertyName: string; images: any[] } }
  | { mode: 'LOCATION_MAP'; data: { propertyName: string; location: any; description?: string } }
  | { mode: 'BROCHURE_VIEWER'; data: { propertyName: string; brochureUrl: string } }
  | { mode: 'SCHEDULING_FORM'; property: any; slots: Record<string, string[]> }
  | { mode: 'VERIFICATION_FORM'; reason: string }
  | { mode: 'OTP_FORM' }
  | { mode: 'VERIFICATION_SUCCESS' }
  | { mode: 'BOOKING_CONFIRMATION'; details: any };

// --- UI State Manager Interface ---
export interface UIStateManager {
  current: UIDisplayMode;
  previous?: UIDisplayMode;
  transitionTo: (newState: UIDisplayMode, reason?: string) => void;
  canTransition: (from: UIDisplayMode['mode'], to: UIDisplayMode['mode']) => boolean;
  reset: () => void;
  goBack: () => void;
}

// --- Valid UI Transitions (Foolproof Rules) ---
const VALID_TRANSITIONS: Record<UIDisplayMode['mode'], UIDisplayMode['mode'][]> = {
  'INTRO': ['CHAT'],
  'CHAT': ['PROPERTY_LIST', 'PROPERTY_DETAILS', 'IMAGE_GALLERY', 'LOCATION_MAP', 'BROCHURE_VIEWER', 'SCHEDULING_FORM', 'VERIFICATION_FORM', 'BOOKING_CONFIRMATION'],
  'PROPERTY_LIST': ['CHAT', 'PROPERTY_DETAILS'],
  'PROPERTY_DETAILS': ['CHAT', 'PROPERTY_LIST', 'SCHEDULING_FORM', 'IMAGE_GALLERY', 'LOCATION_MAP', 'BROCHURE_VIEWER'],
  'IMAGE_GALLERY': ['CHAT', 'PROPERTY_DETAILS', 'PROPERTY_LIST'],
  'LOCATION_MAP': ['CHAT', 'PROPERTY_DETAILS', 'PROPERTY_LIST'],
  'BROCHURE_VIEWER': ['CHAT', 'PROPERTY_DETAILS', 'PROPERTY_LIST'],
  'SCHEDULING_FORM': ['CHAT', 'VERIFICATION_FORM', 'BOOKING_CONFIRMATION'],
  'VERIFICATION_FORM': ['OTP_FORM', 'CHAT', 'SCHEDULING_FORM'],
  'OTP_FORM': ['VERIFICATION_SUCCESS', 'VERIFICATION_FORM'],
  'VERIFICATION_SUCCESS': ['CHAT', 'SCHEDULING_FORM'],
  'BOOKING_CONFIRMATION': ['CHAT']
};

// --- UI State Manager Hook ---
export const useUIStateManager = (): UIStateManager => {
  const [currentState, setCurrentState] = useState<UIDisplayMode>({ mode: 'INTRO' });
  const [previousState, setPreviousState] = useState<UIDisplayMode | undefined>();
  const [stateHistory, setStateHistory] = useState<UIDisplayMode[]>([]);

  const canTransition = useCallback((from: UIDisplayMode['mode'], to: UIDisplayMode['mode']) => {
    const validTargets = VALID_TRANSITIONS[from] || [];
    return validTargets.includes(to);
  }, []);

  const transitionTo = useCallback((newState: UIDisplayMode, reason: string = 'Manual transition') => {
    const currentMode = currentState.mode;
    const newMode = newState.mode;

    // Log all transitions for debugging
    console.log(`🎯 [UI STATE] ${currentMode} -> ${newMode} | Reason: ${reason}`);
    
    // Validate transition (but allow anyway for flexibility)
    if (!canTransition(currentMode, newMode)) {
      console.warn(`⚠️ [UI STATE] Invalid transition from ${currentMode} to ${newMode}. Forcing anyway.`);
    }

    // Store previous state
    setPreviousState(currentState);
    
    // Add to history (keep last 10 states)
    setStateHistory(prev => [...prev.slice(-9), currentState]);
    
    // Update to new state
    setCurrentState(newState);
    
    // Detailed logging for debugging
    console.log(`📱 [UI STATE] New state:`, newState);
  }, [currentState, canTransition]);

  const reset = useCallback(() => {
    console.log(`🔄 [UI STATE] Resetting to CHAT mode`);
    setPreviousState(currentState);
    setStateHistory(prev => [...prev.slice(-9), currentState]);
    setCurrentState({ mode: 'CHAT' });
  }, [currentState]);

  const goBack = useCallback(() => {
    if (stateHistory.length > 0) {
      const previousState = stateHistory[stateHistory.length - 1];
      console.log(`⬅️ [UI STATE] Going back to ${previousState.mode}`);
      
      // Remove last state from history
      setStateHistory(prev => prev.slice(0, -1));
      setPreviousState(currentState);
      setCurrentState(previousState);
    } else if (previousState) {
      console.log(`⬅️ [UI STATE] Going back to previous state: ${previousState.mode}`);
      const temp = currentState;
      setCurrentState(previousState);
      setPreviousState(temp);
    } else {
      console.log(`⬅️ [UI STATE] No previous state, resetting to CHAT`);
      reset();
    }
  }, [stateHistory, previousState, currentState, reset]);

  return { 
    current: currentState, 
    previous: previousState, 
    transitionTo, 
    canTransition, 
    reset,
    goBack
  };
};

// --- Helper Functions for Common UI Patterns ---
export const createUIHelpers = (uiState: UIStateManager) => {
  return {
    // Show properties with fallback behavior
    showProperties: (properties: any[], reason = 'Properties loaded') => {
      if (properties && properties.length > 0) {
        uiState.transitionTo({ mode: 'PROPERTY_LIST', properties }, reason);
      } else {
        console.warn('[UI HELPER] No properties to show, staying in current mode');
      }
    },

    // Show property details with validation
    showPropertyDetails: (property: any, reason = 'Property selected') => {
      if (property && property.id) {
        uiState.transitionTo({ mode: 'PROPERTY_DETAILS', property }, reason);
      } else {
        console.error('[UI HELPER] Invalid property for details view');
      }
    },

    // Show scheduling form with property and slots
    showScheduling: (property: any, slots: Record<string, string[]>, reason = 'Scheduling initiated') => {
      if (property && slots) {
        uiState.transitionTo({ mode: 'SCHEDULING_FORM', property, slots }, reason);
      } else {
        console.error('[UI HELPER] Invalid data for scheduling form');
      }
    },

    // Show verification flow
    showVerification: (reason = 'Verification required') => {
      uiState.transitionTo({ mode: 'VERIFICATION_FORM', reason }, reason);
    },

    // Show OTP verification
    showOTP: (reason = 'OTP verification required') => {
      uiState.transitionTo({ mode: 'OTP_FORM' }, reason);
    },

    // Show verification success
    showVerificationSuccess: (reason = 'Verification successful') => {
      uiState.transitionTo({ mode: 'VERIFICATION_SUCCESS' }, reason);
    },

    // Show booking confirmation
    showBookingConfirmation: (details: any, reason = 'Booking confirmed') => {
      if (details) {
        uiState.transitionTo({ mode: 'BOOKING_CONFIRMATION', details }, reason);
      } else {
        console.error('[UI HELPER] Invalid booking details');
      }
    },

    // Show image gallery
    showImageGallery: (propertyName: string, images: any[], reason = 'Images requested') => {
      if (propertyName && images && images.length > 0) {
        uiState.transitionTo({ mode: 'IMAGE_GALLERY', data: { propertyName, images } }, reason);
      } else {
        console.error('[UI HELPER] Invalid data for image gallery');
      }
    },

    // Show location map
    showLocationMap: (propertyName: string, location: any, description?: string, reason = 'Location requested') => {
      if (propertyName && location) {
        uiState.transitionTo({ mode: 'LOCATION_MAP', data: { propertyName, location, description } }, reason);
      } else {
        console.error('[UI HELPER] Invalid data for location map');
      }
    },

    // Show brochure viewer
    showBrochure: (propertyName: string, brochureUrl: string, reason = 'Brochure requested') => {
      if (propertyName && brochureUrl) {
        uiState.transitionTo({ mode: 'BROCHURE_VIEWER', data: { propertyName, brochureUrl } }, reason);
      } else {
        console.error('[UI HELPER] Invalid data for brochure viewer');
      }
    },

    // Return to chat (safe fallback)
    returnToChat: (reason = 'Returning to chat') => {
      uiState.transitionTo({ mode: 'CHAT' }, reason);
    },

    // Smart back navigation
    smartBack: () => {
      uiState.goBack();
    }
  };
};

// --- Agent Response UI Handler ---
export const handleAgentUIResponse = (
  uiState: UIStateManager, 
  agentResponse: any, 
  fallbackMode: UIDisplayMode['mode'] = 'CHAT'
) => {
  const helpers = createUIHelpers(uiState);

  // Handle different types of agent responses
  if (agentResponse.ui_display_hint) {
    switch (agentResponse.ui_display_hint) {
      case 'PROPERTY_LIST':
        if (agentResponse.properties) {
          helpers.showProperties(agentResponse.properties, 'Agent provided properties');
        }
        break;
      
      case 'PROPERTY_DETAILS':
        if (agentResponse.property) {
          helpers.showPropertyDetails(agentResponse.property, 'Agent provided property details');
        }
        break;
      
      case 'SCHEDULING_FORM':
        if (agentResponse.property && agentResponse.slots) {
          helpers.showScheduling(agentResponse.property, agentResponse.slots, 'Agent initiated scheduling');
        }
        break;
      
      case 'VERIFICATION_FORM':
        helpers.showVerification('Agent requested verification');
        break;
      
      case 'OTP_FORM':
        helpers.showOTP('Agent requested OTP verification');
        break;
      
      case 'BOOKING_CONFIRMATION':
        if (agentResponse.booking_details) {
          helpers.showBookingConfirmation(agentResponse.booking_details, 'Agent confirmed booking');
        }
        break;
      
      case 'IMAGE_GALLERY':
        if (agentResponse.propertyName && agentResponse.images) {
          helpers.showImageGallery(agentResponse.propertyName, agentResponse.images, 'Agent provided images');
        }
        break;
      
      case 'LOCATION_MAP':
        if (agentResponse.propertyName && agentResponse.location) {
          helpers.showLocationMap(agentResponse.propertyName, agentResponse.location, agentResponse.description, 'Agent provided location');
        }
        break;
      
      case 'BROCHURE_VIEWER':
        if (agentResponse.propertyName && agentResponse.brochureUrl) {
          helpers.showBrochure(agentResponse.propertyName, agentResponse.brochureUrl, 'Agent provided brochure');
        }
        break;
      
      case 'CHAT':
      default:
        helpers.returnToChat('Agent completed interaction');
        break;
    }
  } else {
    // Fallback: analyze response content to determine UI mode
    if (agentResponse.properties && Array.isArray(agentResponse.properties)) {
      helpers.showProperties(agentResponse.properties, 'Detected properties in response');
    } else if (agentResponse.booking_details) {
      helpers.showBookingConfirmation(agentResponse.booking_details, 'Detected booking confirmation');
    } else {
      // Default fallback - handle different modes properly
      if (fallbackMode === 'CHAT') {
        uiState.transitionTo({ mode: 'CHAT' }, 'Fallback mode');
      } else if (fallbackMode === 'PROPERTY_LIST') {
        uiState.transitionTo({ mode: 'PROPERTY_LIST', properties: [] }, 'Fallback mode');
      } else {
        // Safe fallback to CHAT
        uiState.transitionTo({ mode: 'CHAT' }, 'Safe fallback mode');
      }
    }
  }
}; 