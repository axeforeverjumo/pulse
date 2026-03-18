import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBuilderStore } from "../../stores/builderStore";
import { useProductStore } from "../../stores/productStore";
import ProjectList from "./ProjectList";
import BuilderWorkspace from "./BuilderWorkspace";

export default function AIBuilderView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const setActiveProductType = useProductStore((s) => s.setActiveProductType);
  const { activeProjectId, setActiveProject, fetchProjects } = useBuilderStore();

  // Set product type on mount
  useEffect(() => {
    setActiveProductType("ai_builder");
  }, [setActiveProductType]);

  // Fetch projects on mount
  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  // Load project data when URL has a projectId
  useEffect(() => {
    if (projectId) {
      void setActiveProject(projectId);
    } else if (activeProjectId) {
      void setActiveProject(null);
    }
  }, [projectId]);

  if (!projectId) {
    return (
      <ProjectList
        onSelectProject={(id) => navigate(`/builder/${id}`)}
      />
    );
  }

  return <BuilderWorkspace />;
}
