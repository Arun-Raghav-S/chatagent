import { AgentConfig, AgentMetadata as BaseAgentMetadata, TranscriptItem } from "@/types/types"; // Adjusted path
import {
  trackUserMessage,
  detectPropertyInMessage,
  updateActiveProject,
  fetchOrgMetadata,
  getProjectDetails,
  getPropertyImages,
  lookupProperty,
  calculateRoute,
  findNearestPlace,
  initiateScheduling,
  completeScheduling,
  showPropertyLocation,
  showPropertyBrochure
} from './tools';

interface AgentMetadata extends BaseAgentMetadata {
  project_id_map?: Record<string, string>; // Map project names to their IDs
  active_project_id?: string; // Current active project ID for direct reference
  // Fields for post-scheduling/auth confirmation
  selectedDate?: string;
  selectedTime?: string;
  property_name?: string; // For the scheduled property, distinct from active_project general focus
  flow_context?: 'from_full_scheduling' | 'from_direct_auth' | 'from_scheduling_verification' | 'from_question_auth';
  // New field for storing pending question after auth flow
  pending_question?: string;
}

// Add interface for property detection response
interface PropertyDetectionResult {
  propertyDetected: boolean;
  detectedProperty?: string;
  shouldUpdateActiveProject?: boolean;
  message?: string;
  isScheduleRequest?: boolean;
  schedulePropertyId?: string | null;
}



// Track question count - Reset on agent initialization or context change
let questionCount = 0;

// Dynamic instructions function - receives metadata object
export const getInstructions = (metadata: AgentMetadata | undefined | null) => {
  // Default values if metadata is missing
  const defaultMetadata = {
    org_id: "N/A",
    org_name: "the company",
    active_project: "N/A",
    property_location: "N/A",
    project_names: [] as string[],
    chatbot_id: "N/A",
    session_id: "N/A",
    is_verified: false,
    customer_name: "",
    phone_number: "",
    project_ids: [] as string[],
    project_locations: {} as Record<string, string>,
    has_scheduled: false,
    language: "English",
    project_id_map: {} as Record<string, string>, // Map project names to their IDs
  };
  const safeMetadata = { ...defaultMetadata, ...(metadata || {}) }; // Merge defaults with provided metadata

  // Determine the active project for focus
  const activeProject = safeMetadata.active_project !== "N/A" ? safeMetadata.active_project :
                      (safeMetadata.project_names.length > 0 ? safeMetadata.project_names[0] : "N/A");

  const projectList = safeMetadata.project_names.length > 0 ? safeMetadata.project_names.join(", ") : "(No projects specified)";

  const instructions = `# REAL ESTATE AGENT SYSTEM INSTRUCTIONS

## 🚨 CRITICAL SYSTEM TRIGGERS (HIGHEST PRIORITY)

### Booking Confirmation Trigger
IF user message is EXACTLY "TRIGGER_BOOKING_CONFIRMATION":
- DO NOT respond with text
- DO NOT call trackUserMessage 
- DO NOT call any other tool
- IMMEDIATELY call: completeScheduling()

### Mandatory Message Processing
FOR ALL OTHER USER MESSAGES:
1. FIRST: trackUserMessage({ message: "[exact user message]" })
2. SECOND: detectPropertyInMessage({ message: "[exact user message]" })
3. THEN: Process trackUserMessage response - if contains 'destination_agent', STOP and transfer silently
4. THEN: Continue with appropriate tools based on user request

## 🏠 AGENT IDENTITY & CONTEXT

You are a helpful real estate agent representing **${safeMetadata.org_name}**.

**Current Context:**
- Properties: ${projectList}
- Active Property: ${activeProject}
- Customer: ${safeMetadata.customer_name || "Not provided"}
- Verified: ${safeMetadata.is_verified ? "✅ Yes" : "❌ No"}
- Scheduled: ${safeMetadata.has_scheduled ? "✅ Yes" : "❌ No"}
- Language: ${safeMetadata.language}

## 📋 CONVERSATION FLOW RULES

### 1. Greeting Flow (CRITICAL)
**When user sends initial greeting** ("Hi", "Hello", etc.):
- Respond with: "Hey there! Would you like to know more about our amazing properties? 😊"
- Translations for other languages:
  - Hindi: "नमस्ते! क्या आप हमारी शानदार properties के बारे में और जानना चाहेंगे? 😊"
  - Tamil: "வணக்கம்! எங்கள் அற்புதமான properties பற்றி மேலும் தெரிந்துகொள்ள விரும்புகிறீர்களா? 😊"
  - Telugu: "హలో! మా అద్భుతమైన properties గురించి మరింత తెలుసుకోవాలనుకుంటున్నారా? 😊"
  - Malayalam: "ഹലോ! ഞങ്ങളുടെ അത്ഭുതകരമായ properties നെ കുറിച്ച് കൂടുതൽ അറിയാൻ താൽപ്പര്യമുണ്ടോ? 😊"

### 2. Affirmative Response Flow (CRITICAL - MUST FOLLOW EXACTLY)
**When user responds affirmatively** to greeting ("yes", "sure", "okay", "please", etc. in ANY language):
- MANDATORY: Call getProjectDetails() with NO parameters
- This MUST return ui_display_hint: 'PROPERTY_LIST'
- Use EXACT response from tool - do NOT generate your own text
- Expected tool response: "Here are the properties I found. You can click on the cards below for more details."

### 3. Authentication & Transfer Rules
- If trackUserMessage returns 'destination_agent: authentication' → STOP immediately, transfer silently
- If trackUserMessage returns 'answer_pending_question: true' → First say "Great! You're now verified." then answer pending question
- Only transfer to authentication if is_verified=false AND trackUserMessage indicates it
- Never mention agents, tools, or transfers to user

### 4. Scheduling Rules
- Detect scheduling intent in messages like "I want to schedule", "book a tour", "visit property"
- When detected: Call initiateScheduling() with NO parameters
- Only suggest scheduling if is_verified=true AND has_scheduled=false

## 🛠️ TOOL USAGE GUIDELINES

### Property Information Tools
**getProjectDetails** - Use for:
- Property list requests ("show me properties")
- Basic info (price, location, amenities)
- When user asks about specific property basics
- **CRITICAL:** For affirmative responses to greeting

**lookupProperty** - Use for:
- Detailed specifications (room dimensions, materials)
- Feature-based searches ("properties near park")
- Security, parking, utility details

### Location & Navigation Tools
**showPropertyLocation** - Use when user asks:
- "Where is this property?"
- "Show me the location"
- "Can I see the map?"

**calculateRoute** - Use for ALL distance/direction queries:
- "How far is X from Y?"
- "Directions to property"
- "Travel time between locations"

**findNearestPlace** - Use for nearby amenities:
- "What's near the property?"
- "Nearest hospital/school/mall"

### Visual Content Tools
**getPropertyImages** - Use when user asks:
- "Show me images/pictures"
- "Can I see photos?"

**showPropertyBrochure** - Use when user asks:
- "Can I see the brochure?"
- "Share/download brochure"

### Internal Management Tools
**updateActiveProject** - Call immediately when detectPropertyInMessage returns shouldUpdateActiveProject: true
**trackUserMessage** - Always call first (except for TRIGGER_BOOKING_CONFIRMATION)
**detectPropertyInMessage** - Always call second

## 🎯 SPECIAL MESSAGE HANDLING

### Trigger Messages
Messages starting with "{Trigger msg: ...}" are system triggers:
- **{Trigger msg: Say "text"}**: Speak the quoted text exactly
- **{Trigger msg: Explain details of [property]}**: Give 2-line property summary
- **{Trigger msg: Ask user whether they want to schedule}**: Ask about scheduling visit
- Always call detectPropertyInMessage first, then updateActiveProject if needed
- Keep responses super short (1-2 sentences)
- Never mention receiving trigger messages

### System Responses Based on UI Hints
When tools return ui_display_hint:
- **PROPERTY_LIST**: "Here are the properties I found. You can click on the cards below for more details."
- **PROPERTY_DETAILS**: Brief 1-2 sentence description
- **IMAGE_GALLERY**: "Here are the images."
- **LOCATION_MAP**: "Here's the location of [property]. You can view it on the interactive map."
- **BROCHURE_VIEWER**: "You can check the brochure here."
- **CHAT**: Provide textual summary of results

## 💬 COMMUNICATION STYLE

**Language:** Respond ONLY in ${safeMetadata.language}
**Tone:** Warm, friendly, enthusiastic - like a helpful friend excited about properties
**Length:** Maximum 2 short sentences (~30 words)
**Maps:** NEVER mention long URLs - just say "Here's the location" and let UI show map

## 🔄 ERROR PREVENTION

- Always check trackUserMessage response for destination_agent before continuing
- Never pass property_id to initiateScheduling - let it use active project
- For TRIGGER_BOOKING_CONFIRMATION: Only call completeScheduling()
- For affirmative responses: MUST call getProjectDetails() to show property list
- When detectPropertyInMessage returns shouldUpdateActiveProject: true → immediately call updateActiveProject()

---

**Remember:** This is a systematic, ordered approach. Follow the flow rules exactly, use tools as specified, and maintain the friendly tone throughout.`;

  // 🔍 ADD LOGGING TO SEE WHAT INSTRUCTIONS ARE BEING SENT
  console.log("🔍 [getInstructions] Generated RESTRUCTURED instructions for realEstate agent");
  console.log("🔍 [getInstructions] Key instruction sections:");
  console.log("  - 1. Critical System Triggers");
  console.log("  - 2. Agent Identity & Context");
  console.log("  - 3. Conversation Flow Rules");
  console.log("  - 4. Tool Usage Guidelines");
  console.log("  - 5. Special Message Handling");
  console.log("  - 6. Communication Style");
  console.log("🔍 [getInstructions] Current metadata state:", {
    is_verified: safeMetadata.is_verified,
    has_scheduled: safeMetadata.has_scheduled,
    customer_name: safeMetadata.customer_name,
    selectedDate: (safeMetadata as any).selectedDate,
    selectedTime: (safeMetadata as any).selectedTime,
    property_name: (safeMetadata as any).property_name
  });

  return instructions;
};

// Agent Definition
const realEstateAgent: AgentConfig = {
  name: "realEstate",
  publicDescription:
    "Real Estate Agent that provides detailed property information.",
  instructions: getInstructions(undefined), // Initial default instructions
  tools: [
    {
      type: "function",
      name: "trackUserMessage",
      description: "Internal tool: Tracks user messages, increments question count, and triggers authentication or scheduling prompts based on count and user status. Also handles special flow contexts. NEVER call this for 'TRIGGER_BOOKING_CONFIRMATION' or 'Show the booking confirmation page' messages - call completeScheduling directly instead.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The user's message (for logging/context). EXCLUDE: 'TRIGGER_BOOKING_CONFIRMATION' and 'Show the booking confirmation page'" },
          // is_verified, has_scheduled, project_names are accessed from agent metadata internally
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
     {
       type: "function",
       name: "detectPropertyInMessage",
       description: "Internal tool: Analyzes the user's message to detect if a specific known property is mentioned.",
       parameters: {
         type: "object",
         properties: {
           message: { type: "string", description: "The user's message to analyze" },
           // project_names is accessed from agent metadata internally
         },
         required: ["message"],
         additionalProperties: false,
       },
     },
    {
      type: "function",
      name: "updateActiveProject",
      description: "Internal tool: Updates the agent's internal focus to a specific project when the user expresses clear interest in it.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "The name of the project the user is interested in.",
          },
          // session_id is accessed from agent metadata internally
        },
        required: ["project_name"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "lookupProperty",
      description:
        "Queries for property details (e.g., address, price, features). Use when the user asks specifics about properties.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A natural language query describing the property or information needed.",
          },
          k: {
            type: "number",
            description:
              "Optional: The number of results to retrieve. Defaults to 3.",
          },
           // project_ids are accessed from agent metadata internally
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "calculateRoute",
      description:
        "Calculates a driving route between two locations. Use when the user asks for directions or distance between places. Either location can be a property name (which will be enhanced with city info) or an external location like 'Burj Khalifa'.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description:
              "The starting location. Can be a property name, external landmark, or text like 'my current location'.",
          },
          destination_property: {
            type: "string",
            description: "The destination location. Can be a property name or external landmark like 'Burj Khalifa'.",
             // enum will be dynamically populated if possible
          },
           // Property locations will be automatically enhanced with city information
        },
        required: ["origin", "destination_property"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "findNearestPlace",
      description:
        "Finds the nearest place/amenity (e.g., 'park', 'hospital') relative to a property. Use when the user asks about nearby places.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The type of place to find (e.g., 'nearest park', 'hospital nearby').",
          },
          reference_property: {
            type: "string",
            description: "The name of the property to use as the reference location.",
             // enum will be dynamically populated if possible
          },
          // reference lat/lng and is_verified are accessed from agent metadata internally
        },
        required: ["query", "reference_property"],
        additionalProperties: false,
      },
    },
    {
       type: "function",
       name: "fetchOrgMetadata",
       description:
         "Internal tool: Fetches essential organizational and project data needed for the agent to function.",
       parameters: {
         type: "object",
         properties: {
           session_id: { type: "string", description: "The current session ID." },
           chatbot_id: { type: "string", description: "The chatbot's ID." },
         },
         required: ["session_id", "chatbot_id"],
         additionalProperties: false,
       },
     },
    {
      type: "function",
      name: "getPropertyImages",
      description:
        "Retrieves images for a specific property. Use when the user asks to see images or pictures.",
      parameters: {
        type: "object",
        properties: {
          property_name: {
            type: "string",
            description: "The name of the property to get images for. If not provided, uses the currently active project.",
            // enum will be dynamically populated if possible
          },
          query: {
            type: "string",
            description: "Optional: Additional description to refine the image search (e.g., 'exterior', 'living room').",
          },
          // project_ids are accessed from agent metadata internally
        },
        // property_name is effectively required unless active_project is set
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "getProjectDetails",
      description:
        "Retrieves comprehensive details about a specific property directly from the database. Use when you need precise property information without semantic search.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The unique ID of the project to get details for. This is the preferred parameter and should be used whenever available.",
          },
          project_name: {
            type: "string",
            description: "Alternative to project_id: The name of the property to get details for. Partial matches work. Only use if project_id is not available.",
          },
          // Note: Either project_id OR project_name must be provided
        },
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "initiateScheduling",
      description: "Internal tool: Triggers the scheduling flow by transferring to the scheduleMeeting agent silently. Use when the user explicitly agrees to schedule a visit. Do NOT pass property_id - let it automatically use the active project.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "completeScheduling",
      description: "🚨 CRITICAL: Call this tool IMMEDIATELY when you receive EXACTLY 'TRIGGER_BOOKING_CONFIRMATION' message. This completes the scheduling process and shows booking confirmation. Do NOT call any other tools first.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "showPropertyLocation",
      description: "Shows a location map for a property when the user asks about location, map, or where a property is located. Use when user asks 'Where is this property?', 'Show me the location', 'Can I see the map?', etc.",
      parameters: {
        type: "object",
        properties: {
          property_name: {
            type: "string",
            description: "The name of the property to show location for. If not provided, uses the currently active project.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "showPropertyBrochure",
      description: "Shows a property brochure with download functionality when the user asks to see or share the brochure. Use when user asks 'Can I see the brochure?', 'Share the brochure', 'Show me the brochure', etc.",
      parameters: {
        type: "object",
        properties: {
          property_name: {
            type: "string",
            description: "The name of the property to show brochure for. If not provided, uses the currently active project.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  ],

  // Tool Logic Implementation
  toolLogic: {
    // --- Internal Tools --- 
    trackUserMessage: async ({ message }: { message: string }) => {
        return await trackUserMessage({ message }, realEstateAgent); 
    },

    detectPropertyInMessage: async ({ message }: { message: string }) => {
        return await detectPropertyInMessage({ message }, realEstateAgent);
    },

    updateActiveProject: async ({ project_name }: { project_name: string }) => {
        return await updateActiveProject({ project_name }, realEstateAgent, getInstructions);
    },

    fetchOrgMetadata: async ({ session_id, chatbot_id }: { session_id: string; chatbot_id: string; }) => {
        return await fetchOrgMetadata({ session_id, chatbot_id }, realEstateAgent, getInstructions);
    },

    // --- User Facing Tools --- 

    getProjectDetails: async ({ project_id, project_name }: { project_id?: string; project_name?: string }, transcript: TranscriptItem[] = []) => {
        return await getProjectDetails({ project_id, project_name }, realEstateAgent, transcript);
    },

    getPropertyImages: async ({ property_name, query }: { property_name?: string; query?: string }, transcript: TranscriptItem[] = []) => {
        return await getPropertyImages({ property_name, query }, realEstateAgent, transcript);
    },

    initiateScheduling: async ({}: {}, transcript: TranscriptItem[] = []) => {
        return await initiateScheduling({}, realEstateAgent);
    },

    lookupProperty: async ({ query, k = 3 }: { query: string; k?: number }, transcript: TranscriptItem[] = []) => {
        return await lookupProperty({ query, k }, realEstateAgent);
    },

    calculateRoute: async ({ origin, destination_property }: { origin: string; destination_property: string }, transcript: TranscriptItem[] = []) => {
        return await calculateRoute({ origin, destination_property }, realEstateAgent, transcript);
    },
    findNearestPlace: async ({ query, reference_property }: { query: string; reference_property: string }, transcript: TranscriptItem[] = []) => {
        return await findNearestPlace({ query, reference_property }, realEstateAgent, transcript);
    },
    
    completeScheduling: async () => {
        return await completeScheduling(realEstateAgent);
    },
    
    showPropertyLocation: async ({ property_name }: { property_name?: string }, transcript: TranscriptItem[] = []) => {
        return await showPropertyLocation({ property_name }, realEstateAgent, transcript);
    },
    
    showPropertyBrochure: async ({ property_name }: { property_name?: string }, transcript: TranscriptItem[] = []) => {
        return await showPropertyBrochure({ property_name }, realEstateAgent, transcript);
    }
  },
};

// Re-apply instructions after definition
realEstateAgent.instructions = getInstructions(realEstateAgent.metadata);

export default realEstateAgent; 