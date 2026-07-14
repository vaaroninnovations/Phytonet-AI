import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import PhytoNetAI from "@/pages/PhytoNetAI";
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
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { SelectionProvider } from "@/context/SelectionContext";
import { ResultsProvider } from "@/context/ResultsContext";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { AuthProvider } from "@/context/AuthContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { AuthModal } from "@/components/AuthModal";
import ResumeSessionModal from "@/components/ResumeSessionModal";
import { Toaster } from "sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <SelectionProvider>
            <ResultsProvider>
              <WorkflowProvider>
                <NetworkProvider>
                  <ProjectProvider>
                    <SiteHeader />
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/phytonet-ai" element={<PhytoNetAI />} />
                      <Route
                        path="/plant-database"
                        element={<Navigate to="/phytonet-ai" replace />}
                      />
                      <Route path="/drug-likeness" element={<DrugLikeness />} />
                      <Route path="/target-prediction" element={<TargetPrediction />} />
                      <Route
                        path="/disease-target-identification"
                        element={<DiseaseTargets />}
                      />
                      <Route path="/network-analysis" element={<NetworkAnalysis />} />
                      <Route path="/molecular-docking" element={<MolecularDocking />} />
                      <Route path="/molecular-dynamics" element={<MolecularDynamics />} />
                      <Route path="/scientific-report" element={<AIScientificReport />} />
                      <Route path="/ai-scientific-report" element={<AIScientificReport />} />
                      <Route path="/projects" element={<MyProjects />} />
                      <Route path="/verify-email" element={<VerifyEmail />} />
                      <Route path="/ai-assistant" element={<AIAssistant />} />
                      <Route path="/tool/:slug" element={<ComingSoon />} />
                    </Routes>
                    <SiteFooter />
                    <AuthModal />
                    <ResumeSessionModal />
                  </ProjectProvider>
                </NetworkProvider>
              </WorkflowProvider>
            </ResultsProvider>
          </SelectionProvider>
        </AuthProvider>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
