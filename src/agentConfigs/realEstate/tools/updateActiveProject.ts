import { AgentMetadata } from "@/types/types";

export const updateActiveProject = async ({ project_name }: { project_name: string }, realEstateAgent: any, getInstructions: any) => {
    console.log(`[updateActiveProject] Attempting to set active project to: "${project_name}"`);
    
    const metadata = realEstateAgent.metadata as AgentMetadata;
    const metadataAny = metadata as any;
    
    const previousActiveProject = metadata?.active_project || "N/A";
    
    // Update active project in metadata
    if (realEstateAgent.metadata) {
        realEstateAgent.metadata.active_project = project_name;
        
        // Also update the active_project_id if we have a project_id_map
        if (metadataAny?.project_id_map && metadataAny.project_id_map[project_name]) {
            metadataAny.active_project_id = metadataAny.project_id_map[project_name];
            console.log(`[updateActiveProject] Set active_project_id to: ${metadataAny.active_project_id}`);
        }
        
        // Update the agent's instructions with new metadata
        if (getInstructions && typeof getInstructions === 'function') {
            realEstateAgent.instructions = getInstructions(realEstateAgent.metadata);
        }
    }
    
    console.log(`[updateActiveProject] Success: Active project changed from "${previousActiveProject}" to "${project_name}"`);
    
    // ✅ FIXED: Remove suggested_next_action to let LLM choose the appropriate tool
    // The agent will now intelligently choose between lookupProperty, getProjectDetails, etc.
    return { 
        success: true, 
        active_project: project_name,
        active_project_id: metadataAny?.active_project_id,
        message: `Successfully updated active project to ${project_name}.`
    };
}; 