import { AgentConfig } from "@/types/types";

// Mock tools from other agents to prevent "tool not found" if LLM miscalls
export const trackUserMessage = async ({ message }: { message: string }, agent: AgentConfig) => {
  console.log("🚨🚨🚨 [AUTH AGENT ERROR] trackUserMessage called by authentication agent - THIS SHOULD NOT HAPPEN!");
  console.log("[Authentication] Message that triggered trackUserMessage:", message);
  console.log("[Authentication] Agent name:", agent.name);
  console.log("[Authentication] Agent instructions preview:", agent.instructions?.substring(0, 200) + "...");
  
  return { 
    success: true, 
    message: "Authentication agent incorrectly called trackUserMessage", 
    ui_display_hint: 'VERIFICATION_FORM',  // Keep verification form active
    error: "Authentication agent should not call trackUserMessage"
  };
};

export const detectPropertyInMessage = async ({ message }: { message: string }, agent: AgentConfig) => {
  console.log("[Authentication] Received detectPropertyInMessage call (ignoring):", message);
  return { 
    propertyDetected: false, 
    message: "Authentication agent does not detect properties", 
    ui_display_hint: 'VERIFICATION_FORM'  // Keep verification form active
  };
};

// Add mock implementation for completeScheduling
export const completeScheduling = async (agent: AgentConfig) => {
  console.log("[Authentication] Received completeScheduling call (redirecting to verifyOTP)");
  return {
    error: "The authentication agent cannot complete scheduling directly. Please use verifyOTP to complete the authentication process.",
    message: "Please complete the verification process first.",
    ui_display_hint: 'VERIFICATION_FORM' // Maintain verification form
  };
}; 