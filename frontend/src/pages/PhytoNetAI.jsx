import { useNavigate } from "react-router-dom";
import { useState } from "react";
import PlantDatabase from "@/pages/PlantDatabase";
import WorkflowSidebar from "@/components/WorkflowSidebar";
import LCMSUpload from "@/components/LCMSUpload";
import { useSelection } from "@/context/SelectionContext";

const STEP_ROUTES = {
  "plant-database": "/phytonet-ai",
  "drug-likeness-screening": "/drug-likeness",
};

export default function PhytoNetAI() {
  const navigate = useNavigate();
  const { count: selectedCount } = useSelection();
  const [lcmsFile, setLcmsFile] = useState(null);

  // Step 1 is complete once the user has selected compounds OR uploaded an
  // LC-MS file — either populates the downstream dataset.
  const completedIds =
    selectedCount > 0 || (lcmsFile && lcmsFile.compounds?.length)
      ? ["plant-database"]
      : [];

  const onStepClick = (id) => {
    const route = STEP_ROUTES[id];
    if (route) navigate(route);
  };

  return (
    <div
      data-testid="phytonet-ai-workspace"
      className="flex min-h-[calc(100vh-4rem)] flex-col md:flex-row"
    >
      <WorkflowSidebar
        activeId="plant-database"
        completedIds={completedIds}
        onStepClick={onStepClick}
      />
      <div className="min-w-0 flex-1">
        <PlantDatabase />
        <LCMSUpload onLoaded={setLcmsFile} />
      </div>
    </div>
  );
}
