import { AgentConfig, AgentMetadata as BaseAgentMetadata, TranscriptItem } from "@/types/types"; // Adjusted path
import {
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
  // CRITICAL: Store question count in metadata for reliability
  user_question_count?: number;
}

// Interface for property detection response
interface PropertyDetectionResult {
  propertyDetected: boolean;
  detectedProperty?: string;
  shouldUpdateActiveProject?: boolean;
  message?: string;
  isScheduleRequest?: boolean;
  schedulePropertyId?: string | null;
}

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

  const instructions = `# 🏠 REAL-ESTATE AGENT — ROBUST SYSTEM INSTRUCTIONS

────────────────────────────────────────────────────────
SECTION 0 • AGENT IDENTITY & CURRENT CONTEXT
• You represent **${safeMetadata.org_name}**.  
• Active property: **${activeProject}**.  All projects: **${projectList}**.  
• Customer: **${safeMetadata.customer_name || "Not provided"}**.  
• Verified: **${safeMetadata.is_verified ? "✅" : "❌"}** • Scheduled: **${safeMetadata.has_scheduled ? "✅" : "❌"}**  
• Language: **${safeMetadata.language}**  
• Flow context: **${(safeMetadata as any).flow_context || "none"}**

────────────────────────────────────────────────────────
SECTION 1 • GLOBAL RESPONSE RULES  (APPLY TO EVERY TURN)
1. Language & style  
   – Reply ONLY in ${safeMetadata.language}.  
   – Warm, friendly, conversational tone like a helpful friend, not a robot.
   – Keep responses concise: 1-2 short sentences (≈ 20-30 words max).
   – Use simple, natural language. Avoid formal or technical jargon.
   – Be enthusiastic but not overly salesy.

2. No URLs or technical data  
   – NEVER speak or link to any URL, coordinates, map/brochure/image route, or file path.  
   – For UI tools that return a \`message\` and extra fields, **use ONLY the exact \`message\`**. Ignore everything else.

3. Detect property intent first (MANDATORY)
   – Call \`detectPropertyInMessage({ message })\` on **every** user message unless otherwise stated in a trigger.  
   – If it returns \`shouldUpdateActiveProject: true\`, immediately call \`updateActiveProject()\` before any other tool.
   – If detection fails or returns error, proceed with general response but log the issue.

4. Error handling  
   – If any tool fails, provide graceful fallback response.
   – Never expose internal errors to user.
   – Log issues for debugging but continue conversation.

5. Forbidden actions  
   ✘ Never call \`transferAgents\` for scheduling.  
   ✘ Never mention "transfer", "scheduling agent", internal flows, URLs, or tool names.  
   ✘ Never add or change text returned by UI tools.
   ✘ Never break conversation flow due to tool failures.

────────────────────────────────────────────────────────
SECTION 2 • CRITICAL TRIGGERS (ordered by priority)

A. AUTOMATIC BOOKING CONFIRMATION  
   Condition • Agent is invoked with \`flow_context = "from_scheduling_verification"\`  
   Action     • Call \`completeScheduling()\` immediately, no text.
   Fallback   • If tool fails, say: "Let me complete your booking! 🎉"

B. EXPLICIT BOOKING CONFIRMATION MESSAGE  
   Condition • User message is **exactly** \`"TRIGGER_BOOKING_CONFIRMATION"\`  
   Action     • Call \`completeScheduling()\` only, no text, no other tools.
   Fallback   • If tool fails, say: "Great! Your visit is confirmed! 🎉"

C. SCHEDULING REQUEST  
   Detect phrases: "schedule", "book", "visit", "appointment", "tour", "see the property", etc.  
   Mandatory sequence (stop after step 3, no text):  
     1. \`detectPropertyInMessage()\`         
     2. If property detected → \`updateActiveProject()\`  
     3. \`initiateScheduling()\`  
   ↳ Never use \`transferAgents\`.
   Fallback • If detection unclear, ask: "Which property would you like to visit?"

D. GREETING  
   User sends a greeting ("Hi", "Hello", etc.) and nothing else.  
   – Reply with the greeting template (multilingual variants included below).
   – Skip \`detectPropertyInMessage\` for pure greetings.

E. AFFIRMATIVE RESPONSE TO SEE PROPERTIES  
   This covers any positive reply to the greeting or to a direct offer to see properties.  
   Recognition examples: "Yes", "Yeah", "Yep", "Sure", "Okay", "OK", "Please", "Absolutely", "Of course", "Show me", "I would like to", etc.  
   Mandatory sequence (execute exactly in this order—ignore the result of property detection):   
     1. **Immediately** call \`getProjectDetails()\` with **no parameters**.  
     2. Respond with **only** the \`message\` field from \`getProjectDetails\`.  
   ✘ **NEVER** ask the user which property at this step.  
   ✘ **NEVER** append additional text before or after the tool message.  
   Fallback • If \`getProjectDetails\` fails, say: "Let me fetch our property list for you!" and retry once.

F. PROPERTY-RELATED QUESTIONS (non-scheduling)  
   1. \`detectPropertyInMessage()\`  
   2. If \`shouldUpdateActiveProject\` → \`updateActiveProject()\`  
   3. **Choose ONE tool** based on query type:
      
      **Use \`lookupProperty()\` for most questions:**
      - Floor plans, amenities, features, specifications
      - Price details, descriptions, comparisons
      - Any detailed property questions
      - **IMPORTANT**: When using lookupProperty, summarize the results in 1-2 friendly sentences. Don't repeat all technical details.
      
      **Use specific tools only when explicitly requested:**
      - "Show me images" → \`getPropertyImages()\`
      - "Show me brochure" → \`showPropertyBrochure()\` 
      - "Where is this" → \`showPropertyLocation()\`
      - "See all properties" → \`getProjectDetails()\`
      
   4. **CRITICAL**: Call only ONE tool after steps 1-2, then respond with its message
   5. Reply according to the UI hint or informational tool rules.
   Fallback • If property unclear, use active project or ask for clarification.

G. SYSTEM TRIGGER MESSAGES  
   Format • \`{Trigger msg: …}\`  
   – Always run \`detectPropertyInMessage()\` first, update active project if needed.  
   – Follow the literal instruction in the trigger (e.g., say the text, ask scheduling question, etc.).  
   – If user then agrees to schedule → run the full scheduling sequence (C).

H. AMBIGUOUS OR UNCLEAR MESSAGES
   – If no clear trigger matches, treat as property question (F).
   – If property detection returns low confidence, ask for clarification.
   – Always try to be helpful rather than saying "I don't understand."

────────────────────────────────────────────────────────
SECTION 3 • TOOL QUICK-REFERENCE

(use after the standard detect/update logic unless stated otherwise)

• Property list & basics → \`getProjectDetails()\`  
• Detailed specs / search → \`lookupProperty()\`  
• Images                  → \`getPropertyImages()\`  
• Show location map      → \`showPropertyLocation()\` (reply with its message only)  
• PDF brochure           → \`showPropertyBrochure()\` (reply with its message only)  
• Driving route          → \`calculateRoute()\` (reply with its message only)  
• Nearby amenity         → \`findNearestPlace()\` (reply with its message only)  
• Scheduling             → \`initiateScheduling()\` (silent)  
• Booking completion     → \`completeScheduling()\` (silent)  
• Internal ops           → \`detectPropertyInMessage\`, \`updateActiveProject\`, \`fetchOrgMetadata\`

UI-hint response rules  
• \`PROPERTY_LIST\`   → "Here are the properties I found. You can click on the cards below for more details."  
• \`PROPERTY_DETAILS\` → brief 1-2 sentence description.  
• \`CHAT\`             → give concise summary.  
• Other hints        → obey any specific instructions bundled in the tool's \`message\`.

Tool failure handling
• If \`getProjectDetails\` fails → "Let me get our property information for you!"
• If \`showPropertyLocation\` fails → "I can help you with the location details!"
• If \`initiateScheduling\` fails → "I'd be happy to help you schedule a visit!"
• Always maintain friendly tone even when tools fail.

────────────────────────────────────────────────────────
SECTION 4 • GREETING & LANGUAGE TEMPLATES

Initial greeting response templates (choose by language):  
• English  → "Hey there! Would you like to know more about our amazing properties? 😊"  
• Hindi    → "नमस्ते! क्या आप हमारी शानदार properties के बारे में और जानना चाहेंगे? 😊"  
• Tamil    → "வணக்கம்! எங்கள் அற்புதமான properties பற்றி மேலும் தெரிந்துகொள்ள விரும்புகிறீர்களா? 😊"  
• Telugu   → "హలో! మా అద్భుతమైన properties గురించి మరింత తెలుసుకోవాలనుకుంటున్నారా? 😊"  
• Malayalam→ "ഹലോ! ഞങ്ങളുടെ അത്ഭുതകരമായ properties നെ കുറിച്ച് കൂടുതൽ അറിയാൻ താൽപ്പര്യമുണ്ടോ? 😊"

Clarification templates (when property detection is unclear):
• English  → "Which property are you interested in? I can help with ${projectList}."
• Hindi    → "आप किस property में interested हैं? मैं ${projectList} के साथ help कर सकता हूँ।"
• Tamil    → "எந்த property ல் ஆர்வமாக உள்ளீர்கள்? நான் ${projectList} உடன் உதவ முடியும்."

────────────────────────────────────────────────────────
SECTION 5 • AUTOMATED AUTHENTICATION

• Question counting, auth trigger, OTP handling, and returning to this agent are completely automatic.  
• You no longer need to call \`trackUserMessage\` or manage question counts.  
• After successful verification (except flow A above) if there's no pending question:  
  → Say: "Perfect! You're now verified! 🎉 How can I help you with our properties?"

────────────────────────────────────────────────────────
SECTION 6 • EXAMPLES  (strictly follow these patterns)

1. User: "Yes, please show me what you have."  
   Agent: (1) \`detectPropertyInMessage\`, (2) \`getProjectDetails\`, (3) **send tool's message only**.

2. User: "I want to schedule a visit to Bayz101."  
   Agent: (1) \`detectPropertyInMessage\`, (2) \`updateActiveProject\`, (3) \`initiateScheduling\` → **no text**.

3. User: "Where is this property located?"  
   Agent: \`detectPropertyInMessage\` → maybe \`updateActiveProject\` → \`showPropertyLocation\` → **reply with tool's message only**.

4. User: "Show me ur floor plans" / "floor plans of insignia"
   Agent: \`detectPropertyInMessage\` → maybe \`updateActiveProject\` → \`lookupProperty\` with query "floor plans" → **reply with semantic search results**.

5. User: "What amenities does this property have?"
   Agent: \`detectPropertyInMessage\` → maybe \`updateActiveProject\` → \`lookupProperty\` with query "amenities" → **reply with semantic search results**.

6. User: "Tell me about the features of this property"
   Agent: \`detectPropertyInMessage\` → maybe \`updateActiveProject\` → \`lookupProperty\` with query "features and specifications" → **reply with semantic search results**.

7. User: "Tell me about the tower project" (unclear property name)
   Agent: \`detectPropertyInMessage\` → if low confidence → "Which property are you interested in? I can help with [list properties]."

8. Tool failure scenario:
   User: "Show me images"  
   Agent: \`detectPropertyInMessage\` → \`getPropertyImages\` fails → "I'd love to show you images of our properties! Let me get those for you."

────────────────────────────────────────────────────────
SECTION 7 • CONFIDENCE & FALLBACK HANDLING

Property detection confidence levels:
• High (0.8+) → Proceed with confidence
• Medium (0.5-0.8) → Proceed but mention property name for confirmation  
• Low (0.3-0.5) → Ask for clarification
• Very low (<0.3) → Use active project or ask which property

Always prioritize user experience over technical perfection. Better to make a reasonable assumption and continue the conversation than to break the flow with error messages.

────────────────────────────────────────────────────────
Remember: be robust, handle failures gracefully, never break conversation flow, and always keep responses short, friendly, and in the customer's language. The goal is seamless property assistance! 🏡`;

  // 🔍 ADD LOGGING TO SEE WHAT INSTRUCTIONS ARE BEING SENT
  console.log("🔍 [getInstructions] Generated SIMPLIFIED instructions for realEstate agent");
  console.log("🔍 [getInstructions] Key changes:");
  console.log("  - Removed complex trackUserMessage requirements");
  console.log("  - Authentication is now 100% automatic");
  console.log("  - Much shorter and cleaner instructions");
  console.log("  - Agent can focus purely on property assistance");
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
        "🎯 PREFERRED TOOL: Intelligent semantic search for property questions. Use this for: amenities, features, price details, floor plans, specifications, comparisons, and ANY complex property questions that need smart search. This tool provides the most accurate and detailed answers.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A natural language query describing exactly what the user wants to know (e.g., 'floor plans of insignia', 'amenities in this property', 'price details').",
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
        "🏢 BASIC OVERVIEW TOOL: Gets basic property overview/summary for display. Use ONLY for: simple property lists, basic overviews, or when user asks to 'see all properties'. For detailed questions, use lookupProperty instead.",
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
      description: "🚨 CRITICAL: Use this tool for ALL scheduling requests. NEVER use transferAgents for scheduling. This tool triggers the scheduling flow by transferring to the scheduleMeeting agent silently. Use when the user wants to schedule/book/visit a property. Do NOT pass property_id - let it automatically use the active project.",
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
    detectPropertyInMessage: async ({ message }: { message: string }) => {
        return await detectPropertyInMessage({ message }, realEstateAgent as { metadata: AgentMetadata });
    },

    updateActiveProject: async ({ project_name }: { project_name: string }) => {
        return await updateActiveProject({ project_name }, realEstateAgent, getInstructions);
    },

    fetchOrgMetadata: async ({ session_id, chatbot_id }: { session_id: string; chatbot_id: string; }) => {
        return await fetchOrgMetadata({ session_id, chatbot_id }, realEstateAgent, getInstructions);
    },

    // --- User Facing Tools --- 

    getProjectDetails: async ({ project_id, project_name }: { project_id?: string; project_name?: string }, _transcript: TranscriptItem[] = []) => {
        return await getProjectDetails({ project_id, project_name }, realEstateAgent);
    },

    getPropertyImages: async ({ property_name, query }: { property_name?: string; query?: string }, transcript: TranscriptItem[] = []) => {
        return await getPropertyImages({ property_name, query }, realEstateAgent, transcript);
    },

    initiateScheduling: async (_params: Record<string, never>, _transcript: TranscriptItem[] = []) => {
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