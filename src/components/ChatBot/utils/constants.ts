// Language options for the intro screen
export const LANGUAGE_OPTIONS = [
  "English", "Hindi", "Tamil", "Telugu", "Malayalam", "Spanish", "French", 
  "German", "Chinese", "Japanese", "Arabic", "Russian"
];

// Language mapping to ISO codes
export const LANGUAGE_MAPPING: Record<string, string> = {
  "English": "en",
  "Hindi": "hi",
  "Tamil": "ta",
  "Telugu": "te",
  "Malayalam": "ml",
  "Spanish": "es",
  "French": "fr",
  "German": "de",
  "Chinese": "zh",
  "Japanese": "ja",
  "Arabic": "ar",
  "Russian": "ru"
};

// WebRTC Turn Detection Configuration
export const TURN_DETECTION_CONFIG = {
  type: "server_vad",
  threshold: 0.8,
  prefix_padding_ms: 250,
  silence_duration_ms: 400,
  create_response: true,
};

// Default time slots for scheduling
export const DEFAULT_TIME_SLOTS: Record<string, string[]> = {
  'Monday': ['11:00 AM', '4:00 PM'],
  'Tuesday': ['11:00 AM', '4:00 PM'],
  'Wednesday': ['11:00 AM', '4:00 PM']
};

// Property-related keywords for automatic loading
export const PROPERTY_KEYWORDS = [
  'property', 'properties', 'house', 'home', 'apartment', 'flat', 
  'real estate', 'housing', 'buy', 'purchase', 'rent', 'view', 'show me'
];

// UI Timing Constants
export const UI_TIMINGS = {
  SESSION_UPDATE_DELAY: 500,
  TRIGGER_MESSAGE_DELAY: 500,
  MIC_ENABLE_DELAY: 200,
  RESPONSE_CANCEL_DELAY: 250,
  RESPONSE_CREATE_DELAY: 150,
  VERIFICATION_SUCCESS_DISPLAY: 5000,
  AUTO_LOAD_PROPERTIES_DELAY: 1000,
};

// API Endpoints
export const API_ENDPOINTS = {
  SESSION: "/api/session",
  UPDATE_AGENT_HISTORY: "https://dashboard.propzing.in/functions/v1/update_agent_history"
}; 