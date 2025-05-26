import { TranscriptItem } from "@/types/types";

export const lookupProperty = async ({ query, k = 3 }: { query: string; k?: number }, realEstateAgent: any, transcript: TranscriptItem[] = []) => {
    console.log(`[lookupProperty] Querying edge function: "${query}", k=${k}`);
    
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const toolsEdgeFunctionUrl = process.env.NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL || "https://dashboard.propzing.in/functions/v1/realtime_tools";
    
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
}; 