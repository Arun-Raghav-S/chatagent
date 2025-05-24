import { AgentConfig, AgentMetadata as BaseAgentMetadata, TranscriptItem } from "@/types/types"; // Adjusted path
// Supabase/Langchain imports commented out - using edge function instead
// import supabaseAdmin from "@/app/lib/supabaseClient"; // Requires setup in new project
// import { OpenAIEmbeddings } from "@langchain/openai";
// import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

// Extend the AgentMetadata type to include project_id_map
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

// Define necessary UI prop types locally for mapping
/*
interface PropertyLocation {
  city?: string;
  mapUrl?: string;
  coords?: string;
}

interface PropertyImageForMapping {
  url?: string;
  alt?: string;
  description?: string;
}

interface PropertyUnitForMapping {
  type: string;
}

interface AmenityForMapping {
  name: string;
}

interface PropertyProps {
  id?: string;
  name?: string;
  price?: string;
  area?: string;
  location?: PropertyLocation;
  mainImage?: string;
  galleryImages?: PropertyImageForMapping[];
  units?: PropertyUnitForMapping[];
  amenities?: AmenityForMapping[];
  description?: string;
  websiteUrl?: string;
}
*/

// Required Environment Variables: NEXT_PUBLIC_SUPABASE_ANON_KEY
// Optional Environment Variables: NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL (defaults provided)

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const toolsEdgeFunctionUrl = process.env.NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL || "https://dashboard.propzing.in/functions/v1/realtime_tools";

// Track question count - Reset on agent initialization or context change
let questionCount = 0;

// Dynamic instructions function - receives metadata object
const getInstructions = (metadata: AgentMetadata | undefined | null) => {
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
  return `You are a helpful real estate agent representing ${safeMetadata.org_name}. 

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

*** NEVER MENTION THE EXISTENCE OF AGENTS OR TOOLS TO THE USER, NEVER MENDTION THAT U ARE TRANSFERRING TO ANOTHER AGENT, YOU ARE NEVER TO MENTION THE AUTHENTICATION,SCHEDULING AND REALESTATE AGENTS ***

LANGUAGE INSTRUCTIONS:
- Respond ONLY in ${safeMetadata.language || "English"}.
- **STYLE:** fun-casual, like you're chatting with a friend.
- **LENGTH:** absolute maximum 2 short sentences (≈ 30 words). Never write paragraphs.
- Keep answers concise, especially when property cards (PROPERTY_LIST) or images (IMAGE_GALLERY) are being displayed by the UI based on your tool results. Let the UI show the details.

SPECIAL TRIGGER MESSAGES:
- Messages that start with {Trigger msg: ...} are NOT from the user. These are system triggers for specific automated responses.
- **CRITICAL FLOW FOR TRIGGER MESSAGES**: 
  1. ALWAYS call 'detectPropertyInMessage' first when processing trigger messages
  2. If 'detectPropertyInMessage' returns shouldUpdateActiveProject: true, IMMEDIATELY call 'updateActiveProject' 
  3. Then provide your response
- When you receive a message like {Trigger msg: Explain details of this [property name]}, immediately provide a brief 2-line summary of that property. Focus on its BEST features and price range.
- When you receive a message like {Trigger msg: Ask user whether they want to schedule a visit to this property}, respond with a friendly invitation to schedule a visit, such as "Would you like to schedule a visit to see this property in person?"
- Always keep trigger message responses super short (1-2 sentences max). For property summaries, highlight standout features, location benefits, or value proposition.
- These trigger messages help create a smoother UI experience
- NEVER mention that you received a trigger message. Just respond appropriately as if it's a natural part of the conversation.

TOOL USAGE & UI HINTS:
- ALWAYS use 'trackUserMessage' at the start of handling ANY user message (not trigger messages).
- ALWAYS use 'detectPropertyInMessage' *after* 'trackUserMessage'.
- **CRITICAL**: Use 'updateActiveProject' IMMEDIATELY when 'detectPropertyInMessage' returns 'shouldUpdateActiveProject: true'. This is essential for trigger messages from property card selections to work correctly.
- **General Property List Request:** When the user asks for a general list (e.g., "show me your properties"), use 'getProjectDetails' without filters. It returns ui_display_hint: 'PROPERTY_LIST'. Your text MUST be brief: "Here are our projects that you can choose from. You can click on the cards below for more details. You can click on the cards below for more details."
- **Specific Property Details Request:** When the user asks about ONE specific property, use 'getProjectDetails' with the project_id/name. It returns ui_display_hint: 'PROPERTY_DETAILS'. Your text message can be slightly more descriptive but still concise.
- **Lookup Property (Vector Search):** Use 'lookupProperty' for vague or feature-based searches (e.g., "find properties near the park"). It returns ui_display_hint: 'CHAT'. Summarize the findings from the tool's 'search_results' in your text response.
- **Image Request:** Use 'getPropertyImages'. It returns ui_display_hint: 'IMAGE_GALLERY'. Your text MUST be brief: "Here are the images."
- **Scheduling:** Use 'initiateScheduling' ONLY when the user confirms. It transfers silently (no ui_display_hint needed from it, handled by the receiving agent).
- **Scheduling Confirmation:** If the user says "Show the booking confirmation page" then you must call the 'completeScheduling' tool.
- **Other Tools ('calculateRoute', 'findNearestPlace'):** These likely return ui_display_hint: 'CHAT'. Present their results textually.

CRITICAL FLOW RULES: 
- IF A USER'S MESSAGE IS A GREETING (e.g., "Hi", "Hello") at the start of a conversation, respond with: "Hi! Would you like to know more about our properties?"
- IF, AFTER YOU'VE ASKED "Hi! Would you like to know more about our properties?", THE USER RESPONDS AFFIRMATIVELY (e.g., "yes", "sure", "okay", "please"), THEN YOU MUST call the 'getProjectDetails' tool without any filters. The tool's result will include a 'ui_display_hint: PROPERTY_LIST' (which triggers card display) and the text message to be shown to the user (e.g., "Here are the properties I found..."). Do not generate your own text response in this situation; rely on the tool's provided message.
- If the user is ALREADY VERIFIED, NEVER transfer to authentication.
- ONLY transfer to authentication if is_verified is false AND 'trackUserMessage' indicates it.
- ONLY ask about scheduling a visit if is_verified is true AND has_scheduled is false AND 'trackUserMessage' indicates it.
- After calling 'initiateScheduling', YOU MUST NOT generate any text response.
- **IMPORTANT AGENT TRANSFER RULE:** If ANY tool you call (e.g., 'trackUserMessage', 'initiateScheduling') returns a 'destination_agent' field in its result (signaling an agent transfer), YOU MUST NOT generate any text response yourself. Your turn ends silently, and the system will activate the destination agent.
- After 'completeScheduling' is called by you or another tool AND it results in a 'BOOKING_CONFIRMATION' UI hint (because the booking is done), YOU MUST SAY THAT THE BOOKING IS CONFIRMED. The UI will display the confirmation.THE UI HINT IS BOOKING_CONFIRMATION.

SCHEDULING INTENT DETECTION:
- You must carefully analyze user messages for scheduling intent. Examples include:
  * "I want to schedule a visit"
  * "Can I book a tour of this property?"
  * "I'd like to see [property name] in person"
  * "How do I arrange a site visit?"
  * "When can I come to view the property?"
  * "I'm interested in visiting this place"
  * "Can I come see it tomorrow?"
- When you detect ANY scheduling intent, IMMEDIATELY call 'initiateScheduling'. Do NOT wait for a precise phrasing or a button click.
-IMPORTANT: IF THE USER SAYS "Show the booking confirmation page" THEN YOU MUST CALL THE 'completeScheduling' TOOL AND NOTHING ELSE.
- If the user expresses interest in a specific property AND a scheduling intent, make sure to include the property_id when calling 'initiateScheduling'.
- Pay attention to context - if the user has just been viewing details of a specific property and then expresses scheduling intent, assume they want to schedule for that property.
`;
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
      description: "Internal tool: Tracks user messages, increments question count, and triggers authentication or scheduling prompts based on count and user status. Also handles special flow contexts.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The user's message (for logging/context)" },
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
        "Calculates a driving route to a property. Use when the user asks for directions.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description:
              "The starting location (can be text like 'my current location' or 'lat,lng').",
          },
          destination_property: {
            type: "string",
            description: "The name of the destination property.",
             // enum will be dynamically populated if possible
          },
           // destination lat/lng and is_verified are accessed from agent metadata internally
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
      description: "Internal tool: Triggers the scheduling flow by transferring to the scheduleMeeting agent silently. Use when the user explicitly agrees to schedule a visit (e.g., says 'yes' after being asked) or requests it directly.",
      parameters: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "Optional. The ID of the specific property to schedule for. If omitted, the agent will use the active project." },
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
        const metadata = realEstateAgent.metadata as AgentMetadata;
        
        // Check for special trigger messages (other than "Show the booking confirmation page" which LLM handles based on its specific instruction)
        if (message.startsWith('{Trigger msg:') && message !== "Show the booking confirmation page") {
            console.log("[trackUserMessage] Detected special trigger message (not confirmation page):", message);
            return { 
                success: true, 
                is_trigger_message: true, // Let LLM know it's a trigger
            };
        }
        
        // PRIORITY 1: Handle specific flow contexts first
        if (metadata?.flow_context === 'from_scheduling_verification' && message === "Show the booking confirmation page") {
            console.log("[trackUserMessage] 'from_scheduling_verification' context, message is 'Show the booking confirmation page'. trackUserMessage will now complete its standard processing, allowing the LLM to subsequently call completeScheduling.");
            if (realEstateAgent.metadata) {
                // Clear the flow_context here so this specific block isn't re-entered
                // and to signify this part of the flow has been acknowledged.
                (realEstateAgent.metadata as AgentMetadata).flow_context = undefined; 
            }
            // No early return. Let trackUserMessage continue with its normal logic (counting, etc.).
            // The LLM will then use its instructions for "Show the booking confirmation page" 
            // to call completeScheduling.
        } else if (metadata?.flow_context === 'from_full_scheduling') { 
            console.log("[trackUserMessage] Handling 'from_full_scheduling' context. Directly returning function_call for completeScheduling.");
            if (realEstateAgent.metadata) {
                (realEstateAgent.metadata as AgentMetadata).flow_context = undefined; 
            }
            // This specific context is an exception and IS allowed to return a function_call, 
            // as it's designed as an internal automated flow.
            return {
                function_call: {
                    name: "completeScheduling",
                    arguments: JSON.stringify({}) 
                }
            };
        } else if (metadata?.flow_context === 'from_direct_auth') {
            const confirmationMsg = `You have been successfully verified, ${metadata.customer_name || 'there'}! How can I help you further?`;
            console.log("[trackUserMessage] Handling 'from_direct_auth' context:", confirmationMsg);
            if (realEstateAgent.metadata) {
                realEstateAgent.metadata.has_scheduled = true; 
                realEstateAgent.metadata.is_verified = true;
                delete (realEstateAgent.metadata as any).flow_context;
                (realEstateAgent.metadata as AgentMetadata).selectedDate = undefined;
                (realEstateAgent.metadata as AgentMetadata).selectedTime = undefined;
            }
            
            try {
                const notifierData = {
                    org_id: metadata.org_id || "",
                    builder_name: metadata.org_name || "Property Developer",
                    lead_name: metadata.customer_name || "",
                    phone: metadata.phone_number?.replace("+", "") || ""
                };
                fetch("https://dsakezvdiwmoobugchgu.functions.supabase.co/whatsapp-notifier", { /* ... */ });
                const scheduleData = {
                    customerName: metadata.customer_name || "",
                    phoneNumber: metadata.phone_number?.startsWith("+") ? metadata.phone_number.substring(1) : metadata.phone_number || "",
                    propertyId: metadata.property_id_to_schedule || "",
                    visitDateTime: `${metadata.selectedDate}, ${metadata.selectedTime}`,
                    chatbotId: metadata.chatbot_id || ""
                };
                fetch("https://dsakezvdiwmoobugchgu.supabase.co/functions/v1/schedule-visit-whatsapp", { /* ... */ });
            } catch (error) {
                console.error("[trackUserMessage] Error making API calls in from_direct_auth:", error);
            }
            
            return {
                success: true,
                message: null, 
                ui_display_hint: 'BOOKING_CONFIRMATION', 
                booking_details: {
                    customerName: metadata.customer_name,
                    propertyName: metadata.property_name || "the property",
                    date: metadata.selectedDate,
                    time: metadata.selectedTime,
                    phoneNumber: metadata.phone_number
                }
            };
        }
        // END OF PRIORITY FLOW CONTEXT HANDLING

        const is_verified = metadata?.is_verified ?? false;
        const has_scheduled = metadata?.has_scheduled ?? false;

        // Check for UI button scheduling message or natural language scheduling intent
        // EXCLUDE "Show the booking confirmation page" as the LLM handles that based on its instructions.
        if (message !== "Show the booking confirmation page") {
            const scheduleRegex = /^Yes, I'd like to schedule a visit for (.+?)[.!]?$/i;
            const scheduleRequestFromUiButton = message.startsWith("Yes, I'd like to schedule a visit for"); 

            const schedulingIntentRegexes = [
                /\b(schedule|book|arrange|set up|plan) .*?(visit|tour|viewing|showing|appointment|meeting)/i,
                /\b(visit|tour|see|view) .*?(property|home|house|apartment|place) in person/i,
                /\bcan i .*?(visit|tour|see|view|come)/i,
                /\bwhen can i .*?(visit|tour|see|view|come)/i,
                /\b(interested|want) .*?(visit|tour|see|view)/i,
                /\bhow do i .*?(visit|tour|see|view)/i,
                /\btake a look .*?(at|in person)/i,
                /\bsite visit\b/i,
                /^(yes|sure|okay|ok)$/i // Simple affirmative responses that might indicate scheduling agreement
            ];
            const hasSchedulingIntent = schedulingIntentRegexes.some(regex => regex.test(message));

            if (scheduleRequestFromUiButton || hasSchedulingIntent) {
                console.log(`[trackUserMessage] Scheduling intent detected: "${message}"`);
                
                let propertyName = null;
                if (scheduleRequestFromUiButton) {
                    const propertyNameMatch = message.match(scheduleRegex);
                    propertyName = propertyNameMatch ? propertyNameMatch[1]?.trim() : null;
                }
                
                // Priority order for determining property:
                // 1. Active project (most recently focused property)
                // 2. Property name from message
                // 3. First available property
                if (!propertyName) {
                    // Get the most current active project
                    const currentActiveProject = metadata?.active_project && metadata.active_project !== "N/A" ? 
                                                 metadata.active_project : null;
                    
                    if (currentActiveProject) {
                        propertyName = currentActiveProject;
                        console.log(`[trackUserMessage] Using current active project: "${propertyName}"`);
                    } else {
                        // Fallback to first available project
                        propertyName = ((metadata as any)?.project_id_map ? Object.keys((metadata as any).project_id_map)[0] : null);
                        console.log(`[trackUserMessage] Using fallback project: "${propertyName}"`);
                    }
                }

                const metadataAny = metadata as any;
                let propertyIdToSchedule = metadataAny?.active_project_id; 

                if (!propertyIdToSchedule && propertyName && metadataAny?.project_id_map) {
                    propertyIdToSchedule = metadataAny.project_id_map[propertyName];
                }
                
                if (!propertyIdToSchedule && metadata?.project_ids && metadata.project_ids.length > 0) {
                    propertyIdToSchedule = metadata.project_ids[0];
                }

                console.log(`[trackUserMessage] Scheduling with property: "${propertyName}" (ID: ${propertyIdToSchedule})`);

                if (propertyIdToSchedule) {
                    return {
                        destination_agent: "scheduleMeeting",
                        property_id_to_schedule: propertyIdToSchedule,
                        property_name: propertyName, 
                        // Also ensure active project context is passed
                        active_project: propertyName,
                        active_project_id: propertyIdToSchedule,
                        silentTransfer: true,
                        message: null 
                    };
                } else {
                    return {
                        destination_agent: "scheduleMeeting",
                        property_name: propertyName,
                        active_project: propertyName,
                        silentTransfer: true,
                        message: null 
                    };
                }
            }
        }

        questionCount++;
        console.log(`[trackUserMessage] Q#: ${questionCount}, Verified: ${is_verified}, Scheduled: ${has_scheduled}, Msg: "${message}"`);

        if (!is_verified && questionCount >= 7) {
          console.log("[trackUserMessage] User not verified after 7 questions, transferring to authentication");
          questionCount = 0;
          return { destination_agent: "authentication" };
        }

        if (is_verified && !has_scheduled && questionCount >= 12) {
           console.log("[trackUserMessage] Asking user about scheduling visit.");
           questionCount = 0; 
           return { 
             askToSchedule: true, 
             message: "Would you like to schedule a visit to see a property in person?" 
           };
        }

        return { success: true, questionCount, message_processed_by_trackUserMessage: true }; 
    },

    detectPropertyInMessage: async ({ message }: { message: string }) => {
        console.log(`[detectPropertyInMessage] Analyzing message: "${message}"`);
        
        const metadata = realEstateAgent.metadata as AgentMetadata; // Added type assertion

        // Skip processing for trigger messages to avoid unnecessary property detection
        if (message.startsWith('{Trigger msg:')) {
            console.log("[detectPropertyInMessage] Processing trigger message for property detection");
            
            // Extract property name from trigger message - be more flexible with the pattern
            // Match any trigger message that contains "this" followed by a property name
            const triggerPropertyRegex = /\{Trigger msg:.*?this\s+(.+?)(?:\s+in\s+brief|\s+\})/i;
            const match = message.match(triggerPropertyRegex);
            
            if (match && match[1]) {
                let propertyNameFromTrigger = match[1].trim();
                
                // Clean up common suffixes that might be captured
                propertyNameFromTrigger = propertyNameFromTrigger.replace(/(\s+in\s+brief|\s+and\s+then.*|\s+\}).*$/i, '').trim();
                
                console.log(`[detectPropertyInMessage] Property name extracted from trigger: "${propertyNameFromTrigger}"`);
                
                // Find the closest matching property name from available projects
                const project_names = metadata?.project_names || [];
                let matchedProperty = null;
                
                // First try exact match
                if (project_names.includes(propertyNameFromTrigger)) {
                    matchedProperty = propertyNameFromTrigger;
                } else {
                    // Try case-insensitive match
                    matchedProperty = project_names.find(p => 
                        p.toLowerCase() === propertyNameFromTrigger.toLowerCase()
                    );
                    
                    // If still no match, try partial match
                    if (!matchedProperty) {
                        matchedProperty = project_names.find(p => 
                            p.toLowerCase().includes(propertyNameFromTrigger.toLowerCase()) ||
                            propertyNameFromTrigger.toLowerCase().includes(p.toLowerCase())
                        );
                    }
                }

                if (matchedProperty) {
                    console.log(`[detectPropertyInMessage] Matched property: "${matchedProperty}" from trigger`);
                    return {
                        propertyDetected: true,
                        detectedProperty: matchedProperty,
                        shouldUpdateActiveProject: true, // Always update for trigger messages
                        isTriggerMessage: true
                    };
                } else {
                    console.log(`[detectPropertyInMessage] Property "${propertyNameFromTrigger}" not found in available projects:`, project_names);
                }
            }
            
            return { 
                propertyDetected: false, 
                isTriggerMessage: true 
            };
        }
        
        const project_names = metadata?.project_names || [];
        console.log(`[detectPropertyInMessage] Available properties:`, project_names);

        // ADDITION: Direct check for scheduling messages
        const scheduleRegex = /^Yes, I'd like to schedule a visit for (.+?)[.!]?$/i;
        const scheduleMatch = message.match(scheduleRegex);
        
        // NEW: Check for scheduling intent with property reference
        const schedulingWithPropertyRegexes = [
            /\b(schedule|book|arrange|set up|plan) .*?(visit|tour|viewing|showing) .*?for (\w+)/i,
            /\b(visit|tour|see|view) .*?(\w+) .*?in person/i,
            /\b(interested|want) to .*?(visit|tour|see|view) .*?(\w+)/i
        ];
        
        let propertyName = null;
        let isScheduleRequest = false;
        
        // Check explicit UI button format first
        if (scheduleMatch) {
            propertyName = scheduleMatch[1].trim();
            isScheduleRequest = true;
            console.log(`[detectPropertyInMessage] Detected UI button scheduling request for: "${propertyName}"`);
        }
        
        // If no explicit match, check if it's a natural language scheduling request with property mention
        if (!propertyName) {
            for (const regex of schedulingWithPropertyRegexes) {
                const match = message.match(regex);
                if (match && match[3]) {
                    // Extract potential property name and verify against known properties
                    const potentialName = match[3].trim();
                    // Check if this substring appears in any known property name
                    const matchedProperty = project_names.find(p => 
                        p.toLowerCase().includes(potentialName.toLowerCase()) || 
                        potentialName.toLowerCase().includes(p.toLowerCase().replace(/\s+/g, ''))
                    );
                    
                    if (matchedProperty) {
                        propertyName = matchedProperty;
                        isScheduleRequest = true;
                        console.log(`[detectPropertyInMessage] Detected natural language scheduling for: "${propertyName}"`);
                        break;
                    }
                }
            }
        }
        
        if (isScheduleRequest && propertyName) {
            // Find property ID if possible
            let propertyId = null;
            // Use type assertion to access these properties
            const metadataAny = metadata as any;
            if (metadataAny?.project_id_map && metadataAny.project_id_map[propertyName]) {
                propertyId = metadataAny.project_id_map[propertyName];
            } else if (metadataAny?.active_project_id && 
                      (propertyName.toLowerCase() === metadata?.active_project?.toLowerCase())) {
                propertyId = metadataAny.active_project_id;
            }
            
            // Return special flag for scheduling
            return {
                propertyDetected: true,
                detectedProperty: propertyName,
                shouldUpdateActiveProject: true,
                isScheduleRequest: true,
                schedulePropertyId: propertyId
            };
        }

        if (!project_names.length) {
          return { propertyDetected: false, message: "No properties available" };
        }

        // Continue with regular property detection
        const normalizedMessage = message.toLowerCase().trim();
        let detectedProperty: string | null = null;

        // Function to check for match (exact or spaceless)
        const isMatch = (prop: string, msg: string) => {
            const trimmedProp = prop.trim().toLowerCase();
            const propNoSpaces = trimmedProp.replace(/\s+/g, '');
            const msgNoSpaces = msg.replace(/\s+/g, '');
            // Check for whole word match (exact) or spaceless containment
            const regex = new RegExp(`\\b${trimmedProp.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`); // Escape special chars
            return regex.test(msg) || msgNoSpaces.includes(propNoSpaces);
        };

        // Check for matches
        for (const property of project_names) {
           if (isMatch(property, normalizedMessage)) {
              detectedProperty = property; // Use original casing
              console.log(`[detectPropertyInMessage] Match found for: "${property}"`);
              break;
           }
        }

        if (detectedProperty && metadata?.active_project !== detectedProperty) {
          console.log(`[detectPropertyInMessage] Detected property "${detectedProperty}" is different from active "${metadata?.active_project}".`);
          // Return detected property; updateActiveProject should be called next by LLM if needed
          return {
            propertyDetected: true,
            detectedProperty: detectedProperty,
            shouldUpdateActiveProject: true, // Hint to LLM to call updateActiveProject
          };
        } else if (detectedProperty) {
            console.log(`[detectPropertyInMessage] Detected property "${detectedProperty}" is already active.`);
            return { propertyDetected: true, detectedProperty: detectedProperty, shouldUpdateActiveProject: false };
        } else {
             console.log(`[detectPropertyInMessage] No specific property detected.`);
             return { propertyDetected: false };
        }
    },

    updateActiveProject: async ({ project_name }: { project_name: string }) => {
        console.log(`[updateActiveProject] Attempting to set active project to: "${project_name}"`);
        const metadata = realEstateAgent.metadata;
        if (!metadata) {
            console.error("[updateActiveProject] Agent metadata is missing.");
            return { success: false, message: "Agent metadata unavailable." };
        }

        const availableProjects = metadata.project_names || [];
        const trimmedProjectName = project_name.trim();

        // Find the project in available projects (case-insensitive)
        const matchedProject = availableProjects.find(
           p => p.trim().toLowerCase() === trimmedProjectName.toLowerCase()
        );

        if (!matchedProject) {
           console.error(`[updateActiveProject] Project "${trimmedProjectName}" not found in available list: ${availableProjects.join(", ")}`);
           return { success: false, message: `Project "${trimmedProjectName}" is not recognized.` };
        }

        // Update metadata
        const previousProject = metadata.active_project;
        metadata.active_project = matchedProject; // Use original casing
        
        // Store the project_id too if available in project_id_map
        const metadataAny = metadata as any;
        if (metadataAny.project_id_map && metadataAny.project_id_map[matchedProject]) {
            metadataAny.active_project_id = metadataAny.project_id_map[matchedProject];
            console.log(`[updateActiveProject] Set active_project_id to: ${metadataAny.active_project_id}`);
        }

        // Update instructions (important!)
        realEstateAgent.instructions = getInstructions(metadata);

        console.log(`[updateActiveProject] Success: Active project changed from "${previousProject}" to "${matchedProject}"`);
        return { 
            success: true, 
            active_project: matchedProject,
            active_project_id: (metadata as any).active_project_id || null
        };
    },

    fetchOrgMetadata: async ({ session_id, chatbot_id }: { session_id: string; chatbot_id: string; }) => {
        console.log(`[fetchOrgMetadata] Fetching metadata via edge function for session: ${session_id}, chatbot: ${chatbot_id}`);
        if (!supabaseAnonKey) {
            console.error("[fetchOrgMetadata] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
            return { error: "Server configuration error." };
        }
        try {
            const response = await fetch(
                toolsEdgeFunctionUrl,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${supabaseAnonKey}`,
                    },
                    body: JSON.stringify({
                        action: "fetchOrgMetadata",
                        session_id,
                        chatbot_id,
                    }),
                }
            );

            const metadataResult: AgentMetadata & { error?: string } = await response.json();

            if (!response.ok || metadataResult.error) {
                console.error("[fetchOrgMetadata] Edge function error:", metadataResult.error || response.statusText);
                return { error: metadataResult.error || "Error fetching organizational metadata." };
            }

            console.log("[fetchOrgMetadata] Received metadata:", metadataResult);
            
            // Log critical IDs for debugging
            console.log("[fetchOrgMetadata] Critical ID fields in response:", {
                chatbot_id: metadataResult.chatbot_id,
                org_id: metadataResult.org_id,
                session_id: metadataResult.session_id
            });
            
            // Ensure org_id is preserved from the API response
            if (!metadataResult.org_id) {
                console.warn("[fetchOrgMetadata] No org_id in response, this will cause issues with authentication");
            }
            
            // Create project_id_map from returned data if not already present
            if (!metadataResult.project_id_map && metadataResult.project_ids && metadataResult.project_names) {
                // Make sure arrays are the same length
                const minLength = Math.min(metadataResult.project_ids.length, metadataResult.project_names.length);
                const project_id_map: Record<string, string> = {};
                
                // Create mapping from project name to ID
                for (let i = 0; i < minLength; i++) {
                    const name = metadataResult.project_names[i];
                    const id = metadataResult.project_ids[i];
                    if (name && id) {
                        project_id_map[name] = id;
                    }
                }
                
                metadataResult.project_id_map = project_id_map;
                console.log("[fetchOrgMetadata] Created project_id_map:", project_id_map);
            }

            // Reset question count when metadata is fetched/refreshed
            questionCount = 0;
            console.log("[fetchOrgMetadata] Reset question count to 0.");

            // Update the agent's internal state and instructions
            // Preserve critical fields from existing metadata before overwriting
            const existingMetadata = realEstateAgent.metadata || {};
            const preservedFields: Partial<AgentMetadata> = {
                is_verified: existingMetadata.is_verified,
                has_scheduled: existingMetadata.has_scheduled,
                customer_name: existingMetadata.customer_name,
                phone_number: existingMetadata.phone_number,
                // Preserve scheduling details if they exist from a previous flow
                selectedDate: (existingMetadata as any).selectedDate,
                selectedTime: (existingMetadata as any).selectedTime,
                property_name: (existingMetadata as any).property_name,
                project_id_map: (existingMetadata as any).project_id_map, // Preserve existing map if new one isn't created
                active_project_id: (existingMetadata as any).active_project_id, // Preserve existing active project id
            };

            realEstateAgent.metadata = { 
                ...preservedFields, // Apply preserved fields first
                ...metadataResult, // Then apply fetched results (will overwrite non-preserved if names clash)
                session_id // Ensure session_id from the fetch arguments persists
            } as AgentMetadata; // Cast the final object to AgentMetadata

            // If metadataResult provided its own project_id_map, it would have overwritten the preserved one.
            // If not, and we created one from project_ids/names, ensure it's part of the final metadata.
            if (!metadataResult.project_id_map && preservedFields.project_id_map && !(realEstateAgent.metadata as any).project_id_map) {
                (realEstateAgent.metadata as any).project_id_map = preservedFields.project_id_map;
            }
            // Same for active_project_id if not set by metadataResult
            if (!metadataResult.active_project_id && preservedFields.active_project_id && !(realEstateAgent.metadata as any).active_project_id) {
                (realEstateAgent.metadata as any).active_project_id = preservedFields.active_project_id;
            }

            realEstateAgent.instructions = getInstructions(realEstateAgent.metadata);
            console.log("[fetchOrgMetadata] Updated agent instructions based on new metadata.");
            
            // Log the final metadata state for debugging
            console.log("[fetchOrgMetadata] Final metadata state:", {
                chatbot_id: realEstateAgent.metadata.chatbot_id,
                org_id: realEstateAgent.metadata.org_id,
                session_id: realEstateAgent.metadata.session_id
            });

            return metadataResult; // Return fetched metadata

        } catch (error: any) {
            console.error("[fetchOrgMetadata] Exception calling edge function:", error);
            return { error: `Exception fetching metadata: ${error.message}` };
        }
    },

    // --- User Facing Tools --- 

    getProjectDetails: async ({ project_id, project_name }: { project_id?: string; project_name?: string }, transcript: TranscriptItem[] = []) => {
        console.log(`[getProjectDetails] Fetching project details: project_id=${project_id || 'none'}, project_name=${project_name || 'none'}`);
        
        const metadata = realEstateAgent.metadata;
        const project_ids_to_fetch = [] as string[];
        
        if (project_id) {
            project_ids_to_fetch.push(project_id);
        } else if (project_name && metadata && (metadata as any).project_id_map && (metadata as any).project_id_map[project_name]) {
            project_ids_to_fetch.push((metadata as any).project_id_map[project_name]);
        } else if (project_name && metadata && metadata.active_project === project_name && (metadata as any).active_project_id) {
            project_ids_to_fetch.push((metadata as any).active_project_id);
        } else if (metadata?.project_ids && metadata.project_ids.length > 0 && !project_id && !project_name) {
            // If no specific ID or name, fetch all. This implies a list view.
            project_ids_to_fetch.push(...metadata.project_ids);
        } else if (project_name) {
            // Attempt to fetch by name if ID wasn't found, edge function might handle partial match
            // This case is ambiguous for UI hint, might need more info or default to list
            // For now, we let the edge function decide what to return. If it returns one, we show details, else list.
            // The edge function needs to return a consistent structure. Let's assume it always returns a `properties` array.
        }

        if (project_ids_to_fetch.length === 0 && !project_name) {
            console.error("[getProjectDetails] No project IDs to fetch and no project name provided.");
            return {
                error: "No project specified for details.",
                ui_display_hint: 'CHAT',
                message: "Please specify which project you'd like details for."
            };
        }
        
        if (!supabaseAnonKey) {
            return { error: "Server configuration error.", ui_display_hint: 'CHAT', message: "Server configuration error." };
        }

        try {
            const payload = {
                action: "getProjectDetails",
                project_ids: project_ids_to_fetch.length > 0 ? project_ids_to_fetch : undefined,
                project_name: project_ids_to_fetch.length === 0 ? project_name : undefined,
            };

            console.log(`[getProjectDetails] Sending payload: ${JSON.stringify(payload)}`);

            const response = await fetch(
                toolsEdgeFunctionUrl,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${supabaseAnonKey}`,
                    },
                    body: JSON.stringify(payload),
                }
            );

            const result = await response.json();

            if (!response.ok || result.error) {
                console.error("[getProjectDetails] Edge function error:", result.error || response.statusText);
                return { 
                  error: result.error || "Error fetching project details.",
                  ui_display_hint: 'CHAT',
                  message: result.error ? `Failed to get details: ${result.error}` : "Could not fetch project details."
                };
            }

            console.log("[getProjectDetails] Received raw project details result:", result);

            if (result.properties && Array.isArray(result.properties)) {
                 if (result.properties.length === 1 && (project_id || (project_ids_to_fetch.length === 1 && !project_name) ) ) {
                     // Single property detail view
                     const property = result.properties[0];
                     const mainImage = property.images && property.images.length > 0 ? property.images[0].url : "/placeholder.svg";
                     const galleryImages = property.images && property.images.length > 1 ? property.images.slice(1).map((img: any) => ({ url: img.url, alt: img.alt || property.name, description: img.description })) : [];
                     const amenities = Array.isArray(property.amenities) ? property.amenities.map((amenity: any) => (typeof amenity === 'string' ? { name: amenity } : amenity)) : [];

                     return {
                         property_details: {
                            ...property,
                            mainImage,
                            galleryImages,
                            amenities
                         },
                         message: result.message || `Here are the details for ${property.name}.`,
                         ui_display_hint: 'PROPERTY_DETAILS',
                     };
                 } else if (result.properties.length > 0) {
                     // Multiple properties list view
                     const processedProperties = result.properties.map((property: any) => {
                        const mainImage = property.images && property.images.length > 0 ? property.images[0].url : "/placeholder.svg";
                        const galleryImages = property.images && property.images.length > 1 ? property.images.slice(1).map((img: any) => ({ url: img.url, alt: img.alt || property.name, description: img.description })) : [];
                        const amenities = Array.isArray(property.amenities) ? property.amenities.map((amenity: any) => (typeof amenity === 'string' ? { name: amenity } : amenity)) : [];
                        return {
                            ...property,
                            mainImage,
                            galleryImages,
                            amenities
                        };
                     });
                     return {
                         properties: processedProperties,
                         message: "Here are our projects that you can choose from. You can click on the cards below for more details.",
                         ui_display_hint: 'PROPERTY_LIST',
                     };
                 } else {
                      return { message: result.message || "I couldn't find any project details.", ui_display_hint: 'CHAT' };
                 }
             } else {
                 return { 
                    error: "Unexpected response structure from server.",
                    message: "I received an unexpected response while fetching details.",
                    ui_display_hint: 'CHAT',
                 };
             }

        } catch (error: any) {
            console.error("[getProjectDetails] Exception calling edge function:", error);
            return { 
              error: `Exception fetching project details: ${error.message}`,
              ui_display_hint: 'CHAT',
              message: "An error occurred while fetching project details."
            };
        }
    },

    getPropertyImages: async ({ property_name, query }: { property_name?: string; query?: string }, transcript: TranscriptItem[] = []) => {
        console.log(`[getPropertyImages] Fetching images for property: ${property_name || 'active project'}`);
        const metadata = realEstateAgent.metadata;
        const project_ids = metadata?.project_ids || [];
        const active_project = metadata?.active_project || "N/A";
        const targetPropertyForName = property_name || active_project;

        if (!supabaseAnonKey) {
            console.error("[getPropertyImages] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
            return { 
              error: "Server configuration error.", 
              ui_display_hint: 'CHAT', // Revert to chat on error
              message: "Sorry, I couldn't fetch images due to a server configuration issue."
            };
        }

        if (targetPropertyForName === "N/A") {
            return {
                error: "No property specified or active.",
                ui_display_hint: 'CHAT',
                message: "Please specify which property's images you'd like to see."
            };
        }

        try {
            const response = await fetch(
                toolsEdgeFunctionUrl,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${supabaseAnonKey}`,
                    },
                    body: JSON.stringify({
                        action: "getPropertyImages",
                        property_name: targetPropertyForName, // Use the determined name
                        query,
                        project_ids,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || result.error) {
                console.error("[getPropertyImages] Edge function error:", result.error || response.statusText);
                return { 
                  error: result.error || "Error fetching property images.",
                  ui_display_hint: 'CHAT',
                  message: result.error ? `Sorry, I couldn't fetch images: ${result.error}` : "Sorry, an error occurred while fetching images."
                };
            }

            console.log("[getPropertyImages] Received property images result:", result);

            if (result.images && result.images.length > 0) {
              return {
                  property_name: result.property_name || targetPropertyForName,
                  images: result.images,
                  message: "Here are the images you requested.",
                  ui_display_hint: 'IMAGE_GALLERY',
                  images_data: {
                      propertyName: result.property_name || targetPropertyForName,
                      images: result.images.map((img: any) => ({ url: img.image_url || img.url, alt: img.description || img.alt, description: img.description }))
                  }
              };
            } else {
              return {
                property_name: result.property_name || targetPropertyForName,
                images: [],
                message: result.message || `I couldn't find any images for ${result.property_name || targetPropertyForName}.`,
                ui_display_hint: 'CHAT'
              };
            }

        } catch (error: any) {
            console.error("[getPropertyImages] Exception calling edge function:", error);
            return { 
              error: `Exception fetching property images: ${error.message}`,
              ui_display_hint: 'CHAT',
              message: "Sorry, an unexpected error occurred while trying to fetch images."
            };
        }
    },

    initiateScheduling: async ({ property_id: P_id_arg }: { property_id?: string }, transcript: TranscriptItem[] = []) => {
        const metadata = realEstateAgent.metadata as AgentMetadata; 
        const metadataAny = metadata as any;
        
        let actualPropertyIdToSchedule: string | undefined = undefined;
        let propertyNameForScheduling: string | undefined = undefined;

        console.log(`[initiateScheduling] DEBUG - Input property_id_arg: ${P_id_arg}`);
        console.log("[initiateScheduling] DEBUG - Available metadata:");
        console.log("  - P_id_arg param:", P_id_arg);
        console.log("  - active_project_id:", metadataAny?.active_project_id);
        console.log("  - active_project:", metadata?.active_project);
        console.log("  - project_ids:", metadata?.project_ids);
        console.log("  - project_names:", metadataAny?.project_names);
        console.log("  - project_id_map:", metadataAny?.project_id_map);
        
        if (P_id_arg) {
            // Case 1: P_id_arg is a NAME and exists as a key in project_id_map
            if (metadataAny?.project_id_map && metadataAny.project_id_map[P_id_arg]) {
                propertyNameForScheduling = P_id_arg;
                actualPropertyIdToSchedule = metadataAny.project_id_map[P_id_arg];
                console.log(`[initiateScheduling] Resolved P_id_arg ('${P_id_arg}') as a NAME (key in project_id_map). ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
            }
            // Case 2: P_id_arg is an ID and exists as a value in project_id_map
            else if (metadataAny?.project_id_map) {
                for (const nameInMap in metadataAny.project_id_map) {
                    if (metadataAny.project_id_map[nameInMap] === P_id_arg) {
                        propertyNameForScheduling = nameInMap;
                        actualPropertyIdToSchedule = P_id_arg;
                        console.log(`[initiateScheduling] Resolved P_id_arg ('${P_id_arg}') as an ID (value in project_id_map). ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
                        break;
                    }
                }
            }

            // Fallback: If not found via project_id_map, check project_names and project_ids arrays
            if (!actualPropertyIdToSchedule && metadataAny?.project_names && metadataAny?.project_ids) {
                // Check if P_id_arg is a name in project_names
                const nameIndex = metadataAny.project_names.indexOf(P_id_arg);
                if (nameIndex !== -1 && metadataAny.project_ids[nameIndex]) {
                    propertyNameForScheduling = P_id_arg;
                    actualPropertyIdToSchedule = metadataAny.project_ids[nameIndex];
                    console.log(`[initiateScheduling] Resolved P_id_arg ('${P_id_arg}') as a NAME (in project_names array). ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
                } else {
                    // Check if P_id_arg is an ID in project_ids
                    const idIndex = metadataAny.project_ids.indexOf(P_id_arg);
                    if (idIndex !== -1 && metadataAny.project_names[idIndex]) {
                        actualPropertyIdToSchedule = P_id_arg;
                        propertyNameForScheduling = metadataAny.project_names[idIndex];
                        console.log(`[initiateScheduling] Resolved P_id_arg ('${P_id_arg}') as an ID (in project_ids array). ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
                    }
                }
            }
            
            // If P_id_arg was provided but couldn't be resolved, use it as name and ID will be undefined.
            // This might happen if project_id_map is not perfectly synced or name is ambiguous.
            if (!actualPropertyIdToSchedule && P_id_arg && !propertyNameForScheduling) {
                propertyNameForScheduling = P_id_arg; // Assume P_id_arg is the intended name
                actualPropertyIdToSchedule = undefined; // ID remains unknown
                console.warn(`[initiateScheduling] P_id_arg ('${P_id_arg}') was provided but could not be mapped to a known ID. Using it as name. Scheduling agent may need to clarify.`);
            }

        } else if (metadataAny?.active_project_id) {
            // No P_id_arg provided, use active project context
            actualPropertyIdToSchedule = metadataAny.active_project_id;
            propertyNameForScheduling = metadata?.active_project && metadata?.active_project !== "N/A" ? metadata.active_project : undefined;
            
            // If name is still undefined for the active_project_id, try to find it
            if (!propertyNameForScheduling && actualPropertyIdToSchedule) {
                if (metadataAny?.project_id_map) {
                    for (const nameInMap in metadataAny.project_id_map) {
                        if (metadataAny.project_id_map[nameInMap] === actualPropertyIdToSchedule) {
                            propertyNameForScheduling = nameInMap;
                            break;
                        }
                    }
                }
                if (!propertyNameForScheduling && metadataAny?.project_ids && metadataAny?.project_names) {
                    const idIndex = metadataAny.project_ids.indexOf(actualPropertyIdToSchedule);
                    if (idIndex !== -1) propertyNameForScheduling = metadataAny.project_names[idIndex];
                }
            }
            console.log(`[initiateScheduling] No P_id_arg, using active project. ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
        }

        // Fallback to the first project if no specific context could be determined
        if (!actualPropertyIdToSchedule && !propertyNameForScheduling && metadata?.project_ids && metadata.project_ids.length > 0) {
            actualPropertyIdToSchedule = metadata.project_ids[0];
            if (metadata?.project_names && metadata.project_names.length > 0) {
                propertyNameForScheduling = metadata.project_names[0];
            } else if (metadataAny?.project_id_map) {
                 for (const nameInMap in metadataAny.project_id_map) {
                    if (metadataAny.project_id_map[nameInMap] === actualPropertyIdToSchedule) {
                        propertyNameForScheduling = nameInMap;
                        break;
                    }
                }
            }
            console.log(`[initiateScheduling] No specific context, falling back to first project. ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
        }
        
        // Final consolidation: If ID is known but name isn't, or vice-versa, try one last time to sync them.
        if (actualPropertyIdToSchedule && !propertyNameForScheduling) {
            if (metadataAny?.project_id_map) {
                for (const nameInMap in metadataAny.project_id_map) {
                    if (metadataAny.project_id_map[nameInMap] === actualPropertyIdToSchedule) {
                        propertyNameForScheduling = nameInMap;
                        break;
                    }
                }
            }
            if (!propertyNameForScheduling && metadataAny?.project_ids && metadataAny?.project_names) {
                 const idx = metadataAny.project_ids.indexOf(actualPropertyIdToSchedule);
                 if (idx !== -1) propertyNameForScheduling = metadataAny.project_names[idx];
            }
            console.log(`[initiateScheduling] (Final Name Lookup) ID: '${actualPropertyIdToSchedule}', Determined Name: '${propertyNameForScheduling || 'unknown'}'.`);
        } else if (!actualPropertyIdToSchedule && propertyNameForScheduling) {
             if (metadataAny?.project_id_map && metadataAny.project_id_map[propertyNameForScheduling]) {
                actualPropertyIdToSchedule = metadataAny.project_id_map[propertyNameForScheduling];
             } else if (metadataAny?.project_names && metadataAny?.project_ids) {
                const nameIdx = metadataAny.project_names.indexOf(propertyNameForScheduling);
                if (nameIdx !== -1) actualPropertyIdToSchedule = metadataAny.project_ids[nameIdx];
             }
            console.log(`[initiateScheduling] (Final ID Lookup) Name: '${propertyNameForScheduling}', Determined ID: '${actualPropertyIdToSchedule || 'unknown'}'.`);
        }
        
        propertyNameForScheduling = propertyNameForScheduling || "the selected property";
        
        console.log(`[initiateScheduling] Transferring to scheduleMeeting agent with Property ID: '${actualPropertyIdToSchedule || 'undefined'}', Property Name: '${propertyNameForScheduling}'`);
        
        return {
            destination_agent: "scheduleMeeting",
            property_id_to_schedule: actualPropertyIdToSchedule, 
            property_name: propertyNameForScheduling, 
            silentTransfer: true,
            message: null 
        };
    },

    lookupProperty: async ({ query, k = 3 }: { query: string; k?: number }, transcript: TranscriptItem[] = []) => {
        console.log(`[lookupProperty] Querying edge function: "${query}", k=${k}`);
        const metadata = realEstateAgent.metadata;
        const project_ids_for_filter = metadata?.project_ids || []; // For filtering in vector search

        if (!supabaseAnonKey) {
            return { error: "Server configuration error.", ui_display_hint: 'CHAT', message: "Server error during lookup." };
        }

        try {
            const response = await fetch(
                toolsEdgeFunctionUrl,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${supabaseAnonKey}`,
                    },
                    body: JSON.stringify({
                        action: "lookupProperty",
                        query,
                        k,
                        project_ids: project_ids_for_filter, // Pass current project_ids for context/filtering
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || result.error) {
                console.error("[lookupProperty] Edge function error:", result.error || response.statusText);
                return {
                  error: result.error || "Error looking up property.",
                  ui_display_hint: 'CHAT',
                  message: result.error ? `Lookup failed: ${result.error}` : "Could not find properties."
                };
            }

            console.log("[lookupProperty] Received raw property results:", result);

            if (result.properties && Array.isArray(result.properties) && result.properties.length > 0) {
                // Keep CHAT hint, provide results for agent summary
                return {
                    search_results: result.properties, 
                    message: result.message || `Regarding "${query}", I found information about ${result.properties.length} item(s).`,
                    ui_display_hint: 'CHAT',
                };
            } else {
                 return { message: result.message || "I couldn't find specific details matching that query.", ui_display_hint: 'CHAT' };
            }

        } catch (error: any) {
            console.error("[lookupProperty] Exception calling edge function:", error);
            return { 
              error: `Exception looking up property: ${error.message}`,
              ui_display_hint: 'CHAT',
              message: "An error occurred during property lookup."
            };
        }
    },

    calculateRoute: async (args: any) => {
        // ... fetch route from Google Maps API ...
        // Assuming result is stored in routeSummary
        return {
            routeSummary: "Driving directions: ...", // The actual summary
            ui_display_hint: 'CHAT', // <<< Display result in chat
            message: "Here are the driving directions:" // Agent's intro text
        };
    },
    findNearestPlace: async (args: any) => {
        // ... fetch nearest place from Google Maps API ...
        // Assuming result is stored in placeInfo
        return {
            placeInfo: "The nearest park is Central Park, 0.5 miles away.", // The actual result
            ui_display_hint: 'CHAT', // <<< Display result in chat
            message: "Regarding the nearest place:" // Agent's intro text
        };
    },
    
    // Mock implementation of completeScheduling for when transitioning from verification
    completeScheduling: async () => {
        console.log("[realEstateAgent.completeScheduling] Handling post-verification scheduling confirmation");
        
        const metadata = realEstateAgent.metadata as any;
        
        // Log all relevant scheduling data for debugging
        console.log("[realEstateAgent.completeScheduling] Available scheduling data:", {
            selectedDate: metadata?.selectedDate,
            selectedTime: metadata?.selectedTime,
            appointment_date: metadata?.appointment_date, // Check for alternative field names
            appointment_time: metadata?.appointment_time,
            appointment_id: metadata?.appointment_id,
            customer_name: metadata?.customer_name,
            property_name: metadata?.property_name,
            property_id_to_schedule: metadata?.property_id_to_schedule
        });
        
        // Get date and time - check both field name variations
        const dateToUse = metadata?.selectedDate || metadata?.appointment_date;
        const timeToUse = metadata?.selectedTime || metadata?.appointment_time;
        
        // Check if we have scheduling data
        if ((dateToUse || timeToUse) && metadata?.customer_name) {
            // Make sure we have a property name (use defaults if not available)
            const propertyName = metadata.property_name || "the property";
            
            // Create a friendly confirmation message
            const confirmationMsg = `Great news, ${metadata.customer_name}! Your visit to ${propertyName} on ${dateToUse} at ${timeToUse} is confirmed! You'll receive all details shortly.`;
            console.log("[realEstateAgent.completeScheduling] Confirming schedule with: ", confirmationMsg);
            
            // Mark as scheduled in agent metadata
            if (realEstateAgent.metadata) {
                realEstateAgent.metadata.has_scheduled = true;
                realEstateAgent.metadata.is_verified = true;
                
                // Clear flow context to prevent re-processing
                delete (realEstateAgent.metadata as any).flow_context;
                // Store actual date and time in standard fields for consistency
                if (dateToUse && !metadata.selectedDate) {
                    (realEstateAgent.metadata as any).selectedDate = dateToUse;
                }
                if (timeToUse && !metadata.selectedTime) {
                    (realEstateAgent.metadata as any).selectedTime = timeToUse;
                }
            }
            
            // Make API calls to notify about the scheduled visit
            try {
                // Prepare data for whatsapp-notifier API
                const notifierData = {
                    org_id: metadata.org_id || "",
                    builder_name: metadata.org_name || "Property Developer",
                    lead_name: metadata.customer_name || "",
                    phone: metadata.phone_number?.replace("+", "") || ""
                };
                
                console.log("[realEstateAgent.completeScheduling] Sending whatsapp notification with data:", notifierData);
                
                // First API call - whatsapp-notifier
                fetch("https://dsakezvdiwmoobugchgu.functions.supabase.co/whatsapp-notifier", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzYWtlenZkaXdtb29idWdjaGd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTI5Mjc4NiwiZXhwIjoyMDQwODY4Nzg2fQ.CYPKYDqOuOtU7V9QhZ-U21C1fvuGZ-swUEm8beWc_X0'
                    },
                    body: JSON.stringify(notifierData)
                })
                .then(response => response.json())
                .then(data => {
                    console.log("[realEstateAgent.completeScheduling] Whatsapp notifier API response:", data);
                })
                .catch(error => {
                    console.error("[realEstateAgent.completeScheduling] Whatsapp notifier API error:", error);
                });
                
                // Prepare data for schedule-visit-whatsapp API
                const scheduleData = {
                    customerName: metadata.customer_name || "",
                    phoneNumber: metadata.phone_number?.startsWith("+") ? metadata.phone_number.substring(1) : metadata.phone_number || "",
                    propertyId: metadata.property_id_to_schedule || "",
                    visitDateTime: `${dateToUse}, ${timeToUse}`,
                    chatbotId: metadata.chatbot_id || ""
                };
                
                console.log("[realEstateAgent.completeScheduling] Sending schedule visit notification with data:", scheduleData);
                
                // Second API call - schedule-visit-whatsapp
                fetch("https://dsakezvdiwmoobugchgu.supabase.co/functions/v1/schedule-visit-whatsapp", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzYWtlenZkaXdtb29idWdjaGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjUyOTI3ODYsImV4cCI6MjA0MDg2ODc4Nn0.11GJjOlgPf4RocdFjMnWGJpBqFVk1wmbW27OmV0YAzs'
                    },
                    body: JSON.stringify(scheduleData)
                })
                .then(response => response.json())
                .then(data => {
                    console.log("[realEstateAgent.completeScheduling] Schedule visit API response:", data);
                })
                .catch(error => {
                    console.error("[realEstateAgent.completeScheduling] Schedule visit API error:", error);
                });
            } catch (error) {
                console.error("[realEstateAgent.completeScheduling] Error making API calls:", error);
            }
            
            // Return success with confirmation message
            return {
                success: true,
                message: null, // << Agent should not speak; message is on the card
                ui_display_hint: 'BOOKING_CONFIRMATION', // New UI hint for the booking card
                booking_details: {
                    customerName: metadata.customer_name,
                    propertyName: propertyName,
                    date: dateToUse,
                    time: timeToUse,
                    phoneNumber: metadata.phone_number
                }
            };
        } else {
            // Handle missing data case
            console.error("[realEstateAgent.completeScheduling] Missing required scheduling data", {
                selectedDate: metadata?.selectedDate,
                appointment_date: metadata?.appointment_date,
                selectedTime: metadata?.selectedTime,
                appointment_time: metadata?.appointment_time,
                customer_name: metadata?.customer_name
            });
            
            // Also clear scheduling specifics in the error/missing data case
            if (realEstateAgent.metadata) {
                delete (realEstateAgent.metadata as any).flow_context; // Ensure flow_context is cleared
                (realEstateAgent.metadata as AgentMetadata).selectedDate = undefined;
                (realEstateAgent.metadata as AgentMetadata).selectedTime = undefined;
            }
            // Return a generic message if we can't find the specific details
            const genericMsg = "Your booking has been confirmed. Thank you!";
            return {
                success: true,
                message: genericMsg,
                ui_display_hint: 'CHAT'
            };
        }
    }
  },
};

// Re-apply instructions after definition
realEstateAgent.instructions = getInstructions(realEstateAgent.metadata);

export default realEstateAgent; 