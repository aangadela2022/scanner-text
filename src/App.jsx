import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, 
  Camera, 
  Scissors, 
  FileText, 
  Download, 
  CheckCircle, 
  RefreshCw, 
  Loader2,
  ChevronRight,
  ChevronLeft,
  X,
  Type,
  Plus,
  Trash2,
  Files,
  Bold,
  Italic,
  List,
  Edit3
} from 'lucide-react';
import Cropper from 'react-easy-crop';
import { motion, AnimatePresence } from 'framer-motion';
import { performOCR } from './utils/ocrService';
import { exportToDocx } from './utils/exportService';
import { exportToPdf } from './utils/pdfService';

// --- Sub-components ---

const StepIndicator = ({ step }) => (
  <div className="flex items-center justify-center space-x-4 mb-8">
    {[1, 2, 3, 4].map((i) => (
      <React.Fragment key={i}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
          step === i ? 'bg-indigo-500 text-white animate-pulse' : 
          step > i ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
        }`}>
          {step > i ? <CheckCircle size={16} /> : i}
        </div>
        {i < 4 && <div className={`h-1 w-8 rounded ${step > i ? 'bg-indigo-500' : 'bg-slate-700'}`} />}
      </React.Fragment>
    ))}
  </div>
);

// --- Main App ---

export default function App() {
  const [step, setStep] = useState(1);
  const [pages, setPages] = useState([]); // { image, text }
  const [image, setImage] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [ocrResult, setOcrResult] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [language, setLanguage] = useState('ind+eng');
  const [isTableMode, setIsTableMode] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const editorRef = useRef(null);

  // --- Functions ---

  const onFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImage(reader.result);
        setStep(2);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onCropComplete = useCallback((_croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (imageSrc, pixelCrop) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
    return canvas.toDataURL('image/jpeg');
  };

  const handleApplyCrop = async () => {
    try {
      const croppedBase64 = await getCroppedImg(image, croppedAreaPixels);
      setCroppedImage(croppedBase64);
      setStep(3);
      runOCR(croppedBase64);
    } catch (e) { console.error(e); }
  };

  const runOCR = async (imgSource) => {
    setIsProcessing(true);
    setOcrProgress(0);
    try {
      const text = await performOCR(imgSource, language, setOcrProgress, isTableMode);
      setOcrResult(text);
      setStep(4);
    } catch (e) {
      alert('OCR Failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveCurrentPage = () => {
    const finalContent = editorRef.current ? editorRef.current.innerText : ocrResult;
    setPages([...pages, { image: croppedImage, text: finalContent }]);
    setImage(null);
    setCroppedImage(null);
    setOcrResult('');
    setStep(1); // Go back to Dashboard
  };

  const removePage = (index) => {
    setPages(pages.filter((_, i) => i !== index));
  };

  const startOver = () => {
    setPages([]);
    setImage(null);
    setStep(1);
    stopCamera();
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Camera API is not supported in this browser or requires a secure (HTTPS) connection.");
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setStream(mediaStream);
      setIsCameraOpen(true);
    } catch (err) {
      alert("Could not access camera. Please check permissions.");
    }
  };

  useEffect(() => {
    if (isCameraOpen && stream && videoRef.current) {
        videoRef.current.srcObject = stream;
    }
  }, [isCameraOpen, stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setImage(canvas.toDataURL('image/jpeg'));
      setStep(2);
      stopCamera();
    }
  };

  const applyFormat = (command) => {
    document.execCommand(command, false, null);
  };

  return (
    <div className="container">
      <header className="text-center py-10 animate-fade-in">
        <h1 className="text-5xl font-extrabold text-white mb-2 tracking-tight">
          Scanner<span className="text-indigo-500">Text</span>
        </h1>
        <p className="text-slate-400 text-lg">Halaman Utama & Editor Word Layout</p>
      </header>

      {step > 1 && <StepIndicator step={step} />}

      <main className="glass-panel p-8 min-h-[500px] flex flex-col items-center justify-start relative overflow-hidden transition-all duration-500">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: DASHBOARD (MAIN PAGE) */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center">
              
              {/* Scan / Upload Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mb-12">
                <button 
                    className="glass-button justify-center py-6 text-xl rounded-3xl bg-indigo-600 hover:bg-indigo-500"
                    onClick={startCamera}
                >
                    <Camera size={32} /> Scan Document
                </button>
                <button 
                    className="glass-button justify-center py-6 text-xl rounded-3xl secondary-button bg-slate-800 hover:bg-slate-700"
                    onClick={() => fileInputRef.current.click()}
                >
                    <Upload size={32} /> Upload Image
                </button>
                <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" accept="image/*" />
              </div>

              {/* Settings Overlay */}
              <div className="flex gap-4 mb-12 flex-wrap justify-center">
                 <div className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-2xl">
                    <span className="text-slate-400 text-sm font-bold uppercase tracking-widest px-2">OCR</span>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-slate-900 text-white border-none rounded-xl p-2 text-sm">
                      <option value="ind+eng">ID + EN</option>
                      <option value="deu">German</option>
                      <option value="ind+eng+deu">All</option>
                    </select>
                 </div>
                 <div className="flex items-center gap-4 bg-slate-800/80 p-3 px-5 rounded-2xl">
                    <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Table Mode</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={isTableMode} onChange={(e) => setIsTableMode(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                 </div>
              </div>

              {/* DOCUMENT PREVIEW (IF ANY) */}
              {pages.length > 0 && (
                <div className="w-full">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Files className="text-indigo-400" /> Recent Scans ({pages.length})
                    </h2>
                    <div className="flex gap-2">
                        <button className="p-3 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all" onClick={() => exportToPdf(pages.map(p => p.text))} title="Download PDF">
                            <Download size={24} />
                        </button>
                        <button className="p-3 bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl transition-all" onClick={() => exportToDocx(pages.map(p => p.text))} title="Download Word">
                            <FileText size={24} />
                        </button>
                    </div>
                  </div>
                  
                  <div className="dashboard-grid">
                    {pages.map((page, idx) => (
                      <div key={idx} className="relative group bg-slate-900/60 rounded-3xl p-4 border border-slate-700/50 transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10">
                        <img src={page.image} className="w-full h-48 object-cover rounded-2xl mb-4" />
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-500 uppercase">Page {idx + 1}</span>
                            <div className="flex gap-2">
                                <button onClick={() => removePage(idx)} className="p-2 text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>
                            </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-12 pt-8 border-t border-slate-800 text-center">
                    <button className="text-slate-500 hover:text-white text-sm underline underline-offset-4" onClick={startOver}>Clear Project</button>
                  </div>
                </div>
              )}
              
              {pages.length === 0 && (
                <div className="text-center py-20 bg-slate-900/40 rounded-[2rem] border-2 border-dashed border-slate-800 w-full max-w-2xl">
                    <p className="text-slate-500 text-lg">No documents yet. Start scanning above!</p>
                </div>
              )}
            </motion.div>
          )}

          {/* CAMERA OVERLAY */}
          {isCameraOpen && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
               <video ref={videoRef} autoPlay playsInline className="w-full max-w-2xl h-auto rounded-3xl bg-slate-900 shadow-2xl" />
               <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-full max-w-md aspect-[3/4] border-2 border-indigo-400/50 rounded-xl"></div>
               </div>
               <div className="mt-8 flex gap-6 z-10">
                  <button className="p-4 rounded-full bg-slate-800 text-white" onClick={stopCamera}><X size={32} /></button>
                  <button className="p-6 rounded-full bg-indigo-500 text-white scale-110 shadow-2xl shadow-indigo-500/50" onClick={capturePhoto}>
                    <div className="w-8 h-8 rounded-full border-4 border-white"></div>
                  </button>
               </div>
            </div>
          )}

          {/* STEP 2: CROP */}
          {step === 2 && image && (
            <motion.div key="step2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full flex flex-col">
              <div className="relative h-[500px] w-full mb-8 bg-black/50 overflow-hidden rounded-3xl border border-slate-700">
                <Cropper image={image} crop={crop} zoom={zoom} onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} />
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4 text-white bg-slate-800/50 p-3 px-6 rounded-2xl">
                  <span className="text-sm font-bold uppercase tracking-tighter">Zoom</span>
                  <input type="range" value={zoom} min={1} max={3} step={0.1} onChange={(e) => setZoom(e.target.value)} className="w-40 accent-indigo-500" />
                </div>
                <div className="flex gap-4">
                  <button className="glass-button secondary-button" onClick={() => setStep(1)}>Cancel</button>
                  <button className="glass-button px-8" onClick={handleApplyCrop}><Scissors size={20} /> Process Page</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: OCR PROCESSING */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center">
              <div className="relative mb-10">
                 <Loader2 className="text-indigo-500 animate-spin" size={80} />
                 <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-white">{ocrProgress}%</div>
              </div>
              <h3 className="text-4xl font-extrabold text-white mb-2">{ocrProgress < 15 ? "Optimizing..." : "Scanning..."}</h3>
              <p className="text-slate-400 mb-8 max-w-xs">{ocrProgress < 15 ? "Improving contrast & clarity" : "Extracting digital text from image"}</p>
              <div className="w-64 h-3 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <motion.div className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]" initial={{ width: 0 }} animate={{ width: `${ocrProgress}%` }} />
              </div>
            </motion.div>
          )}

          {/* STEP 4: EDITOR (WORD LAYOUT PREVIEW) */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full flex flex-col items-center h-full">
              
              <div className="flex justify-between items-center w-full max-w-[800px] mb-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Edit3 className="text-indigo-400" /> Edit Scanned Result
                </h3>
                <button className="glass-button bg-green-600 hover:bg-green-500" onClick={saveCurrentPage}>
                    <CheckCircle size={18} /> Finish & Save
                </button>
              </div>

              {/* Formatting Toolbar */}
              <div className="toolbar">
                  <button className="toolbar-btn" onClick={() => applyFormat('bold')} title="Bold"><Bold size={18} /></button>
                  <button className="toolbar-btn" onClick={() => applyFormat('italic')} title="Italic"><Italic size={18} /></button>
                  <div className="w-[1px] h-6 bg-slate-700 mx-1 self-center"></div>
                  <button className="toolbar-btn" onClick={() => applyFormat('insertUnorderedList')} title="Bullet List"><List size={18} /></button>
              </div>

              {/* Word Layout Preview Container */}
              <div className="paper-container custom-scrollbar">
                  <div 
                    ref={editorRef}
                    contentEditable
                    className="paper-page"
                    suppressContentEditableWarning={true}
                  >
                    {ocrResult}
                  </div>
              </div>

              <div className="mt-6 flex justify-between w-full max-w-[800px] text-slate-500 text-xs uppercase font-bold tracking-widest">
                <span>Font: Inter (Word Standard)</span>
                <span>Editable Area</span>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <footer className="mt-12 text-center text-slate-600 pb-10">
        <p>&copy; 2026 Professional Document Scanner Dashboard</p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f1; }
      `}</style>
    </div>
  );
}
