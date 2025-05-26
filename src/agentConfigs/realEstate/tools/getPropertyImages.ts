import { TranscriptItem } from "@/types/types";

export const getPropertyImages = async ({ property_name, query }: { property_name?: string; query?: string }, realEstateAgent: any, transcript: TranscriptItem[] = []) => {
    console.log(`[getPropertyImages] Fetching images for property: ${property_name || 'active project'}`);
    
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const toolsEdgeFunctionUrl = process.env.NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL || "https://dashboard.propzing.in/functions/v1/realtime_tools";
    
    const metadata = realEstateAgent.metadata;
    const project_ids = metadata?.project_ids || [];
    const active_project = metadata?.active_project || "N/A";
    const targetPropertyForName = property_name || active_project;

    if (!supabaseAnonKey) {
        console.error("[getPropertyImages] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return { 
          error: "Server configuration error.", 
          ui_display_hint: 'CHAT',
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
        // Step 1: Get property details images first
        let propertyDetailsImages: any[] = [];
        
        console.log(`[getPropertyImages] First fetching property details for: ${targetPropertyForName}`);
        
        // Determine project_id for getProjectDetails call
        let project_id_for_details = null;
        const metadataAny = metadata as any;
        
        // Try to get project_id from various sources
        if (metadataAny?.project_id_map && metadataAny.project_id_map[targetPropertyForName]) {
            project_id_for_details = metadataAny.project_id_map[targetPropertyForName];
        } else if (metadataAny?.active_project_id && targetPropertyForName === metadata?.active_project) {
            project_id_for_details = metadataAny.active_project_id;
        }
        
        // Call getProjectDetails to get property images
        const projectDetailsParams = project_id_for_details 
            ? { project_id: project_id_for_details }
            : { project_name: targetPropertyForName };
        
        const projectDetailsResult = await realEstateAgent.toolLogic?.getProjectDetails?.(projectDetailsParams, transcript);
        
        if (projectDetailsResult && !projectDetailsResult.error) {
            // Extract images from property details
            if (projectDetailsResult.property_details && projectDetailsResult.property_details.images) {
                // Handle case where getProjectDetails returns a single property
                propertyDetailsImages = projectDetailsResult.property_details.images.map((img: any) => ({
                    url: img.url || img.image_url,
                    alt: img.alt || img.description || `${targetPropertyForName} image`,
                    description: img.description || img.alt
                }));
                console.log(`[getPropertyImages] Found ${propertyDetailsImages.length} images from property details`);
            } else if (projectDetailsResult.properties && Array.isArray(projectDetailsResult.properties) && projectDetailsResult.properties.length > 0) {
                // Handle case where getProjectDetails returns array of properties
                const matchingProperty = projectDetailsResult.properties.find((prop: any) => 
                    prop.name?.toLowerCase() === targetPropertyForName.toLowerCase()
                ) || projectDetailsResult.properties[0]; // Use first property as fallback
                
                if (matchingProperty && matchingProperty.images) {
                    propertyDetailsImages = matchingProperty.images.map((img: any) => ({
                        url: img.url || img.image_url,
                        alt: img.alt || img.description || `${targetPropertyForName} image`,
                        description: img.description || img.alt
                    }));
                    console.log(`[getPropertyImages] Found ${propertyDetailsImages.length} images from property details (from array)`);
                }
            }
        }

        // Step 2: Get additional images from edge function
        console.log(`[getPropertyImages] Now fetching additional images from edge function`);
        
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
                    property_name: targetPropertyForName,
                    query,
                    project_ids,
                }),
            }
        );

        const result = await response.json();
        let additionalImages: any[] = [];

        if (response.ok && !result.error && result.images && result.images.length > 0) {
            additionalImages = result.images.map((img: any) => ({
                url: img.image_url || img.url,
                alt: img.description || img.alt || `${targetPropertyForName} additional image`,
                description: img.description || img.alt
            }));
            console.log(`[getPropertyImages] Found ${additionalImages.length} additional images from edge function`);
        }

        // Step 3: Merge images with property details first, then additional images
        const allImages = [...propertyDetailsImages];
        
        // Add additional images, but avoid duplicates based on URL
        const existingUrls = new Set(propertyDetailsImages.map(img => img.url));
        
        for (const additionalImg of additionalImages) {
            if (!existingUrls.has(additionalImg.url)) {
                allImages.push(additionalImg);
                existingUrls.add(additionalImg.url);
            }
        }

        console.log(`[getPropertyImages] Final merged result: ${allImages.length} total images (${propertyDetailsImages.length} from details + ${allImages.length - propertyDetailsImages.length} additional)`);

        if (allImages.length > 0) {
            return {
                property_name: result.property_name || targetPropertyForName,
                images: allImages,
                message: "Here are the images you requested.",
                ui_display_hint: 'IMAGE_GALLERY',
                images_data: {
                    propertyName: result.property_name || targetPropertyForName,
                    images: allImages
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
}; 