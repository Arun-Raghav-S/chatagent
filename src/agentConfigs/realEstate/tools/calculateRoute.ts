import { TranscriptItem } from "@/types/types";
import { incrementQuestionCountAndCheckAuth } from './trackUserMessage';

export const calculateRoute = async ({ origin, destination_property }: { origin: string; destination_property: string }, realEstateAgent: any, transcript: TranscriptItem[] = []) => {
    console.log(`[calculateRoute] Calculating route from "${origin}" to "${destination_property}"`);
    
    // CRITICAL: Check authentication before processing user request
    const authCheck = incrementQuestionCountAndCheckAuth(realEstateAgent, `calculateRoute: ${origin} to ${destination_property}`);
    
    if (authCheck.needs_authentication) {
        console.log("[calculateRoute] 🚨 Authentication required - transferring to authentication agent");
        return {
            destination_agent: authCheck.destination_agent,
            flow_context: authCheck.flow_context,
            came_from: authCheck.came_from,
            pending_question: authCheck.pending_question,
            message: null,
            silentTransfer: authCheck.silentTransfer
        };
    }

    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const toolsEdgeFunctionUrl = process.env.NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL || "https://dashboard.propzing.in/functions/v1/realtime_tools";
    
    const metadata = realEstateAgent.metadata;
    
    if (!supabaseAnonKey) {
        console.error("[calculateRoute] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return { 
            error: "Server configuration error.", 
            ui_display_hint: 'CHAT',
            message: "Sorry, I couldn't calculate the route due to a server configuration issue."
        };
    }

    // Helper function to check if a location string is a known property
    const isKnownProperty = (locationString: string): boolean => {
        const project_names = metadata?.project_names || [];
        return project_names.some((name: string) => 
            name.toLowerCase().includes(locationString.toLowerCase()) || 
            locationString.toLowerCase().includes(name.toLowerCase())
        );
    };

    // Helper function to get property details and construct location string
    const getPropertyLocationString = async (propertyName: string): Promise<string> => {
        try {
            const metadataAny = metadata as any;
            let project_id_for_details = null;
            
            // Try to get project_id from various sources
            if (metadataAny?.project_id_map && metadataAny.project_id_map[propertyName]) {
                project_id_for_details = metadataAny.project_id_map[propertyName];
            } else if (metadataAny?.active_project_id && propertyName === metadata?.active_project) {
                project_id_for_details = metadataAny.active_project_id;
            }
            
            // Call getProjectDetails to get property location info
            const projectDetailsParams = project_id_for_details 
                ? { project_id: project_id_for_details }
                : { project_name: propertyName };
            
            const projectDetailsResult = await realEstateAgent.toolLogic?.getProjectDetails?.(projectDetailsParams, transcript);
            
            if (projectDetailsResult && !projectDetailsResult.error) {
                let propertyLocation = null;
                
                // Extract location from property details
                if (projectDetailsResult.property_details && projectDetailsResult.property_details.location) {
                    propertyLocation = projectDetailsResult.property_details.location;
                } else if (projectDetailsResult.properties && Array.isArray(projectDetailsResult.properties) && projectDetailsResult.properties.length > 0) {
                    const matchingProperty = projectDetailsResult.properties.find((prop: any) => 
                        prop.name?.toLowerCase() === propertyName.toLowerCase()
                    ) || projectDetailsResult.properties[0];
                    
                    if (matchingProperty && matchingProperty.location) {
                        propertyLocation = matchingProperty.location;
                    }
                }
                
                // Construct location string with city if available
                if (propertyLocation && propertyLocation.city) {
                    const locationString = `${propertyName}, ${propertyLocation.city}`;
                    console.log(`[calculateRoute] Enhanced property location string: "${locationString}"`);
                    return locationString;
                }
            }
        } catch (error) {
            console.warn(`[calculateRoute] Error getting property details for ${propertyName}: ${error}`);
        }
        
        // Fallback to just the property name
        console.log(`[calculateRoute] Using fallback property name: "${propertyName}"`);
        return propertyName;
    };

    // Determine which locations are properties and enhance them
    let finalOrigin = origin;
    let finalDestination = destination_property;

    // Check if origin is a known property
    if (isKnownProperty(origin)) {
        console.log(`[calculateRoute] Origin "${origin}" detected as a property, enhancing with city info`);
        finalOrigin = await getPropertyLocationString(origin);
    }

    // Check if destination is a known property
    if (isKnownProperty(destination_property)) {
        console.log(`[calculateRoute] Destination "${destination_property}" detected as a property, enhancing with city info`);
        finalDestination = await getPropertyLocationString(destination_property);
    }

    // If neither origin nor destination was detected as a property, check if destination_property exists in project_locations
    if (finalOrigin === origin && finalDestination === destination_property) {
        const project_locations = metadata?.project_locations || {};
        const propertyLocationCoords = project_locations[destination_property];
        
        if (propertyLocationCoords) {
            console.log(`[calculateRoute] Destination "${destination_property}" found in project_locations, enhancing with city info`);
            finalDestination = await getPropertyLocationString(destination_property);
        } else {
            console.log(`[calculateRoute] No property detected in either origin or destination, proceeding with original values`);
        }
    }

    console.log(`[calculateRoute] Final route: "${finalOrigin}" -> "${finalDestination}"`);

    try {
        // Call the edge function with the enhanced location strings
        const response = await fetch(
            toolsEdgeFunctionUrl,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseAnonKey}`,
                },
                body: JSON.stringify({
                    action: "calculateRoute",
                    origin: finalOrigin,
                    destination: finalDestination,
                }),
            }
        );

        const data = await response.json();

        if (response.ok && data.routeSummary) {
            console.log(`[calculateRoute] Route summary from edge function: ${data.routeSummary}`);
            
            return { 
                routeSummary: data.routeSummary,
                ui_display_hint: 'CHAT',
                message: `Here are the driving directions from ${finalOrigin} to ${finalDestination}:`
            };
        } else if (response.ok && data.error) {
            console.warn(`[calculateRoute] Edge function returned an error: ${data.error}`);
            return { 
                error: data.error,
                ui_display_hint: 'CHAT',
                message: `Sorry, I couldn't calculate the route: ${data.error}`
            };
        } else {
            console.error("[calculateRoute] Edge function error:", data.error || response.statusText);
            return { 
                error: data.error || "Error calling calculateRoute edge function.",
                ui_display_hint: 'CHAT',
                message: "Sorry, there was an error calculating the route."
            };
        }
    } catch (error: any) {
        console.error("[calculateRoute] Error calling edge function:", error);
        return { 
            error: `Exception calculating route: ${error.message}`,
            ui_display_hint: 'CHAT',
            message: "Sorry, an unexpected error occurred while calculating the route."
        };
    }
}; 