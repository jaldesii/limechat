import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { DarkModeProvider } from "./context/DarkModeContext";
import Hero from "./pages/Hero";
import TermsConditions from "./pages/TermsConditions";
import ProfileCreation from "./pages/ProfileCreation";
import WaitingRoom from "./pages/WaitingRoom";
import ChatRoom from "./pages/ChatRoom";
import AdminPanel from "./pages/AdminPanel";
import FAQ from "./pages/FAQ";
import CallRoom from "./pages/CallRoom";
function App() {
  return (
    <DarkModeProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Hero />} />
          <Route path="/terms" element={<TermsConditions />} />
          <Route path="/profile" element={<ProfileCreation />} />
          <Route path="/waiting" element={<WaitingRoom />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/chat/:roomId" element={<ChatRoom />} />
          <Route path="/call/:roomId" element={<CallRoom />} />
          <Route path="/lime-admin-7x9q" element={<AdminPanel />} />
        </Routes>
      </Router>
    </DarkModeProvider>
  );
}

export default App;