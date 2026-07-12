import { useEffect, useState } from "react";
import PlantDatabase from "@/pages/PlantDatabase";
import WorkflowLayout from "@/components/WorkflowLayout";
import LCMSUpload from "@/components/LCMSUpload";
import { useSelection } from "@/context/SelectionContext";
import { useResults } from "@/context/ResultsContext";
import { useWorkflow } from "@/context/WorkflowContext";

export default function PhytoNetAI() {
  const { count: selectedCount } = useSelection();
  const { compounds } = useResults();
  const { markComplete, markIncomplete } = useWorkflow();
  const [lcmsFile, setLcmsFile] = useState(null);

  // Plant Database step is "complete" once compounds have been obtained AND
  // the user has picked at least one — unlocking downstream modules.
  useEffect(() => {
    const hasCompounds =
      compounds.length > 0 || (lcmsFile && lcmsFile.compounds?.length);
    if (hasCompounds && selectedCount > 0) {
      markComplete("plant-database");
    } else {
      markIncomplete("plant-database");
    }
  }, [compounds.length, selectedCount, lcmsFile, markComplete, markIncomplete]);

  return (
    <WorkflowLayout>
      <PlantDatabase />
      <LCMSUpload onLoaded={setLcmsFile} />
    </WorkflowLayout>
  );
}
