import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import AppLayout from "./AppLayout";

import Home from "./pages/home";
import ChangelogPage from "./pages/ChangelogPage";
import NotFound from "./pages/NotFoundPage";
import DpsMeterPage from "./pages/dps/page";
import CharacterSearchPage from "./pages/character/page";
import CharacterViewPage from "./pages/character_view/page";
import DPSViewPage from "./pages/dps_view/page";
import RanksPage from "./pages/ranks/page";
import Aion2Layout from "./pages/layout";
import RanksDBPage from "./pages/ranks_db/page";

import "./App.css";
import "./i18n/index";

function App() {
  return (
    <Router>
      <Routes>
        {/* 使用AppLayout的路由 - 使用嵌套路由 */}
        <Route element={<AppLayout />}>
          <Route path="*" element={<NotFound />} />

          {/* <Route path="/changelog" element={<ChangelogPage />} /> */}

          <Route element={<Aion2Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/character" element={<CharacterSearchPage />} />
            <Route path="/character/view" element={<CharacterViewPage />} />
            <Route path="/ranks_scrapy" element={<RanksPage />} />
            <Route path="/ranks" element={<RanksDBPage />} />
            <Route path="/dps/view" element={<DPSViewPage />} />
          </Route>
        </Route>

        {/* 不使用AppLayout的路由 */}
        <Route path="/dps" element={<DpsMeterPage />} />

        {/* <Route path="/login" element={<Login />} /> */}
      </Routes>
    </Router>
    // <>isDesktop{isDesktop.toString()}</>
  );
}

export default App;
