import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import { AppProvider } from "./lib/hooks";
import Home from "./pages/Home";

// Heavier pages (charts, map) are split out so the landing page loads fast.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MapPage = lazy(() => import("./pages/MapPage"));
const Analysis = lazy(() => import("./pages/Analysis"));
const Audit = lazy(() => import("./pages/Audit"));
const Report = lazy(() => import("./pages/Report"));
const Recommendations = lazy(() => import("./pages/Recommendations"));
const Calculator = lazy(() => import("./pages/Calculator"));
const Downloads = lazy(() => import("./pages/Downloads"));
const Admin = lazy(() => import("./pages/Admin"));
const Login = lazy(() => import("./pages/Login"));
const Methodology = lazy(() => import("./pages/Methodology"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="p-10"><Spinner /></div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="map" element={<MapPage />} />
              <Route path="analysis" element={<Analysis />} />
              <Route path="audit" element={<Audit />} />
              <Route path="report" element={<Report />} />
              <Route path="recommendations" element={<Recommendations />} />
              <Route path="calculator" element={<Calculator />} />
              <Route path="downloads" element={<Downloads />} />
              <Route path="admin" element={<Admin />} />
              <Route path="login" element={<Login />} />
              <Route path="methodology" element={<Methodology />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  );
}
