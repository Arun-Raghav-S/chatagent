export const updateActiveProject = async ({ project_name }: { project_name: string }, realEstateAgent: any, getInstructions: any) => {
    console.log(`[updateActiveProject] Attempting to set active project to: "${project_name}"`);
    const metadata = realEstateAgent.metadata;
    if (!metadata) {
        console.error("[updateActiveProject] Agent metadata is missing.");
        return { success: false, message: "Agent metadata unavailable." };
    }

    const availableProjects = metadata.project_names || [];
    const trimmedProjectName = project_name.trim();

    // Find the project in available projects (case-insensitive)
    const matchedProject = availableProjects.find(
       (p: string) => p.trim().toLowerCase() === trimmedProjectName.toLowerCase()
    );

    if (!matchedProject) {
       console.error(`[updateActiveProject] Project "${trimmedProjectName}" not found in available list: ${availableProjects.join(", ")}`);
       return { success: false, message: `Project "${trimmedProjectName}" is not recognized.` };
    }

    // Update metadata
    const previousProject = metadata.active_project;
    metadata.active_project = matchedProject; // Use original casing
    
    // Store the project_id too if available in project_id_map
    const metadataAny = metadata as any;
    if (metadataAny.project_id_map && metadataAny.project_id_map[matchedProject]) {
        metadataAny.active_project_id = metadataAny.project_id_map[matchedProject];
        console.log(`[updateActiveProject] Set active_project_id to: ${metadataAny.active_project_id}`);
    }

    // Update instructions (important!)
    realEstateAgent.instructions = getInstructions(metadata);

    console.log(`[updateActiveProject] Success: Active project changed from "${previousProject}" to "${matchedProject}"`);
    return { 
        success: true, 
        active_project: matchedProject,
        active_project_id: (metadata as any).active_project_id || null
    };
}; 