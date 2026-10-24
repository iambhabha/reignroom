import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { Contact } from "./pages/Contact.tsx";
import { Help } from "./pages/Help.tsx";
import { Home } from "./pages/Home.tsx";
import { HostGuide } from "./pages/HostGuide.tsx";
import { Legal } from "./pages/Legal.tsx";
import { Room } from "./pages/Room.tsx";
import { hostKeyFor } from "./lib/storage.ts";
import "./styles.css";

hostKeyFor.prune();

function NotFound() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl font-bold uppercase">Page not found</h1>
      <Link to="/" className="font-semibold text-accent-text underline underline-offset-4">
        Back to home
      </Link>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/r/:code" element={<Room />} />
          <Route path="/host" element={<HostGuide />} />
          <Route path="/help" element={<Help />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </StrictMode>,
);
