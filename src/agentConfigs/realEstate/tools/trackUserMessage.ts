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
    let is_verified = metadata?.is_verified ?? false;
    const questionCount = metadata.user_question_count;
    
    console.log(`🔍 [QuestionCounter] Status - Q#: ${questionCount}, Verified: ${is_verified}, Message: "${userMessage.substring(0, 50)}..."`);
    
    // CRITICAL DEBUG: Check why user might be verified when they shouldn't be
    if (is_verified) {
        console.log("🚨🚨🚨 [QuestionCounter] User is VERIFIED, authentication check skipped");
        console.log("🚨🚨🚨 [QuestionCounter] Full verification details:", {
            is_verified,
            customer_name: metadata?.customer_name,
            phone_number: metadata?.phone_number,
            verification_timestamp: (metadata as any)?.verification_timestamp || 'not set'
        });
        
        // TEMPORARY DEBUG: Check if this might be from a previous session
        // If the user has a name and phone but this is a new conversation, maybe reset verification
        const hasNameAndPhone = metadata?.customer_name && metadata?.phone_number;
        const questionCountLow = questionCount <= 2;
        
        if (hasNameAndPhone && questionCountLow) {
            console.log("🚨🚨🚨 [QuestionCounter] Suspicious: User verified with name/phone but low question count");
            console.log("🚨🚨🚨 [QuestionCounter] This might be from a previous session - should we reset verification?");
            
            // TEMPORARY DEBUG: For testing, let's see what happens if we reset verification
            // TODO: Remove this after debugging
            metadata.is_verified = false;
            console.log("🚨🚨🚨 [DEBUG] TEMPORARILY RESET is_verified to false for testing");
        }
    }
    
    // AUTHENTICATION TRIGGER: After 2 questions without verification
    // CRITICAL FIX: Only trigger if user is NOT verified
    if (!is_verified && questionCount >= 4) {
        console.log("[QuestionCounter] 🚨 AUTHENTICATION REQUIRED - User not verified after 2+ questions");
        
        // Store the current question for later
        metadata.pending_question = userMessage;
        metadata.flow_context = 'from_question_auth';
        
        // Reset question count after triggering auth
        // metadata.user_question_count = 0;
        
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
    
    // CRITICAL: Handle pending scheduling question from useHandleServerEvent
    if (message === 'initiateScheduling: schedule visit' || message.includes('initiateScheduling')) {
        console.log("🔍 [trackUserMessage] Detected pending scheduling question - triggering scheduling flow");
        return {
            success: true,
            trigger_scheduling: true,
            message: "I'll help you schedule a visit. Let me get the available time slots for you."
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
    } else if (metadata?.flow_context === 'from_scheduling_verification') {
        console.log("🚨🚨🚨 [trackUserMessage] Handling 'from_scheduling_verification' context - CALLING completeScheduling");
        if (realEstateAgent.metadata) {
            delete (realEstateAgent.metadata as any).flow_context; 
        }
        
        console.log("🚨🚨🚨 [trackUserMessage] Scheduling data in metadata:", {
            selectedDate: (metadata as any)?.selectedDate,
            selectedTime: (metadata as any)?.selectedTime,
            customer_name: metadata?.customer_name,
            property_name: (metadata as any)?.property_name
        });
        
        // Directly return function_call to trigger completeScheduling
        return {
            function_call: {
                name: "completeScheduling",
                arguments: JSON.stringify({}) 
            }
        };
    } else if (metadata?.flow_context === 'from_direct_auth') {
        // REMOVED: This was incorrectly triggering booking confirmation for all questions after auth
        // This should only happen for actual completed bookings, not general questions
        console.log("[trackUserMessage] from_direct_auth context detected - but this should only be for actual bookings");
        console.log("[trackUserMessage] Clearing flow_context and continuing with normal processing");
        
        if (realEstateAgent.metadata) {
            realEstateAgent.metadata.is_verified = true;
            delete (realEstateAgent.metadata as any).flow_context;
        }
        
        // Continue to normal processing instead of returning booking confirmation
        // return normal success - let the question be processed normally
    } else if (metadata?.flow_context === 'from_question_auth') {
        // CRITICAL: This can be in two scenarios:
        // 1. User just transferred TO auth agent (not verified yet)
        // 2. User just returned FROM auth agent (successfully verified)
        
        const is_verified = metadata?.is_verified ?? false;
        
        if (is_verified) {
            // Scenario 2: User successfully completed verification and returned
            console.log("[trackUserMessage] Handling 'from_question_auth' context - user SUCCESSFULLY verified, answering pending question");
            
            // Get the pending question
            const pendingQuestion = metadata.pending_question;
            
            if (realEstateAgent.metadata) {
                // Clear flow context and pending question since we're handling it now
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
        } else {
            // Scenario 1: User just transferred to auth agent (not verified yet)
            console.log("[trackUserMessage] Handling 'from_question_auth' context - user is in authentication flow, NOT verified yet");
            
            // Simply return success and let the authentication agent handle the flow
            return {
                success: true,
                message: "User is in authentication flow",
                in_auth_flow: true
            };
        }
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
    
   

    if (is_verified && !has_scheduled && questionCount >= 12) {
       console.log("[trackUserMessage] Asking user about scheduling visit.");
       // Reset question count
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