import { AgentMetadata as BaseAgentMetadata } from "@/types/types";

// Extended interface for real estate agent
interface AgentMetadata extends BaseAgentMetadata {
  project_id_map?: Record<string, string>;
  active_project_id?: string;
  selectedDate?: string;
  selectedTime?: string;
  property_name?: string;
  flow_context?: 'from_full_scheduling' | 'from_direct_auth' | 'from_scheduling_verification' | 'from_question_auth';
  // New field for storing pending question after auth flow
  pending_question?: string;
  // CRITICAL: Store question count in metadata for reliability
  user_question_count?: number;
}

// Centralized function to increment question count and check authentication
const incrementQuestionCountAndCheckAuth = (realEstateAgent: any, userMessage: string) => {
    const metadata = realEstateAgent.metadata as AgentMetadata;
    
    // Initialize question count if not present
    if (!metadata.user_question_count) {
        metadata.user_question_count = 0;
    }
    
    // Increment question count for all user messages (except triggers)
    if (!userMessage.startsWith('{Trigger msg:') && userMessage !== 'TRIGGER_BOOKING_CONFIRMATION') {
        metadata.user_question_count++;
        console.log(`🔍 [QuestionCounter] Incremented question count to: ${metadata.user_question_count}`);
    }
    
    // Check if authentication is needed
    const is_verified = metadata?.is_verified ?? false;
    const questionCount = metadata.user_question_count;
    
    console.log(`🔍 [QuestionCounter] Status - Q#: ${questionCount}, Verified: ${is_verified}, Message: "${userMessage.substring(0, 50)}..."`);
    
    // AUTHENTICATION TRIGGER: After 2 questions without verification
    if (!is_verified && questionCount >= 4) {
        console.log("[QuestionCounter] 🚨 AUTHENTICATION REQUIRED - User not verified after 2+ questions");
        
        // Store the current question for later
        metadata.pending_question = userMessage;
        metadata.flow_context = 'from_question_auth';
        
        // Reset question count after triggering auth
        metadata.user_question_count = 0;
        
        return {
            needs_authentication: true,
            destination_agent: "authentication",
            flow_context: 'from_question_auth',
            came_from: "realEstate",
            pending_question: userMessage,
            silentTransfer: true
        };
    }
    
    return { needs_authentication: false };
};

// Export the centralized function for use in other tools
export { incrementQuestionCountAndCheckAuth };

export const trackUserMessage = async ({ message }: { message: string }, realEstateAgent: any) => {
    console.log("🔍 [trackUserMessage] ENTRY - Received message:", message);
    
    const metadata = realEstateAgent.metadata as AgentMetadata;
    
    // Check for special trigger messages 
    if (message.startsWith('{Trigger msg:')) {
        console.log("🔍 [trackUserMessage] Detected special trigger message:", message);
        return { 
            success: true, 
            is_trigger_message: true, // Let LLM know it's a trigger
        };
    }
    
    // CRITICAL CHECK: Log if we receive TRIGGER_BOOKING_CONFIRMATION
    if (message === 'TRIGGER_BOOKING_CONFIRMATION') {
        console.log("🚨🚨🚨 [trackUserMessage] RECEIVED TRIGGER_BOOKING_CONFIRMATION - This should NOT be processed by trackUserMessage!");
        console.log("🚨🚨🚨 [trackUserMessage] According to instructions, agent should call completeScheduling directly!");
        console.log("🚨🚨🚨 [trackUserMessage] Current metadata state:", {
            selectedDate: (metadata as any)?.selectedDate,
            selectedTime: (metadata as any)?.selectedTime,
            customer_name: metadata?.customer_name,
            property_name: (metadata as any)?.property_name,
            flow_context: (metadata as any)?.flow_context
        });
        
        // Return early - this message should NOT be processed by trackUserMessage
        return {
            success: false,
            error: "TRIGGER_BOOKING_CONFIRMATION should be handled by completeScheduling tool, not trackUserMessage",
            message: "Agent should call completeScheduling for this trigger"
        };
    }
    
    // PRIORITY 1: Handle specific flow contexts first
    if (metadata?.flow_context === 'from_full_scheduling') {
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
    } else if (metadata?.flow_context === 'from_question_auth') {
        console.log("[trackUserMessage] Handling 'from_question_auth' context - user verified, answering pending question");
        
        // Get the pending question
        const pendingQuestion = metadata.pending_question;
        
        if (realEstateAgent.metadata) {
            // Mark user as verified and clear flow context
            realEstateAgent.metadata.is_verified = true;
            delete (realEstateAgent.metadata as any).flow_context;
            delete (realEstateAgent.metadata as any).pending_question;
        }
        
        // Return success with instructions to answer the pending question
        return {
            success: true,
            answer_pending_question: true,
            pending_question: pendingQuestion,
            message: `Great! You're now verified. Let me answer your question: "${pendingQuestion}"`
        };
    }
    // END OF PRIORITY FLOW CONTEXT HANDLING

    console.log("🔍 [trackUserMessage] Processing regular message:", message);
    console.log("🔍 [trackUserMessage] Current metadata verification status:", {
        is_verified: metadata?.is_verified,
        has_scheduled: metadata?.has_scheduled,
        user_question_count: metadata?.user_question_count || 0
    });

    // Use centralized question counting and authentication check
    const authCheck = incrementQuestionCountAndCheckAuth(realEstateAgent, message);
    
    if (authCheck.needs_authentication) {
        console.log("[trackUserMessage] 🚨 Authentication required - transferring to authentication agent");
        return {
            destination_agent: authCheck.destination_agent,
            flow_context: authCheck.flow_context,
            came_from: authCheck.came_from,
            pending_question: authCheck.pending_question,
            message: null,
            silentTransfer: authCheck.silentTransfer
        };
    }

    const is_verified = metadata?.is_verified ?? false;
    const has_scheduled = metadata?.has_scheduled ?? false;

    // Check ONLY for UI button scheduling messages - let LLM handle natural language scheduling detection
    // The LLM is much better at understanding nuanced scheduling requests than regex patterns
    // EXCLUDE booking confirmation triggers as the LLM handles those based on its instructions.
    if (message !== "Show the booking confirmation page" && message !== "TRIGGER_BOOKING_CONFIRMATION") {
        const scheduleRegex = /^Yes, I'd like to schedule a visit for (.+?)[.!]?$/i;
        const scheduleRequestFromUiButton = message.startsWith("Yes, I'd like to schedule a visit for");

        if (scheduleRequestFromUiButton) {
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
            console.log(`[trackUserMessage] Current metadata state for debugging:`, {
                active_project: metadata?.active_project,
                active_project_id: metadataAny?.active_project_id,
                determined_property_name: propertyName,
                determined_property_id: propertyIdToSchedule
            });

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

    // Legacy fallback for old authentication triggers (keeping for compatibility)
    const questionCount = metadata?.user_question_count || 0;
    
    if (!is_verified && questionCount >= 7) {
      console.log("[trackUserMessage] User not verified after 7 questions, transferring to authentication");
      // Reset question count
      metadata.user_question_count = 0;
      return { destination_agent: "authentication" };
    }

    if (is_verified && !has_scheduled && questionCount >= 12) {
       console.log("[trackUserMessage] Asking user about scheduling visit.");
       // Reset question count
       metadata.user_question_count = 0;
       return { 
         askToSchedule: true, 
         message: "Would you like to schedule a visit to see a property in person?" 
       };
    }

    console.log("🔍 [trackUserMessage] Returning success for regular message processing");
    return { 
        success: true, 
        questionCount: metadata?.user_question_count || 0,
        message_processed_by_trackUserMessage: true 
    }; 
}; 