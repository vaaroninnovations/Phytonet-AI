import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import PhytoNetAI from "@/pages/PhytoNetAI";
import DrugLikeness from "@/pages/DrugLikeness";
import ComingSoon from "@/pages/ComingSoon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { SelectionProvider } from "@/context/SelectionContext";
import { ResultsProvider } from "@/context/ResultsContext";
import { Toaster } from "sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <SelectionProvider>
          <ResultsProvider>
            <SiteHeader />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/phytonet-ai" element={<PhytoNetAI />} />
              <Route
                path="/plant-database"
                element={<Navigate to="/phytonet-ai" replace />}
              />
              <Route path="/drug-likeness" element={<DrugLikeness />} />
              <Route path="/tool/:slug" element={<ComingSoon />} />
            </Routes>
            <SiteFooter />
          </ResultsProvider>
        </SelectionProvider>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
