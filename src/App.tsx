import { useState, useRef, useEffect } from 'react';
import { Mic, Square, RefreshCw, AlertCircle, Key } from 'lucide-react';
import { motion } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    } else {
      setShowKeyModal(true);
    }
  }, []);

  const handleSaveKey = () => {
    localStorage.setItem('gemini_api_key', tempKey);
    setApiKey(tempKey);
    setShowKeyModal(false);
  };

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ transcript: string; translation: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isYodaMode, setIsYodaMode] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const yodaModeRef = useRef(false);

  const toggleYoda = () => {
    const newMode = !isYodaMode;
    setIsYodaMode(newMode);
    yodaModeRef.current = newMode;
  };
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAudio(audioBlob, mimeType);
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const processAudio = async (audioBlob: Blob, mimeType: string) => {
    if (!apiKey) {
      setError("Please add your Gemini API key first.");
      setTempKey('');
      setShowKeyModal(true);
      setIsProcessing(false);
      return;
    }

    try {
      // Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
        const base64String = base64data.split(',')[1];
        
        // Clean up mimeType for Gemini (sometimes browsers append codecs which Gemini might reject)
        const cleanMimeType = mimeType.split(';')[0] || 'audio/webm';

        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: base64String
                }
              },
              {
                text: `You are the 'Manslater'. Listen to the attached audio of a woman speaking. First, transcribe EXACTLY what she is saying in the audio. DO NOT add, invent, or hallucinate any extra words to the transcript. Only transcribe the actual audio provided. Then, ${
                  yodaModeRef.current 
                    ? "translate the subtext of what she *really* means into the speaking style of Yoda from Star Wars. Use his iconic object-subject-verb sentence structure (e.g., 'Angry, she is. Food, you must bring.')." 
                    : "translate the subtext of what she *really* means into humorous, grunt-filled 'caveman speech' for a man to understand. Keep the caveman translation funny, short, and to the point (e.g., 'Ugg. She mad. Bring food.')."
                }`
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  transcript: { type: Type.STRING, description: "What she literally said" },
                  translation: { type: Type.STRING, description: "The caveman translation of the subtext" }
                },
                required: ["transcript", "translation"]
              }
            }
          });

          const jsonStr = response.text?.trim() || "{}";
          const parsed = JSON.parse(jsonStr);
          setResult(parsed);
        } catch (apiErr: any) {
          console.error("API Error:", apiErr);
          const errorString = apiErr?.message || String(apiErr);
          if (errorString.includes("429") || errorString.includes("Quota exceeded") || errorString.includes("RESOURCE_EXHAUSTED")) {
            setError("Ugg. Too many translations! The free AI quota is maxed out. Try again in a minute, or click the 🔑 icon to use your own API key.");
          } else {
            setError("Ugg. Brain hurt. Try again.");
          }
        } finally {
          setIsProcessing(false);
        }
      };
    } catch (err) {
      console.error("Processing error:", err);
      setError("Failed to process audio.");
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#FFFFFF] flex items-center justify-center p-4 font-sans overflow-hidden">
      <div className="w-full max-w-[360px] h-[680px] bg-[#121212] rounded-[40px] border-[8px] border-[#222] shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <header className="pt-[40px] pb-[20px] px-[24px] border-b border-[#282828] relative">
          <h1 className="text-[14px] uppercase tracking-[4px] text-[#8E8E93] text-center">The Manslater</h1>
          <button 
            onClick={() => { setTempKey(apiKey); setShowKeyModal(true); }} 
            className="absolute right-6 top-[38px] text-[#8E8E93] hover:text-[#FFFFFF] transition-colors"
            title="API Key Settings"
          >
            <Key className="w-4 h-4" />
          </button>
        </header>

        {/* Disclaimer */}
        <div className="bg-[#1a1a1a] py-2 px-4 border-b border-[#282828] shrink-0">
          <p className="text-[9px] text-[#8E8E93] uppercase tracking-wider text-center leading-relaxed">
            Disclaimer: Not responsible for fixing your relationship.<br/>99.99% accurate 23.99% of the time.
          </p>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {error && (
            <div className="m-4 p-4 bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-[#FF3B30] text-sm rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {!result && !isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center p-5">
              <div className="w-[120px] h-[120px] rounded-full border border-[#282828] flex items-center justify-center mb-[30px] relative">
                {isRecording ? (
                  <>
                    <motion.div 
                      animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0, 0.8] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 rounded-full border border-[#FF3B30]"
                    />
                    <div className="w-[20px] h-[20px] bg-[#FF3B30] rounded-full shadow-[0_0_20px_#FF3B30]" />
                  </>
                ) : (
                  <Mic className="text-[#282828] w-8 h-8" />
                )}
              </div>
              <p className={`text-[12px] font-bold tracking-wider uppercase text-center ${isRecording ? 'text-[#FF3B30]' : 'text-[#8E8E93]'}`}>
                {isRecording ? "Recording..." : "Ready to Translate"}
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center p-5">
              <div className="w-[120px] h-[120px] rounded-full border border-[#282828] flex items-center justify-center mb-[30px]">
                <RefreshCw className="text-[#FF3B30] w-8 h-8 animate-spin" />
              </div>
              <p className="text-[12px] text-[#FF3B30] font-bold tracking-wider uppercase text-center">
                Processing AI Translation...
              </p>
            </div>
          )}

          {result && (
            <div className="bg-[#000] p-6 border-y border-[#282828] my-auto">
              <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#8E8E93] mb-[12px] block">She Said</span>
              <div className="text-[15px] leading-[1.5] text-[#FFFFFF] italic mb-[24px] opacity-90">
                "{result.transcript}"
              </div>
              
              <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#8E8E93] mb-[12px] block">
                {isYodaMode ? "Yodaslation" : "Manslation"}
              </span>
              <div className={`border-l-[3px] p-[15px] mt-[10px] ${isYodaMode ? 'bg-[rgba(52,199,89,0.05)] border-[#34C759]' : 'bg-[rgba(255,165,0,0.05)] border-[#FFA500]'}`}>
                <div className={`font-mono text-[16px] font-bold uppercase ${isYodaMode ? 'text-[#34C759]' : 'text-[#FFA500]'}`}>
                  {result.translation}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="py-[30px] px-[20px] flex justify-around items-center bg-[#121212] shrink-0">
          <button 
            onClick={reset}
            className="text-[11px] uppercase text-[#8E8E93] tracking-[1px] border-b border-transparent hover:text-[#FFFFFF] hover:border-[#FFFFFF] transition-colors pb-1"
          >
            Reset
          </button>
          
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`w-[64px] h-[64px] rounded-full bg-[#1a1a1a] border-2 border-[#FF3B30] flex items-center justify-center transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#222]'}`}
          >
            {isRecording ? (
              <div className="w-[24px] h-[24px] bg-[#FF3B30] rounded-[4px]" />
            ) : (
              <div className="w-[20px] h-[20px] bg-[#FF3B30] rounded-full" />
            )}
          </button>

          <button 
            onClick={toggleYoda}
            className={`text-[11px] uppercase tracking-[1px] border-b pb-1 transition-colors ${isYodaMode ? 'text-[#34C759] border-[#34C759]' : 'text-[#8E8E93] border-transparent hover:text-[#FFFFFF] hover:border-[#FFFFFF]'}`}
          >
            Yoda: {isYodaMode ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* API Key Modal */}
        {showKeyModal && (
          <div className="absolute inset-0 bg-[#050505]/90 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-[#121212] border border-[#282828] p-6 rounded-2xl w-full shadow-2xl">
              <h2 className="text-[#FFFFFF] font-bold uppercase tracking-wider mb-4 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-[#FF3B30]" />
                API Key Required
              </h2>
              <p className="text-[#8E8E93] text-xs mb-4 leading-relaxed">
                To use this app on GitHub Pages, you need your own free Gemini API key from Google AI Studio. Your key is saved locally in your browser.
              </p>
              <input 
                type="password" 
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-[#000] border border-[#282828] rounded-lg p-3 text-[#FFFFFF] text-sm mb-4 focus:outline-none focus:border-[#FF3B30] transition-colors"
              />
              <div className="flex justify-between items-center mt-2">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[#FF3B30] text-xs uppercase font-bold hover:underline flex items-center gap-1"
                >
                  Get Free Key ↗
                </a>
                <div className="flex gap-3">
                  {apiKey && (
                    <button 
                      onClick={() => setShowKeyModal(false)} 
                      className="text-[#8E8E93] text-xs uppercase font-bold px-4 py-2 hover:text-[#FFFFFF] transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button 
                    onClick={handleSaveKey} 
                    disabled={!tempKey.trim()}
                    className="bg-[#FF3B30] text-[#FFFFFF] text-xs uppercase font-bold px-4 py-2 rounded-lg hover:bg-[#ff5c53] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
