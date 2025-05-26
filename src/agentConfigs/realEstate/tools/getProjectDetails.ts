import { TranscriptItem } from "@/types/types";

export const getProjectDetails = async ({ project_id, project_name }: { project_id?: string; project_name?: string }, realEstateAgent: any, transcript: TranscriptItem[] = []) => {
    console.log(`[getProjectDetails] Fetching project details: project_id=${project_id || 'none'}, project_name=${project_name || 'none'}`);
    
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const toolsEdgeFunctionUrl = process.env.NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL || "https://dashboard.propzing.in/functions/v1/realtime_tools";
    
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
}; 