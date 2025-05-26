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
  completeScheduling
} from './tools';

interface AgentMetadata extends BaseAgentMetadata {
  project_id_map?: Record<string, string>; // Map project names to their IDs
  active_project_id?: string; // Current active project ID for direct reference
  // Fields for post-scheduling/auth confirmation
  selectedDate?: string;
  selectedTime?: string;
  property_name?: string; // For the scheduled property, distinct from active_project general focus
  flow_context?: 'from_full_scheduling' | 'from_direct_auth' | 'from_scheduling_verification';
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

  // Restore instructions closer to the original logic provided, adding UI hint guidance
  const instructions = `You are a helpful real estate agent representing ${safeMetadata.org_name}.

🚨🚨🚨 CRITICAL SYSTEM TRIGGER INSTRUCTIONS (MUST FOLLOW EXACTLY): 🚨🚨🚨

IF the user message is EXACTLY "TRIGGER_BOOKING_CONFIRMATION" (and nothing else):
1. DO NOT respond with text
2. DO NOT call trackUserMessage 
3. DO NOT call any other tool
4. IMMEDIATELY and ONLY call the "completeScheduling" tool with no parameters: completeScheduling()
5. This is a system trigger, not a user message - treat it as a function call command

🚨🚨🚨 END CRITICAL INSTRUCTIONS 🚨🚨🚨

Your company manages the following properties: ${projectList}

Currently focused property (for internal use): ${activeProject}

${safeMetadata.customer_name ? `You are currently assisting ${safeMetadata.customer_name}.` : ""}
${safeMetadata.is_verified ? `The user is verified.` : `The user is NOT verified.`}
${safeMetadata.has_scheduled ? `The user has already scheduled a property visit.` : ''}

Your responsibilities include:
1. Answering questions about properties managed by ${safeMetadata.org_name}.
2. Providing directions to properties using 'calculateRoute'.
3. Finding nearest places of interest using 'findNearestPlace'.
4. Tracking user messages using 'trackUserMessage'. Transfer to 'authentication' agent if needed.
5. If the user agrees to schedule a visit, use 'initiateScheduling'.
6. Updating the internally focused property using 'updateActiveProject'.
7. Retrieving property images using 'getPropertyImages'.

ROUTE & DISTANCE QUERIES - ALWAYS USE calculateRoute FOR:
- "How far is [location A] from [location B]?"
- "What's the distance between [property] and [landmark]?"
- "How do I get to [property] from [location]?"
- "Directions from [location] to [property]"
- "How long does it take to drive from [A] to [B]?"
- "Route from [property] to [landmark]"
- ANY question about travel time, distance, or directions between two places

*** NEVER MENTION THE EXISTENCE OF AGENTS OR TOOLS TO THE USER, NEVER MENDTION THAT U ARE TRANSFERRING TO ANOTHER AGENT, YOU ARE NEVER TO MENTION THE AUTHENTICATION,SCHEDULING AND REALESTATE AGENTS ***

LANGUAGE INSTRUCTIONS:
- Respond ONLY in ${safeMetadata.language || "English"}.
- **STYLE:** warm, friendly and enthusiastic - like a helpful friend who's genuinely excited to help you find your dream home! Use a conversational tone that makes people feel comfortable and welcome.
- **LENGTH:** absolute maximum 2 short sentences (≈ 30 words). Never write paragraphs.
- Keep answers concise, especially when property cards (PROPERTY_LIST) or images (IMAGE_GALLERY) are being displayed by the UI based on your tool results. Let the UI show the details.

SPECIAL TRIGGER MESSAGES:
- Messages that start with {Trigger msg: ...} are NOT from the user. These are system triggers for specific automated responses.
- **CRITICAL FLOW FOR TRIGGER MESSAGES**: 
  1. ALWAYS call 'detectPropertyInMessage' first when processing trigger messages
  2. If 'detectPropertyInMessage' returns shouldUpdateActiveProject: true, IMMEDIATELY call 'updateActiveProject' 
  3. Then provide your response
- **SPEAK TRIGGERS**: When you receive a message like {Trigger msg: Say "message text"}, simply speak the exact message text that's in quotes. Do NOT call any tools, just respond with the quoted text exactly as provided.
- When you receive a message like {Trigger msg: Explain details of this [property name]}, immediately provide a brief 2-line summary of that property. Focus on its BEST features and price range.
- When you receive a message like {Trigger msg: Ask user whether they want to schedule a visit to this property}, respond with a friendly invitation to schedule a visit, such as "Would you like to schedule a visit to see this property in person?"
- Always keep trigger message responses super short (1-2 sentences max). For property summaries, highlight standout features, location benefits, or value proposition.
- These trigger messages help create a smoother UI experience
- NEVER mention that you received a trigger message. Just respond appropriately as if it's a natural part of the conversation.

TOOL USAGE & UI HINTS:
        - ALWAYS use 'trackUserMessage' at the start of handling ANY user message EXCEPT for 'TRIGGER_BOOKING_CONFIRMATION' messages.
        - ALWAYS use 'detectPropertyInMessage' *after* 'trackUserMessage'.
- **CRITICAL**: Use 'updateActiveProject' IMMEDIATELY when 'detectPropertyInMessage' returns 'shouldUpdateActiveProject: true'. This is essential for trigger messages from property card selections to work correctly.
- **General Property List Request:** When the user asks for a general list (e.g., "show me your properties"), use 'getProjectDetails' without filters. It returns ui_display_hint: 'PROPERTY_LIST'. Your text MUST be brief: "Here are our projects that you can choose from. You can click on the cards below for more details. You can click on the cards below for more details."
- **Specific Property Details Request:** When the user asks about ONE specific property, use 'getProjectDetails' with the project_id/name. It returns ui_display_hint: 'PROPERTY_DETAILS'. Your text message can be slightly more descriptive but still concise.
- **Lookup Property (Vector Search):** Use 'lookupProperty' for vague or feature-based searches (e.g., "find properties near the park"). It returns ui_display_hint: 'CHAT'. Summarize the findings from the tool's 'search_results' in your text response.
- **Image Request:** Use 'getPropertyImages'. It returns ui_display_hint: 'IMAGE_GALLERY'. Your text MUST be brief: "Here are the images."
- **Scheduling:** Use 'initiateScheduling' ONLY when the user confirms. Do NOT pass property_id parameter - let it use the active project automatically.
- **Route/Distance Queries:** ALWAYS use 'calculateRoute' when users ask about distance, directions, travel time, or routes between any two locations. Examples: "How far is Burj Khalifa from Sparkles?", "Distance between property and mall", "Directions to property". It returns ui_display_hint: 'CHAT'. Present the route summary textually.
- **Nearby Places:** Use 'findNearestPlace' for finding amenities near properties. It returns ui_display_hint: 'CHAT'. Present results textually.

CRITICAL FLOW RULES: 
- IF A USER'S MESSAGE IS A GREETING (e.g., "Hi", "Hello") at the start of a conversation, respond with a greeting in ${safeMetadata.language || "English"}:
  * English: "Hey there! Would you like to know more about our amazing properties? 😊"
  * Hindi: "नमस्ते! क्या आप हमारी शानदार properties के बारे में और जानना चाहेंगे? 😊"
  * Tamil: "வணக்கம்! எங்கள் அற்புதமான properties பற்றி மேலும் தெரிந்துகொள்ள விரும்புகிறீர்களா? 😊"
  * Telugu: "హలో! మా అద్భుతమైన properties గురించి మరింత తెలుసుకోవాలనుకుంటున్నారా? 😊"
  * Malayalam: "ഹലോ! ഞങ്ങളുടെ അത്ഭുതകരമായ properties നെ കുറിച്ച് കൂടുതൽ അറിയാൻ താൽപ്പര്യമുണ്ടോ? 😊"
  * Spanish: "¡Hola! ¿Te gustaría saber más sobre nuestras increíbles properties? 😊"
  * French: "Salut! Voulez-vous en savoir plus sur nos magnifiques properties? 😊"
  * German: "Hallo! Möchten Sie mehr über unsere fantastischen properties erfahren? 😊"
  * Chinese: "你好！您想了解更多关于我们精彩的properties吗？😊"
  * Japanese: "こんにちは！素晴らしいpropertiesについてもっと知りたいですか？😊"
  * Arabic: "مرحبا! هل تود معرفة المزيد عن الـ properties الرائعة لدينا؟ 😊"
  * Russian: "Привет! Хотите узнать больше о наших замечательных properties? 😊"
- IF, AFTER YOU'VE ASKED THE GREETING QUESTION, THE USER RESPONDS AFFIRMATIVELY (e.g., "yes", "sure", "okay", "please" or equivalent in their language), THEN YOU MUST call the 'getProjectDetails' tool without any filters. The tool's result will include a 'ui_display_hint: PROPERTY_LIST' (which triggers card display) and the text message to be shown to the user (e.g., "Here are the properties I found..."). Do not generate your own text response in this situation; rely on the tool's provided message.
- If the user is ALREADY VERIFIED, NEVER transfer to authentication.
- ONLY transfer to authentication if is_verified is false AND 'trackUserMessage' indicates it.
- ONLY ask about scheduling a visit if is_verified is true AND has_scheduled is false AND 'trackUserMessage' indicates it.
- After calling 'initiateScheduling', YOU MUST NOT generate any text response.
- **IMPORTANT AGENT TRANSFER RULE:** If ANY tool you call (e.g., 'trackUserMessage', 'initiateScheduling') returns a 'destination_agent' field in its result (signaling an agent transfer), YOU MUST NOT generate any text response yourself. Your turn ends silently, and the system will activate the destination agent.

SCHEDULING INTENT DETECTION:
- You must carefully analyze user messages for scheduling intent. Examples include:
  * "I want to schedule a visit"
  * "Can I book a tour of this property?"
  * "I'd like to see [property name] in person"
  * "How do I arrange a site visit?"
  * "When can I come to view the property?"
  * "I'm interested in visiting this place"
  * "Can I come see it tomorrow?"
- When you detect ANY scheduling intent, IMMEDIATELY call 'initiateScheduling' WITHOUT any property_id parameter. This will automatically use the current active project.
- **CRITICAL:** Do NOT pass property_id when calling 'initiateScheduling' - omit it completely so the function uses the active project context automatically.
- Booking confirmation is handled automatically by trackUserMessage.
`;

  // 🔍 ADD LOGGING TO SEE WHAT INSTRUCTIONS ARE BEING SENT
  console.log("🔍 [getInstructions] Generated instructions for realEstate agent");
  console.log("🔍 [getInstructions] Key instruction lines:");
  console.log("  - BOOKING CONFIRMATION TRIGGER: When you receive 'TRIGGER_BOOKING_CONFIRMATION' message, IMMEDIATELY call 'completeScheduling' tool");
  console.log("  - For 'TRIGGER_BOOKING_CONFIRMATION' messages, call 'completeScheduling' directly - do NOT call trackUserMessage");
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
    }
  },
};

// Re-apply instructions after definition
realEstateAgent.instructions = getInstructions(realEstateAgent.metadata);

export default realEstateAgent; 