import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import PhytoNetAI from "@/pages/PhytoNetAI";
import ResearchWorkspace from "@/pages/ResearchWorkspace";
import SharedResearch from "@/pages/SharedResearch";
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
import PhytoNet from "@/pages/PhytoNet";
import GoogleCallback from "@/pages/GoogleCallback";
import Resources from "@/pages/Resources";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminAuditLog from "@/pages/admin/AdminAuditLog";
import AdminFeedback from "@/pages/admin/AdminFeedback";
import AdminContact from "@/pages/admin/AdminContact";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminProfile from "@/pages/admin/AdminProfile";
import { AdminForgotPassword, AdminResetPassword } from "@/pages/admin/AdminPasswordReset";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { SelectionProvider } from "@/context/SelectionContext";
import { ResultsProvider } from "@/context/ResultsContext";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { AuthProvider } from "@/context/AuthContext";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { ChartStyleProvider } from "@/context/ChartStyleContext";
import { NodeProvider } from "@/context/NodeContext";
import { AuthModal } from "@/components/AuthModal";
import ResumeSessionModal from "@/components/ResumeSessionModal";
import { PurchaseNodesModal, InsufficientNodesModal } from "@/components/nodes/NodeModals";
import { FeedbackProvider } from "@/components/feedback/FeedbackDialog";
import { Toaster } from "sonner";

function SiteChrome({ children }) {
  // Hide user SiteHeader/Footer on admin routes — admin has its own chrome.
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  return (
    <>
      {!isAdmin && <SiteHeader />}
      {children}
      {!isAdmin && <SiteFooter />}
    </>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AdminAuthProvider>
        <AuthProvider>
          <NodeProvider>
          <FeedbackProvider>
          <SelectionProvider>
            <ResultsProvider>
              <WorkflowProvider>
                <NetworkProvider>
                  <ProjectProvider>
                    <ChartStyleProvider>
                    <SiteChrome>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/phytonet-ai" element={<PhytoNetAI />} />
                      <Route path="/research" element={<ResearchWorkspace />} />
                      <Route path="/research/shared/:slug" element={<SharedResearch />} />
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
                      <Route path="/resources" element={<Resources />} />
                      <Route path="/databases" element={<Navigate to="/resources" replace />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/network-analysis" element={<NetworkAnalysis />} />
                      <Route path="/molecular-docking" element={<MolecularDocking />} />
                      <Route path="/dock" element={<MolecularDocking />} />
                      <Route path="/molecular-dynamics" element={<MolecularDynamics />} />
                      <Route path="/scientific-report" element={<AIScientificReport />} />
                      <Route path="/ai-scientific-report" element={<AIScientificReport />} />
                      <Route path="/projects" element={<MyProjects />} />
                      <Route path="/verify-email" element={<VerifyEmail />} />
                      <Route path="/phytonet" element={<PhytoNet />} />
                      <Route path="/ai-assistant" element={<PhytoNet />} />
                      <Route path="/auth/google/callback" element={<GoogleCallback />} />
                      <Route path="/tool/:slug" element={<ComingSoon />} />

                      {/* ─── Super Admin ─── */}
                      <Route path="/admin/login" element={<AdminLogin />} />
                      <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />
                      <Route path="/admin/reset-password" element={<AdminResetPassword />} />
                      <Route path="/admin" element={<AdminLayout />}>
                        <Route index element={<AdminDashboard />} />
                        <Route path="dashboard" element={<AdminDashboard />} />
                        <Route path="users" element={<AdminUsers />} />
                        <Route path="audit-log" element={<AdminAuditLog />} />
                        <Route path="feedback" element={<AdminFeedback />} />
                        <Route path="contact" element={<AdminContact />} />
                        <Route path="settings" element={<AdminSettings />} />
                        <Route path="profile" element={<AdminProfile />} />
                      </Route>
                    </Routes>
                    </SiteChrome>
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
          </FeedbackProvider>
          </NodeProvider>
        </AuthProvider>
        </AdminAuthProvider>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
