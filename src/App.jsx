import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, 
  Camera, 
  Scissors, 
  FileText, 
  Download, 
  CheckCircle, 
  Loader2,
  X,
  Bold,
  Italic,
  List,
  Edit3,
  Files,
  Trash2,
  Lock,
  Unlock
} from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { motion, AnimatePresence } from 'framer-motion';
import { performOCR } from './utils/ocrService';
import { exportToDocx } from './utils/exportService';
import { exportToPdf } from './utils/pdfService';

// --- Step Indicator ---
const StepIndicator = ({ step }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', marginBottom:'2rem' }}>
    {[1, 2, 3, 4].map((i) => (
      <React.Fragment key={i}>
        <div style={{
          width: '2rem', height: '2rem', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.875rem', fontWeight: 'bold',
          background: step === i ? '#6366f1' : step > i ? '#22c55e' : '#334155',
          color: 'white',
          transition: 'all 0.3s',
          animation: step === i ? 'pulse 2s infinite' : 'none'
        }}>
          {step > i ? <CheckCircle size={16} /> : i}
        </div>
        {i < 4 && (
          <div style={{
            height: '4px', width: '2rem', borderRadius: '4px',
            background: step > i ? '#6366f1' : '#334155',
            transition: 'all 0.3s'
          }} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// --- Main App ---
export default function App() {
  const [step, setStep] = useState(1);
  const [pages, setPages] = useState([]);
  const [image, setImage] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [crop, setCrop] = useState({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
  const [completedCrop, setCompletedCrop] = useState(null);
  const [aspectLock, setAspectLock] = useState(null); // null = free
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
  const imgRef = useRef(null);

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

  const getCroppedImg = async (imgEl, pixelCrop) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Gagal membuat canvas context.');
    const scaleX = imgEl.naturalWidth / imgEl.width;
    const scaleY = imgEl.naturalHeight / imgEl.height;
    canvas.width = Math.round(pixelCrop.width * scaleX);
    canvas.height = Math.round(pixelCrop.height * scaleY);
    ctx.drawImage(
      imgEl,
      Math.round(pixelCrop.x * scaleX),
      Math.round(pixelCrop.y * scaleY),
      Math.round(pixelCrop.width * scaleX),
      Math.round(pixelCrop.height * scaleY),
      0, 0,
      canvas.width,
      canvas.height
    );
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const handleApplyCrop = async () => {
    if (!completedCrop || !imgRef.current) {
      alert('Sesuaikan area crop terlebih dahulu.');
      return;
    }
    try {
      const croppedBase64 = await getCroppedImg(imgRef.current, completedCrop);
      if (!croppedBase64) {
        alert('Gagal memproses crop. Silakan coba lagi.');
        return;
      }
      setCroppedImage(croppedBase64);
      setStep(3);
      runOCR(croppedBase64);
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat crop: ' + e.message);
    }
  };

  const setAspectPreset = (label, ratio) => {
    setAspectLock(ratio);
    if (ratio) {
      setCrop(prev => ({ ...prev, aspect: ratio }));
    } else {
      setCrop(prev => {
        const newCrop = { ...prev };
        delete newCrop.aspect;
        return newCrop;
      });
    }
  };

  const resetCrop = () => {
    setAspectLock(null);
    setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
  };

  const runOCR = async (imgSource) => {
    setIsProcessing(true);
    setOcrProgress(0);
    try {
      const text = await performOCR(imgSource, language, setOcrProgress, isTableMode);
      setOcrResult(text);
      setStep(4);
    } catch (e) {
      alert('OCR Gagal. Silakan coba lagi.');
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
    setStep(1);
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
      alert("Camera API tidak didukung di browser ini atau membutuhkan koneksi HTTPS.");
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
      alert("Tidak dapat mengakses kamera. Periksa izin kamera.");
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

  // --- Styles ---
  const S = {
    header: {
      textAlign: 'center',
      paddingTop: '2.5rem',
      paddingBottom: '2.5rem',
      animation: 'fadeIn 0.5s ease forwards'
    },
    h1: {
      fontSize: '3rem',
      fontWeight: '900',
      color: 'white',
      margin: '0 0 0.5rem 0',
      letterSpacing: '-0.02em',
      fontFamily: "'Poppins', sans-serif"
    },
    subtitle: {
      color: '#94a3b8',
      fontSize: '1rem',
      margin: 0
    },
    main: {
      background: 'rgba(255,255,255,0.05)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '1.5rem',
      padding: '2rem',
      minHeight: '500px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      position: 'relative',
      overflow: 'hidden'
    },
    btnGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '1rem',
      width: '100%',
      maxWidth: '600px',
      marginBottom: '2rem'
    },
    btnPrimary: {
      background: '#6366f1',
      color: 'white',
      border: 'none',
      padding: '1.5rem 1rem',
      borderRadius: '1.5rem',
      fontWeight: '600',
      fontSize: '1.1rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      boxShadow: '0 4px 15px rgba(99,102,241,0.4)',
      transition: 'all 0.2s'
    },
    btnSecondary: {
      background: '#1e293b',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.1)',
      padding: '1.5rem 1rem',
      borderRadius: '1.5rem',
      fontWeight: '600',
      fontSize: '1.1rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      transition: 'all 0.2s'
    },
    settingsRow: {
      display: 'flex',
      gap: '1rem',
      marginBottom: '2rem',
      flexWrap: 'wrap',
      justifyContent: 'center'
    },
    settingCard: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      background: 'rgba(30,41,59,0.8)',
      padding: '0.75rem 1.25rem',
      borderRadius: '1rem'
    },
    settingLabel: {
      color: '#94a3b8',
      fontSize: '0.75rem',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.1em'
    },
    select: {
      background: '#0f172a',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem',
      cursor: 'pointer'
    },
    emptyState: {
      textAlign: 'center',
      padding: '5rem 2rem',
      background: 'rgba(15,23,42,0.4)',
      borderRadius: '2rem',
      border: '2px dashed #1e293b',
      width: '100%',
      maxWidth: '600px'
    },
    emptyText: {
      color: '#64748b',
      fontSize: '1.1rem',
      margin: 0
    },
    // Camera overlay
    cameraOverlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      background: 'black',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    },
    video: {
      width: '100%',
      maxWidth: '42rem',
      height: 'auto',
      borderRadius: '1.5rem',
      background: '#0f172a',
      boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
    },
    captureBtn: {
      padding: '1.5rem',
      borderRadius: '50%',
      background: '#6366f1',
      color: 'white',
      border: 'none',
      cursor: 'pointer',
      boxShadow: '0 0 30px rgba(99,102,241,0.5)',
      display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    },
    // Step 2
    cropContainer: {
      width: '100%',
      marginBottom: '1.5rem',
      background: '#0f172a',
      overflow: 'auto',
      borderRadius: '1.5rem',
      border: '1px solid #334155',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: '1rem',
      maxHeight: '75vh',
    },
    cropControls: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      flexWrap: 'wrap'
    },
    // Step 3
    step3wrap: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      width: '100%'
    },
    progressBar: {
      width: '16rem',
      height: '0.75rem',
      background: '#1e293b',
      borderRadius: '9999px',
      overflow: 'hidden',
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
    },
    // Step 4
    editorHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      maxWidth: '800px',
      marginBottom: '1.5rem'
    },
    // Recent scans
    scansHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1.5rem',
      width: '100%'
    }
  };

  return (
    <div className="container">
      <header style={S.header}>
        <h1 style={S.h1}>
          Scanner<span style={{ color: '#6366f1' }}>Text</span>
        </h1>
        <p style={S.subtitle}>Halaman Utama &amp; Editor Word Layout</p>
      </header>

      {step > 1 && <StepIndicator step={step} />}

      <main style={S.main}>
        <AnimatePresence mode="wait">

          {/* STEP 1: DASHBOARD */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              {/* Action Buttons */}
              <div style={S.btnGrid}>
                <button style={S.btnPrimary} onClick={startCamera}
                  onMouseOver={e => e.currentTarget.style.background='#4f46e5'}
                  onMouseOut={e => e.currentTarget.style.background='#6366f1'}>
                  <Camera size={28} /> Scan Document
                </button>
                <button style={S.btnSecondary} onClick={() => fileInputRef.current.click()}
                  onMouseOver={e => e.currentTarget.style.background='#334155'}
                  onMouseOut={e => e.currentTarget.style.background='#1e293b'}>
                  <Upload size={28} /> Upload Image
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onFileChange}
                  style={{ display: 'none' }}
                  accept="image/*"
                />
              </div>

              {/* Settings */}
              <div style={S.settingsRow}>
                <div style={S.settingCard}>
                  <span style={S.settingLabel}>OCR</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} style={S.select}>
                    <option value="ind+eng">ID + EN</option>
                    <option value="deu">German</option>
                    <option value="ind+eng+deu">All</option>
                  </select>
                </div>
                <div style={S.settingCard}>
                  <span style={S.settingLabel}>Table Mode</span>
                  <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isTableMode}
                      onChange={(e) => setIsTableMode(e.target.checked)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div style={{
                      width: '2.75rem', height: '1.5rem',
                      background: isTableMode ? '#6366f1' : '#334155',
                      borderRadius: '9999px',
                      position: 'relative',
                      transition: 'background 0.3s'
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: isTableMode ? 'calc(100% - 22px)' : '2px',
                        width: '1.25rem', height: '1.25rem',
                        background: 'white',
                        borderRadius: '50%',
                        transition: 'left 0.3s'
                      }} />
                    </div>
                  </label>
                </div>
              </div>

              {/* Recent Scans */}
              {pages.length > 0 && (
                <div style={{ width: '100%' }}>
                  <div style={S.scansHeader}>
                    <h2 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Files style={{ color: '#818cf8' }} size={22} /> Recent Scans ({pages.length})
                    </h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => exportToPdf(pages.map(p => p.text))}
                        title="Download PDF"
                        onMouseOver={e => { e.currentTarget.style.background='#ef4444'; e.currentTarget.style.color='white'; }}
                        onMouseOut={e => { e.currentTarget.style.background='rgba(239,68,68,0.15)'; e.currentTarget.style.color='#f87171'; }}
                      >
                        <Download size={20} />
                      </button>
                      <button
                        style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'none', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => exportToDocx(pages.map(p => p.text))}
                        title="Download Word"
                        onMouseOver={e => { e.currentTarget.style.background='#3b82f6'; e.currentTarget.style.color='white'; }}
                        onMouseOut={e => { e.currentTarget.style.background='rgba(59,130,246,0.15)'; e.currentTarget.style.color='#60a5fa'; }}
                      >
                        <FileText size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="dashboard-grid">
                    {pages.map((page, idx) => (
                      <div key={idx} className="page-card">
                        <img src={page.image} style={{ width: '100%', height: '12rem', objectFit: 'cover', borderRadius: '1rem', marginBottom: '1rem' }} alt={`Page ${idx + 1}`} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Page {idx + 1}</span>
                          <button onClick={() => removePage(idx)} style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', borderRadius: '0.5rem' }}
                            onMouseOver={e => e.currentTarget.style.color='#f87171'}
                            onMouseOut={e => e.currentTarget.style.color='#64748b'}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #1e293b', textAlign: 'center' }}>
                    <button style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={startOver}
                      onMouseOver={e => e.currentTarget.style.color='white'}
                      onMouseOut={e => e.currentTarget.style.color='#64748b'}>
                      Clear Project
                    </button>
                  </div>
                </div>
              )}

              {pages.length === 0 && (
                <div style={S.emptyState}>
                  <p style={S.emptyText}>Belum ada dokumen. Mulai scan di atas!</p>
                </div>
              )}
            </motion.div>
          )}

          {/* CAMERA OVERLAY */}
          {isCameraOpen && (
            <div style={S.cameraOverlay}>
              <video ref={videoRef} autoPlay playsInline style={S.video} />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '16rem', aspectRatio: '3/4', border: '2px solid rgba(129,140,248,0.5)', borderRadius: '1rem' }} />
              </div>
              <div style={{ marginTop: '2rem', display: 'flex', gap: '1.5rem', zIndex: 10 }}>
                <button style={{ padding: '1rem', borderRadius: '50%', background: '#1e293b', color: 'white', border: 'none', cursor: 'pointer' }} onClick={stopCamera}>
                  <X size={28} />
                </button>
                <button style={S.captureBtn} onClick={capturePhoto}>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '4px solid white' }} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CROP */}
          {step === 2 && image && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
            >
              {/* Aspect Ratio Presets */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', alignSelf: 'center', marginRight: '0.25rem' }}>Rasio:</span>
                {[
                  { label: 'Bebas', ratio: undefined },
                  { label: 'A4 Portrait', ratio: 1 / Math.SQRT2 },
                  { label: 'A4 Landscape', ratio: Math.SQRT2 },
                  { label: '4:3', ratio: 4 / 3 },
                  { label: '1:1', ratio: 1 },
                ].map(({ label, ratio }) => (
                  <button
                    key={label}
                    onClick={() => setAspectPreset(label, ratio)}
                    style={{
                      padding: '0.35rem 0.85rem',
                      borderRadius: '0.5rem',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      background: aspectLock === ratio ? '#6366f1' : 'rgba(30,41,59,0.8)',
                      color: aspectLock === ratio ? 'white' : '#94a3b8',
                      transition: 'all 0.2s'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Crop Area */}
              <div style={S.cropContainer}>
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c, percentCrop) => setCompletedCrop(c)}
                  aspect={aspectLock}
                  minWidth={30}
                  minHeight={30}
                  keepSelection
                  ruleOfThirds
                  style={{ maxWidth: '100%' }}
                >
                  <img
                    ref={imgRef}
                    src={image}
                    alt="Source"
                    style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }}
                    onLoad={() => {
                      // Set initial crop covering 90% of image
                      setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
                    }}
                  />
                </ReactCrop>
              </div>

              {/* Controls */}
              <div style={S.cropControls}>
                <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
                  💡 Drag sudut/tepi kotak untuk resize • Drag dalam kotak untuk pindahkan
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="glass-button secondary-button" onClick={() => setStep(1)}>Cancel</button>
                  <button className="glass-button secondary-button" onClick={resetCrop}>Reset</button>
                  <button className="glass-button" style={{ padding: '0.75rem 2rem' }} onClick={handleApplyCrop}>
                    <Scissors size={20} /> Process Page
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: OCR PROCESSING */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={S.step3wrap}>
              <div style={{ position: 'relative', marginBottom: '2.5rem' }}>
                <Loader2 style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} size={80} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '900', color: 'white' }}>
                  {ocrProgress}%
                </div>
              </div>
              <h3 style={{ fontSize: '2.5rem', fontWeight: '900', color: 'white', margin: '0 0 0.5rem 0', fontFamily: "'Poppins', sans-serif" }}>
                {ocrProgress < 15 ? "Optimizing..." : "Scanning..."}
              </h3>
              <p style={{ color: '#94a3b8', marginBottom: '2rem', maxWidth: '20rem', textAlign: 'center' }}>
                {ocrProgress < 15 ? "Meningkatkan kontras & kejernihan" : "Mengekstrak teks dari gambar"}
              </p>
              <div style={S.progressBar}>
                <motion.div
                  style={{ height: '100%', background: '#6366f1', boxShadow: '0 0 15px rgba(99,102,241,0.5)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${ocrProgress}%` }}
                />
              </div>
            </motion.div>
          )}

          {/* STEP 4: EDITOR */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

              <div style={S.editorHeader}>
                <h3 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Edit3 style={{ color: '#818cf8' }} size={22} /> Edit Hasil Scan
                </h3>
                <button className="glass-button" style={{ background: '#16a34a' }} onClick={saveCurrentPage}
                  onMouseOver={e => e.currentTarget.style.background='#15803d'}
                  onMouseOut={e => e.currentTarget.style.background='#16a34a'}>
                  <CheckCircle size={18} /> Finish &amp; Save
                </button>
              </div>

              {/* Formatting Toolbar */}
              <div className="toolbar">
                <button className="toolbar-btn" onClick={() => applyFormat('bold')} title="Bold"><Bold size={18} /></button>
                <button className="toolbar-btn" onClick={() => applyFormat('italic')} title="Italic"><Italic size={18} /></button>
                <div style={{ width: '1px', height: '1.5rem', background: '#334155', margin: '0 4px', alignSelf: 'center' }} />
                <button className="toolbar-btn" onClick={() => applyFormat('insertUnorderedList')} title="Bullet List"><List size={18} /></button>
              </div>

              {/* Word Layout Editor */}
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

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '800px', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                <span>Font: Inter (Word Standard)</span>
                <span>Editable Area</span>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <footer style={{ marginTop: '3rem', textAlign: 'center', color: '#475569', paddingBottom: '2.5rem' }}>
        <p>&copy; 2026 Professional Document Scanner Dashboard</p>
      </footer>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f1; }
        .page-card {
          background: rgba(15,23,42,0.6);
          border-radius: 1.5rem;
          padding: 1rem;
          border: 1px solid rgba(51,65,85,0.5);
          transition: all 0.2s;
        }
        .page-card:hover {
          border-color: rgba(99,102,241,0.5);
          box-shadow: 0 10px 30px rgba(99,102,241,0.1);
        }
        .ReactCrop__crop-selection {
          border: 1.5px solid #6366f1 !important;
          box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.7) !important;
        }
        .ReactCrop__drag-handle {
          width: 14px !important;
          height: 14px !important;
        }
        .ReactCrop__drag-handle::after {
          background: #6366f1 !important;
          border: 2.5px solid white !important;
          width: 14px !important;
          height: 14px !important;
          border-radius: 4px !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
        }
        .ReactCrop__drag-bar { 
          background: transparent !important; 
        }
        .ReactCrop__rule-of-thirds-vt::before, .ReactCrop__rule-of-thirds-vt::after,
        .ReactCrop__rule-of-thirds-hz::before, .ReactCrop__rule-of-thirds-hz::after {
          background-color: rgba(255, 255, 255, 0.2) !important;
        }
        .ReactCrop { border-radius: 0.75rem; overflow: hidden; background: #000; }
      `}</style>
    </div>
  );
}
