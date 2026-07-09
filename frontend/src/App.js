import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import PlantDatabase from "@/pages/PlantDatabase";
import ComingSoon from "@/pages/ComingSoon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Toaster } from "sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <SiteHeader />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plant-database" element={<PlantDatabase />} />
          <Route path="/tool/:slug" element={<ComingSoon />} />
        </Routes>
        <SiteFooter />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
