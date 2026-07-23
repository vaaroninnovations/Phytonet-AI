import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import PhytoNetAI from "@/pages/PhytoNetAI";
import PlantDatabase from "@/pages/PlantDatabase";
import DrugLikeness from "@/pages/DrugLikeness";
import ComingSoon from "@/pages/ComingSoon";
import TargetPrediction from "@/pages/TargetPrediction";
import DiseaseTargets from "@/pages/DiseaseTargets";
import NetworkAnalysis from "@/pages/NetworkAnalysis";
import MolecularDocking from "@/pages/MolecularDocking";
import MolecularDynamics from "@/pages/MolecularDynamics";
import AIScientificReport from "@/pages/AIScientificReport";
import MyProjects from "@/pages/MyProjects";
import VerifyEmail from "@/pages/VerifyEmail";
import AIAssistant from "@/pages/AIAssistant";
import GoogleCallback from "@/pages/GoogleCallback";
import DatabasesHub from "@/pages/DatabasesHub";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { SelectionProvider } from "@/context/SelectionContext";
import { ResultsProvider } from "@/context/ResultsContext";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { AuthProvider } from "@/context/AuthContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { ChartStyleProvider } from "@/context/ChartStyleContext";
import { NodeProvider } from "@/context/NodeContext";
import { AuthModal } from "@/components/AuthModal";
import ResumeSessionModal from "@/components/ResumeSessionModal";
import { PurchaseNodesModal, InsufficientNodesModal } from "@/components/nodes/NodeModals";
import { Toaster } from "sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <NodeProvider>
          <SelectionProvider>
            <ResultsProvider>
              <WorkflowProvider>
                <NetworkProvider>
                  <ProjectProvider>
                    <ChartStyleProvider>
                    <SiteHeader />
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/phytonet-ai" element={<PhytoNetAI />} />
                      <Route path="/plant-database" element={<PlantDatabase />} />
                      <Route path="/drug-likeness" element={<DrugLikeness />} />
                      <Route path="/admet" element={<DrugLikeness />} />
                      <Route path="/compound-target-prediction" element={<TargetPrediction />} />
                      <Route path="/target-prediction" element={<TargetPrediction />} />
                      <Route
                        path="/disease-target-prediction"
                        element={<DiseaseTargets />}
                      />
                      <Route
                        path="/disease-target-identification"
                        element={<DiseaseTargets />}
                      />
                      <Route path="/databases" element={<DatabasesHub />} />
                      <Route path="/network-analysis" element={<NetworkAnalysis />} />
                      <Route path="/molecular-docking" element={<MolecularDocking />} />
                      <Route path="/molecular-dynamics" element={<MolecularDynamics />} />
                      <Route path="/scientific-report" element={<AIScientificReport />} />
                      <Route path="/ai-scientific-report" element={<AIScientificReport />} />
                      <Route path="/projects" element={<MyProjects />} />
                      <Route path="/verify-email" element={<VerifyEmail />} />
                      <Route path="/ai-assistant" element={<AIAssistant />} />
                      <Route path="/auth/google/callback" element={<GoogleCallback />} />
                      <Route path="/tool/:slug" element={<ComingSoon />} />
                    </Routes>
                    <SiteFooter />
                    <AuthModal />
                    <ResumeSessionModal />
                    <PurchaseNodesModal />
                    <InsufficientNodesModal />
                    </ChartStyleProvider>
                  </ProjectProvider>
                </NetworkProvider>
              </WorkflowProvider>
            </ResultsProvider>
          </SelectionProvider>
          </NodeProvider>
        </AuthProvider>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
