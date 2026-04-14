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
  const [isHandwriting, setIsHandwriting] = useState(false);
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
      const text = await performOCR(imgSource, language, setOcrProgress, isTableMode, isHandwriting);
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
      paddingTop: '3.5rem',
      paddingBottom: '2.5rem',
    },
    h1: {
      fontSize: '4.2rem',
      fontWeight: '900',
      color: 'white',
      margin: '0 0 0.5rem 0',
      letterSpacing: '-0.04em',
      background: 'linear-gradient(to right, #fff, #818cf8)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      fontFamily: "'Outfit', sans-serif"
    },
    subtitle: {
      color: '#94a3b8',
      fontSize: '1.2rem',
      margin: 0,
      maxWidth: '650px',
      lineHeight: '1.6'
    },
    main: {
      background: 'rgba(15, 23, 42, 0.4)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '2.5rem',
      padding: '2.5rem',
      minHeight: '600px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
    },
    hero: {
      textAlign: 'center',
      marginBottom: '3.5rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.875rem'
    },
    tag: {
      background: 'rgba(99, 102, 241, 0.15)',
      color: '#818cf8',
      padding: '0.5rem 1.25rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '800',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      border: '1px solid rgba(99, 102, 241, 0.2)'
    },
    cardGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '2rem',
      width: '100%',
      maxWidth: '900px',
      marginBottom: '3.5rem'
    },
    actionCard: {
      background: 'rgba(30, 41, 59, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '2rem',
      padding: '2.5rem',
      cursor: 'pointer',
      textAlign: 'left',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden'
    },
    cardIcon: {
      width: '4rem',
      height: '4rem',
      borderRadius: '1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white'
    },
    cardTitle: {
      fontSize: '1.6rem',
      fontWeight: '900',
      color: 'white',
      margin: 0
    },
    cardDesc: {
      fontSize: '0.95rem',
      color: '#94a3b8',
      margin: 0,
      lineHeight: '1.6'
    },
    settingsRow: {
      display: 'flex',
      gap: '1.5rem',
      marginBottom: '3.5rem',
      flexWrap: 'wrap',
      justifyContent: 'center'
    },
    settingCard: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '1rem 2rem',
      borderRadius: '1.5rem',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    },
    settingLabel: {
      color: '#64748b',
      fontSize: '0.75rem',
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: '0.12em'
    },
    select: {
      background: 'transparent',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      padding: '0.25rem',
      fontSize: '1rem',
      fontWeight: '700',
      cursor: 'pointer',
      outline: 'none'
    },
    // Step 2
    cropContainer: {
      width: '100%',
      marginBottom: '2.5rem',
      background: '#020617',
      borderRadius: '2.5rem',
      border: '1px solid #1e293b',
      padding: '2rem',
      maxHeight: '70vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      boxShadow: 'inset 0 0 50px rgba(0,0,0,0.6)'
    },
    cropControls: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2rem',
      flexWrap: 'wrap',
      padding: '1.5rem',
      background: 'rgba(15, 23, 42, 0.8)',
      borderRadius: '2rem',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      width: '100%'
    },
    cropTip: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      color: '#818cf8',
      fontSize: '1rem',
      fontWeight: '700'
    },
    // Progress
    step3wrap: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      width: '100%',
      padding: '4rem 0'
    },
    progressBar: {
      width: '22rem',
      height: '12px',
      background: 'rgba(30, 41, 59, 0.6)',
      borderRadius: '9999px',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    },
    // Step 4
    editorHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      maxWidth: '850px',
      marginBottom: '2rem'
    },
    // Recent scans
    scansHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '2.5rem',
      width: '100%',
      padding: '0 0.75rem'
    }
  };

  return (
    <div className="container animate-fade-in">
      <header style={S.header}>
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
          <h1 style={S.h1}>ScannerText</h1>
          <p style={S.subtitle}>Ubah foto dokumen menjadi teks dengan akurasi tinggi dan layout profesional ala Word.</p>
        </motion.div>
      </header>

      {step > 1 && <StepIndicator step={step} />}

      <main style={S.main}>
        <AnimatePresence mode="wait">

          {/* STEP 1: DASHBOARD */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <div style={S.hero}>
                <motion.span 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={S.tag}
                >
                  Teknologi OCR Canggih
                </motion.span>
                <h2 style={{ color: 'white', fontSize: '2.5rem', fontWeight: '900', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Mulai Scan Sekarang</h2>
              </div>

              {/* Action Cards */}
              <div style={S.cardGrid}>
                <motion.div
                  style={S.actionCard}
                  whileHover={{ y: -12, background: 'rgba(30, 41, 59, 0.6)', borderColor: 'rgba(99, 102, 241, 0.4)' }}
                  onClick={startCamera}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div style={{ ...S.cardIcon, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)' }}>
                    <Camera size={32} />
                  </div>
                  <div>
                    <h3 style={S.cardTitle}>Scan Dokumen</h3>
                    <p style={S.cardDesc}>Ambil foto langsung menggunakan kamera perangkat Anda dengan panduan layout otomatis.</p>
                  </div>
                </motion.div>

                <motion.div
                  style={S.actionCard}
                  whileHover={{ y: -12, background: 'rgba(30, 41, 59, 0.6)', borderColor: 'rgba(168, 85, 247, 0.4)' }}
                  onClick={() => fileInputRef.current.click()}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div style={{ ...S.cardIcon, background: 'linear-gradient(135deg, #a855f7, #9333ea)', boxShadow: '0 10px 25px rgba(168, 85, 247, 0.4)' }}>
                    <Upload size={32} />
                  </div>
                  <div>
                    <h3 style={S.cardTitle}>Unggah Gambar</h3>
                    <p style={S.cardDesc}>Pilih file gambar (JPG, PNG) yang sudah ada di galeri atau folder perangkat Anda.</p>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={onFileChange} style={{ display: 'none' }} accept="image/*" />
                </motion.div>
              </div>

              {/* Settings */}
              <div style={S.settingsRow}>
                <div style={S.settingCard}>
                  <span style={S.settingLabel}>Bahasa OCR</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} style={S.select}>
                    <option value="ind+eng">Indo + English</option>
                    <option value="deu">German</option>
                    <option value="ind+eng+deu">Semua Bahasa</option>
                  </select>
                </div>
                <div style={S.settingCard}>
                  <span style={S.settingLabel}>Table Mode</span>
                  <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isTableMode} onChange={(e) => setIsTableMode(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                    <div style={{ width: '2.75rem', height: '1.5rem', background: isTableMode ? '#6366f1' : '#1e293b', borderRadius: '9999px', position: 'relative', transition: 'background 0.3s' }}>
                      <div style={{ position: 'absolute', top: '2px', left: isTableMode ? 'calc(100% - 22px)' : '2px', width: '1.25rem', height: '1.25rem', background: 'white', borderRadius: '50%', transition: 'left 0.3s' }} />
                    </div>
                  </label>
                </div>
                <div style={S.settingCard}>
                  <span style={S.settingLabel}>Tulisan Tangan</span>
                  <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isHandwriting} onChange={(e) => setIsHandwriting(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                    <div style={{ width: '2.75rem', height: '1.5rem', background: isHandwriting ? '#a855f7' : '#1e293b', borderRadius: '9999px', position: 'relative', transition: 'background 0.3s' }}>
                      <div style={{ position: 'absolute', top: '2px', left: isHandwriting ? 'calc(100% - 22px)' : '2px', width: '1.25rem', height: '1.25rem', background: 'white', borderRadius: '50%', transition: 'left 0.3s' }} />
                    </div>
                  </label>
                </div>
              </div>

              {/* Recent Scans */}
              {pages.length > 0 && (
                <div style={{ width: '100%', marginTop: '2rem' }}>
                  <div style={S.scansHeader}>
                    <h2 style={{ color: 'white', fontSize: '1.6rem', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: "'Outfit', sans-serif" }}>
                      <Files style={{ color: '#818cf8' }} size={26} /> Hasil Scan Terbaru ({pages.length})
                    </h2>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="glass-button secondary-button" style={{ padding: '0.75rem' }} onClick={() => exportToPdf(pages.map(p => p.text))} title="Download PDF">
                        <Download size={22} />
                      </button>
                      <button className="glass-button secondary-button" style={{ padding: '0.75rem' }} onClick={() => exportToDocx(pages.map(p => p.text))} title="Download Word">
                        <FileText size={22} />
                      </button>
                    </div>
                  </div>

                  <div className="dashboard-grid">
                    {pages.map((page, idx) => (
                      <motion.div 
                        key={idx} 
                        className="page-card"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.1 }}
                      >
                        <img src={page.image} style={{ width: '100%', height: '14rem', objectFit: 'cover', borderRadius: '1.5rem', marginBottom: '1.25rem' }} alt={`Halaman ${idx + 1}`} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Halaman {idx + 1}</span>
                          <button onClick={() => removePage(idx)} style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', borderRadius: '0.5rem' }}>
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div style={{ marginTop: '5rem', paddingBottom: '2rem', textAlign: 'center' }}>
                    <button style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }} onClick={startOver}>Mulai Ulang Proyek</button>
                  </div>
                </div>
              )}

              {pages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '5rem 0', opacity: 0.5 }}>
                  <p style={{ color: '#64748b', fontSize: '1.1rem' }}>Belum ada dokumen yang diproses.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* CAMERA OVERLAY */}
          {isCameraOpen && (
            <div style={{...S.cameraOverlay, background: 'rgba(2, 6, 23, 0.95)', backdropFilter: 'blur(10px)'}}>
              <video ref={videoRef} autoPlay playsInline style={S.video} />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '20rem', aspectRatio: '1/1.414', border: '2px solid rgba(129,140,248,0.8)', borderRadius: '1.5rem', boxShadow: '0 0 0 1000px rgba(2, 6, 23, 0.6)' }} />
              </div>
              <div style={{ position: 'absolute', bottom: '3rem', display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <button style={{ padding: '1.25rem', borderRadius: '50%', background: 'rgba(30, 41, 59, 0.8)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} onClick={stopCamera}>
                  <X size={32} />
                </button>
                <button style={S.captureBtn} onClick={capturePhoto}>
                  <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', border: '5px solid white' }} />
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', width: '100%' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', alignSelf: 'center', marginRight: '0.5rem' }}>Pilih Rasio:</span>
                  {[
                    { label: 'Bebas', ratio: undefined },
                    { label: 'A4 Portrait', ratio: 1 / Math.SQRT2 },
                    { label: 'A4 Landscape', ratio: Math.SQRT2 },
                  ].map(({ label, ratio }) => (
                    <button
                      key={label}
                      onClick={() => setAspectPreset(label, ratio)}
                      className="glass-button secondary-button"
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        background: aspectLock === ratio ? 'var(--primary)' : 'rgba(30,41,59,0.5)',
                        color: aspectLock === ratio ? 'white' : '#94a3b8',
                        borderColor: aspectLock === ratio ? 'var(--primary)' : 'var(--glass-border)'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button className="glass-button secondary-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={resetCrop}>Reset Area</button>
              </div>

              <div style={S.cropContainer}>
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectLock}
                  minWidth={50}
                  minHeight={50}
                  keepSelection
                  ruleOfThirds
                  style={{ maxHeight: '100%' }}
                >
                  <img
                    ref={imgRef}
                    src={image}
                    alt="Source"
                    style={{ maxHeight: '65vh', display: 'block', borderRadius: '0.5rem' }}
                    onLoad={() => {
                      setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
                    }}
                  />
                </ReactCrop>
              </div>

              <div style={S.cropControls}>
                <div style={S.cropTip}>
                  <div style={{ padding: '0.5rem', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '0.75rem' }}>
                    <Edit3 size={18} />
                  </div>
                  <div>
                    <span style={{ display: 'block' }}>Sesuaikan Area Dokumen</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '400', color: '#64748b' }}>Tarik sudut atau sisi kotak untuk hasil scan yang presisi.</span>
                  </div>
                </div>
                <div className="flex-center" style={{ gap: '1rem' }}>
                  <button className="glass-button secondary-button" style={{ padding: '1rem 1.5rem' }} onClick={() => setStep(1)}>Batal</button>
                  <button className="glass-button" style={{ padding: '1rem 3rem', fontSize: '1.1rem' }} onClick={handleApplyCrop}>
                    <CheckCircle size={22} /> Proses Hasil Scan
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: OCR PROCESSING */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={S.step3wrap}>
              <div style={{ position: 'relative', marginBottom: '3rem' }}>
                <Loader2 style={{ color: '#6366f1', animation: 'spin 1.5s linear infinite' }} size={100} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: '900', color: 'white' }}>
                  {ocrProgress}%
                </div>
              </div>
              <h3 style={{ fontSize: '2.5rem', fontWeight: '900', color: 'white', margin: '0 0 0.75rem 0' }}>
                {ocrProgress < 20 ? "Menginisialisasi..." : ocrProgress < 60 ? "Membaca Teks..." : "Merangkai Layout..."}
              </h3>
              <p style={{ color: '#94a3b8', marginBottom: '3rem', maxWidth: '30rem' }}>
                Kecerdasan buatan kami sedang mengekstrak teks dan mengenali format dokumen Anda. Mohon tunggu sebentar.
              </p>
              <div style={S.progressBar}>
                <motion.div
                  style={{ height: '100%', background: 'linear-gradient(to right, #6366f1, #a855f7)', boxShadow: '0 0 20px rgba(99,102,241,0.5)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${ocrProgress}%` }}
                />
              </div>
            </motion.div>
          )}

          {/* STEP 4: EDITOR */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

              <div style={S.editorHeader}>
                <div>
                  <h3 style={{ color: 'white', fontSize: '1.75rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Edit3 style={{ color: '#818cf8' }} size={28} /> Editor Hasil Scan
                  </h3>
                  <p style={{ color: '#94a3b8', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>Lakukan penyesuaian akhir sebelum menyimpan dokumen.</p>
                </div>
                <button className="glass-button" style={{ background: '#10b981', boxShadow: '0 10px 20px rgba(16,185,129,0.3)' }} onClick={saveCurrentPage}>
                  <CheckCircle size={20} /> Simpan Halaman
                </button>
              </div>

              {/* Formatting Toolbar */}
              <div className="toolbar animate-fade-in" style={{ animationDelay: '0.2s' }}>
                <button className="toolbar-btn" onClick={() => applyFormat('bold')} title="Tebal"><Bold size={20} /></button>
                <button className="toolbar-btn" onClick={() => applyFormat('italic')} title="Miring"><Italic size={20} /></button>
                <div style={{ width: '1px', height: '1.5rem', background: 'rgba(255,255,255,0.1)', margin: '0 8px', alignSelf: 'center' }} />
                <button className="toolbar-btn" onClick={() => applyFormat('insertUnorderedList')} title="Daftar Poin"><List size={20} /></button>
              </div>

              {/* Word Layout Editor */}
              <div className="paper-container animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <div
                  ref={editorRef}
                  contentEditable
                  className="paper-page custom-scrollbar"
                  suppressContentEditableWarning={true}
                  style={{ animation: 'none' }}
                >
                  {ocrResult}
                </div>
              </div>

              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '800px', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.1em' }}>
                <span>Format: Microsoft Word Standard (A4)</span>
                <span>Area Dapat Diedit</span>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <footer style={{ marginTop: '5rem', textAlign: 'center', color: '#475569', paddingBottom: '4rem' }}>
        <p style={{ fontSize: '0.875rem' }}>&copy; 2026 Professional Document Scanner &bull; Precision OCR Engine v5.0</p>
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
        /* ReactCrop Overrides for Side Handles */
        .ReactCrop__crop-selection {
          border: 2px solid #6366f1 !important;
          box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.75) !important;
        }

        .ReactCrop__drag-handle {
          width: 20px !important;
          height: 20px !important;
          background: #6366f1 !important;
          border: 3px solid white !important;
          border-radius: 50% !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
          opacity: 1 !important;
          transition: transform 0.2s !important;
        }
        .ReactCrop__drag-handle:hover {
          transform: scale(1.3);
          background: #818cf8 !important;
        }

        /* Side Handles (Bars) Styling */
        .ReactCrop__drag-bar { 
          background: transparent !important; 
        }
        .ReactCrop__drag-bar::after {
          content: "";
          position: absolute;
          background: #6366f1;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .ReactCrop__drag-bar:hover::after {
          opacity: 1;
        }

        .ReactCrop__drag-bar.ord-n::after, .ReactCrop__drag-bar.ord-s::after {
          height: 4px;
          left: 20px;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          border-radius: 2px;
        }
        .ReactCrop__drag-bar.ord-e::after, .ReactCrop__drag-bar.ord-w::after {
          width: 4px;
          top: 20px;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          border-radius: 2px;
        }

        .ReactCrop__rule-of-thirds-vt::before, .ReactCrop__rule-of-thirds-vt::after,
        .ReactCrop__rule-of-thirds-hz::before, .ReactCrop__rule-of-thirds-hz::after {
          background-color: rgba(255, 255, 255, 0.25) !important;
          box-shadow: none !important;
        }

        .ReactCrop { border-radius: 1rem; overflow: hidden; background: #000; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
      `}</style>
    </div>
  );
}
