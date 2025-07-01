"use client"; // Still needed for useEffect, useState, and useParams

import { useEffect, useState } from "react";
import { useParams } from 'next/navigation'; // Import useParams
import { supabase } from "@/libs/supabaseClient"; // Import the Supabase client
import { ChatbotConfig } from "@/types/types"; // Import the ChatbotConfig type
import RealEstateAgent from "@/components/ChatBot/newchat";

// Component no longer receives params prop directly
export default function ChatPage() {
  const params = useParams(); // Get params using the hook
  // Type assertion might be needed if TS doesn't infer string type
  const orgcode = params.orgcode as string; 

  const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Use orgcode obtained from useParams hook
    if (!orgcode) {
      console.warn("No 'orgcode' found in route parameters via useParams.");
      setError("Organization code missing from URL path.");
      setIsLoading(false);
      return;
    }

    console.log(`Fetching chatbot config for orgcode: ${orgcode}`);
    setError(null);
    setIsLoading(true);

    const fetchChatbotConfig = async () => {
      try {
          const { data, error: dbError } = await supabase
            .from("chatbot") 
            .select("id, chatbot_name, bg_color, text_color, logo, first_message, org_code")
            .eq("org_code", orgcode) 
            .single();

          if (dbError) {
            console.error("Error fetching chatbot config:", dbError);
            setError(`Failed to find chatbot for org: ${orgcode}. ${dbError.message}`);
            setChatbotConfig(null);
          } else if (data && data.id) {
            console.log(`Found chatbot config:`, data);
            setChatbotConfig(data);
          } else {
            console.warn(`No chatbot found for orgcode: ${orgcode}`);
            setError(`No chatbot configuration found for organization: ${orgcode}`);
            setChatbotConfig(null);
          }
      } catch (err: any) {
           console.error("Exception during fetchChatbotConfig:", err);
           setError(`An unexpected error occurred: ${err.message}`);
           setChatbotConfig(null);
      } finally {
           setIsLoading(false);
      }
    };

    fetchChatbotConfig();
    // Rerun effect if orgcode changes (which happens on route change)
  }, [orgcode]); 

  return (
   <div className="left-0 top-0 h-screen w-screen flex items-center justify-center">
     {isLoading && (
        <div className="text-center p-4">Loading Chatbot...</div>
     )}
     {error && (
         <div className="text-center p-4 text-red-500">Error: {error}</div>
     )}
     {!isLoading && !error && chatbotConfig && (
        <RealEstateAgent chatbotConfig={chatbotConfig} />
     )}
     {!isLoading && !error && !chatbotConfig && (
         <div className="text-center p-4 text-yellow-500">Chatbot not available for this organization.</div>
     )}
   </div>
  );
}

// Removed the separate Home component and Suspense wrapper related to useSearchParams 