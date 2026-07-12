import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import PlantDatabase from "@/pages/PlantDatabase";
import DrugLikeness from "@/pages/DrugLikeness";
import ComingSoon from "@/pages/ComingSoon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { SelectionProvider } from "@/context/SelectionContext";
import { Toaster } from "sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <SelectionProvider>
          <SiteHeader />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/plant-database" element={<PlantDatabase />} />
            <Route path="/drug-likeness" element={<DrugLikeness />} />
            <Route path="/tool/:slug" element={<ComingSoon />} />
          </Routes>
          <SiteFooter />
        </SelectionProvider>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
