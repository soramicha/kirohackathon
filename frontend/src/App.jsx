import { useState } from "react";
import VideoInput from "./components/VideoInput";
import DancerCountSelector from "./components/DancerCountSelector";
import TimestampSelector from "./components/TimestampSelector";
import FormationViewer from "./components/FormationViewer";

const STEPS = ["input", "dancers", "timestamps", "formations"];

export default function App() {
  const [step, setStep] = useState("input");
  const [session, setSession] = useState(null);       // { session_id, metadata, auto_timestamps }
  const [dancerCount, setDancerCount] = useState(null); // number of dancers
  const [formations, setFormations] = useState([]);   // analyzed formation results

  function handleVideoProcessed(data) {
    setSession(data);
    setStep("dancers");
  }

  function handleDancerCountSet(count) {
    setDancerCount(count);
    setStep("timestamps");
  }

  function handleFormationsReady(data) {
    setFormations(data);
    setStep("formations");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-sm font-bold">
          F
        </div>
        <span className="text-lg font-semibold tracking-tight">FormationAI</span>
        <span className="ml-2 text-xs text-gray-500">
          for Illuminate · LanternFest · CultureFest
        </span>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-800 text-xs text-gray-500">
        {["input", "dancers", "timestamps", "formations"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full ${
                step === s
                  ? "bg-violet-600 text-white"
                  : STEPS.indexOf(step) > i
                  ? "bg-gray-700 text-gray-300"
                  : "bg-gray-800 text-gray-600"
              }`}
            >
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 3 && <span>→</span>}
          </span>
        ))}
      </div>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {step === "input" && (
          <VideoInput onProcessed={handleVideoProcessed} />
        )}
        {step === "dancers" && session && (
          <DancerCountSelector
            session={session}
            onDancerCountSet={handleDancerCountSet}
          />
        )}
        {step === "timestamps" && session && (
          <TimestampSelector
            session={session}
            dancerCount={dancerCount}
            onFormationsReady={handleFormationsReady}
          />
        )}
        {step === "formations" && (
          <FormationViewer
            session={session}
            formations={formations}
          />
        )}
      </main>
    </div>
  );
}
