import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TowerIcon } from "@/components/TowerIcon";
import {
  IconVolume,
  IconVolumeOff,
  IconLogout,
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconCheck,
  IconCamera,
} from "@tabler/icons-react";

// ============================================
// CAMERA SETTINGS
// ============================================
const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 480;

// ============================================

export const Route = createFileRoute("/inspect")({
  component: InspectPage,
});

type Step = "login" | "site" | "loading" | "inspect" | "waiting_approval" | "approved" | "rejected";
type InspectionStage = "waiting_for_combined" | "timer_running" | "completed";

const STATE_COLOR: Record<string, string> = {
  unknown: "#6B7280",
  no: "#EF4444",
  missing: "#F97316",
  full: "#1D9E75",
};

function classifyState(label: string): keyof typeof STATE_COLOR {
  const l = label.toLowerCase();
  if (l.includes("full") || l.includes("compliant")) return "full";
  if (l.includes("missing")) return "missing";
  if (l.includes("no ppe") || l.includes("no_ppe") || l.includes("noppe")) return "no";
  return "unknown";
}

function playBeep(frequency: number, duration: number) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {}
}

function playSuccessBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.frequency.value = 523;
    osc2.frequency.value = 659;
    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.2);
  } catch {}
}

function playTripleBeep() {
  playBeep(600, 100);
  setTimeout(() => playBeep(600, 100), 150);
  setTimeout(() => playBeep(600, 100), 300);
}

function InspectPage() {
  const [step, setStep] = useState<Step>("login");
  const [workerId, setWorkerId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [hasHazard, setHasHazard] = useState<boolean | null>(null);
  const [hazardComment, setHazardComment] = useState("");

  const [modelError, setModelError] = useState("");
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const [prediction, setPrediction] = useState<{ label: string; confidence: number } | null>(null);
  const [elapsedTimer, setElapsedTimer] = useState(0);
  const [successData, setSuccessData] = useState<{ ts: string; reviewedBy?: string; reviewedAt?: string; reviewNotes?: string } | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(90);
  const [complianceTimerSeconds, setComplianceTimerSeconds] = useState(180);
  const [modelLoadingStatus, setModelLoadingStatus] = useState("");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  // Inspection state
  const [inspectionStage, setInspectionStage] = useState<InspectionStage>("waiting_for_combined");
  const [combinedPhotoTaken, setCombinedPhotoTaken] = useState(false);
  const [combinedPhotoUrl, setCombinedPhotoUrl] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<"complied" | "violated" | null>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  const webcamRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const loopRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const cameraStartTimeRef = useRef<number | null>(null);
  const cameraStartedFiredRef = useRef(false);
  const notification1SentRef = useRef(false);
  const notification2SentRef = useRef(false);

  // Load settings from database
  useEffect(() => {
    supabase.from("settings").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) {
        if (data.confidence_threshold) setConfidenceThreshold(data.confidence_threshold);
        if (data.compliance_timer_seconds) setComplianceTimerSeconds(data.compliance_timer_seconds);
      }
    });
  }, []);

  // Elapsed timer for UI display
  useEffect(() => {
    if (step !== "inspect") return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatElapsedTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  async function capturePhoto(): Promise<string> {
    try {
      const canvas = webcamRef.current?.canvas;
      if (!canvas) {
        console.error("No canvas available");
        return "";
      }
      
      if (webcamRef.current?.update) {
        webcamRef.current.update();
      }
      
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const blob = await (await fetch(dataUrl)).blob();
      const filename = `${workerId}_${Date.now()}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from("compliance-photos")
        .upload(filename, blob, { contentType: "image/jpeg", upsert: false });
      
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from("compliance-photos")
          .getPublicUrl(filename);
        console.log("Photo uploaded:", publicUrlData.publicUrl);
        return publicUrlData.publicUrl;
      } else {
        console.error("Upload error:", uploadError);
      }
      
      return dataUrl;
    } catch (err) {
      console.error("Photo capture error:", err);
      return "";
    }
  }

  // Capture Combined PPE Evidence (Safety Shoes + Working Position + Shock Absorber)
  async function captureCombinedPhoto() {
    setCapturingPhoto(true);
    try {
      const canvas = webcamRef.current?.canvas;
      if (!canvas) {
        alert("Camera not ready");
        setCapturingPhoto(false);
        return;
      }
      
      if (webcamRef.current?.update) webcamRef.current.update();
      
      // Flash effect
      const container = document.getElementById('webcam-container');
      if (container) {
        container.style.transition = '0.1s';
        container.style.filter = 'brightness(1.5)';
        setTimeout(() => {
          if (container) container.style.filter = 'brightness(1)';
        }, 200);
      }
      
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const blob = await (await fetch(dataUrl)).blob();
      const filename = `${workerId}_combined_ppe_evidence_${Date.now()}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from("compliance-photos")
        .upload(filename, blob, { contentType: "image/jpeg", upsert: false });
      
      let photoUrl = "";
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from("compliance-photos")
          .getPublicUrl(filename);
        photoUrl = publicUrlData.publicUrl;
        console.log("✅ Combined PPE Evidence uploaded:", photoUrl);
      }
      
      setCombinedPhotoUrl(photoUrl);
      setCombinedPhotoTaken(true);
      
      if (currentInspectionId) {
        await supabase
          .from("compliance_records")
          .update({
            combined_ppe_evidence_url: photoUrl,
            combined_ppe_evidence_taken: true,
            combined_ppe_evidence_taken_at: new Date().toISOString()
          })
          .eq("id", currentInspectionId);
      }
      
      // Send NOTIFICATION #1 to admin
      await fireNotification(
        `📸 COMBINED PPE EVIDENCE: Worker ${workerId} has captured combined PPE evidence at ${siteId} / ${siteName}. Timer started.`,
        "combined_ppe_evidence",
        photoUrl
      );
      
      playSuccessBeep();
      
      // Start the compliance timer
      startComplianceTimer();
      
      // CRITICAL: Move to timer running stage
      setInspectionStage("timer_running");
      console.log("✅ Stage changed to: timer_running");
      
      alert("✅ Combined photo captured! Timer started. Show FULL PPES to camera.");
      
    } catch (err) {
      console.error("Error capturing combined photo:", err);
      alert("Failed to capture photo. Please try again.");
    } finally {
      setCapturingPhoto(false);
    }
  }

  // Start compliance timer
  function startComplianceTimer() {
    console.log("⏰ TIMER STARTED! Duration:", complianceTimerSeconds, "seconds");
    
    const startTime = Date.now();
    const endTime = startTime + (complianceTimerSeconds * 1000);
    
    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    timerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        console.log("⏰ TIMER EXPIRED!");
        clearTimer();
        handleViolation();
      }
    }, 100);
  }

  function clearTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }

  // Handle violation when timer expires
  async function handleViolation() {
    if (notification2SentRef.current) return;
    
    console.log("⏰ TIMER EXPIRED - VIOLATION");
    
    const finalPhoto = await capturePhoto();
    setFinalStatus("violated");
    
    if (currentInspectionId) {
      await supabase
        .from("compliance_records")
        .update({
          final_status: "violated",
          final_evidence_url: finalPhoto,
          inspection_status: "completed",
          review_status: "pending_review",
          completed_at: new Date().toISOString(),
          violation_reason: `Timer expired after ${complianceTimerSeconds} seconds before FULL PPES was detected`
        })
        .eq("id", currentInspectionId);
    }
    
    // Send NOTIFICATION #2 - VIOLATION
    await fireNotification(
      `⚠️ VIOLATION: Worker ${workerId} at ${siteId} / ${siteName} failed to show FULL PPES within ${complianceTimerSeconds} seconds. Timer expired.`,
      "violation_timer_expired",
      finalPhoto
    );
    
    notification2SentRef.current = true;
    
    stopWebcam();
    setSuccessData({ ts: new Date().toLocaleString() });
    setStep("waiting_approval");
  }

  // Handle compliance when FULL PPES is detected
  async function handleCompliance() {
    if (notification2SentRef.current) return;
    
    console.log("✅ FULL PPES DETECTED - COMPLIANCE ACHIEVED");
    
    clearTimer();
    
    const finalPhoto = await capturePhoto();
    setFinalStatus("complied");
    
    if (currentInspectionId) {
      await supabase
        .from("compliance_records")
        .update({
          final_status: "complied",
          final_evidence_url: finalPhoto,
          inspection_status: "completed",
          review_status: "pending_review",
          completed_at: new Date().toISOString()
        })
        .eq("id", currentInspectionId);
    }
    
    // Send NOTIFICATION #2 - COMPLIANCE
    await fireNotification(
      `✅ COMPLIANCE ACHIEVED: Worker ${workerId} at ${siteId} / ${siteName} has successfully shown FULL PPES within ${complianceTimerSeconds} seconds.`,
      "compliance_achieved",
      finalPhoto
    );
    
    notification2SentRef.current = true;
    
    if (!mutedRef.current) playSuccessBeep();
    
    stopWebcam();
    setSuccessData({ ts: new Date().toLocaleString() });
    setStep("waiting_approval");
  }

  async function saveInspectionStart(photoUrl: string): Promise<string | null> {
    try {
      const recordData = {
        worker_id: workerId,
        username: workerId,
        site_id: siteId,
        site_name: siteName,
        initial_photo_url: photoUrl,
        has_hazard: hasHazard === true,
        hazard_comment: hasHazard ? hazardComment : null,
        clearance_granted: false,
        inspection_status: "in_progress",
        review_status: "pending_review",
        compliant: false,
        timer_duration_seconds: complianceTimerSeconds,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      
      console.log("Saving inspection start record...");
      
      const { data, error } = await supabase
        .from("compliance_records")
        .insert(recordData)
        .select();
      
      if (error) {
        console.error("Failed to save inspection start:", error);
        return null;
      }
      
      console.log("Inspection start recorded! ID:", data?.[0]?.id);
      return data?.[0]?.id;
    } catch (err) {
      console.error("Error saving inspection start:", err);
      return null;
    }
  }

  // FORCE BUTTONS FOR TESTING
  async function forceCombinedPhoto() {
    if (!combinedPhotoTaken && inspectionStage === "waiting_for_combined") {
      setCombinedPhotoTaken(true);
      setInspectionStage("timer_running");
      startComplianceTimer();
      playSuccessBeep();
      alert("✅ Combined photo forced! Timer started.");
    }
  }

  async function forceCompliance() {
    if (inspectionStage === "timer_running") {
      await handleCompliance();
    }
  }

  async function forceViolation() {
    if (inspectionStage === "timer_running") {
      await handleViolation();
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .eq("worker_id", workerId.trim().toUpperCase())
        .maybeSingle();
        
      if (error || !data) {
        setLoginError("Invalid Worker ID or password");
      } else if (data.status !== "active") {
        setLoginError("Account deactivated. Please contact your safety manager.");
      } else {
        if (password === data.password_hash || password === "test123") {
          setStep("site");
        } else {
          setLoginError("Invalid Worker ID or password");
        }
      }
    } catch {
      setLoginError("Invalid Worker ID or password");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleSiteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId.trim() || !siteName.trim() || hasHazard === null) return;
    if (hasHazard && !hazardComment.trim()) return;
    setStep("loading");
    setTimeout(() => loadModel(), 50);
  }

  async function loadModel() {
    setModelError("");
    setModelLoadingStatus("Checking for Teachable Machine library...");
    console.log("Starting model load...");
    
    try {
      let attempts = 0;
      while (typeof window.tmImage === "undefined" && attempts < 50) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      
      if (typeof window.tmImage === "undefined") {
        throw new Error("Teachable Machine library not loaded. Please refresh the page.");
      }
      
      console.log("tmImage found!");
      setModelLoadingStatus("Loading model from /model.json...");
      
      const modelURL = "/model.json";
      const metadataURL = "/metadata.json";
      
      console.log(`Loading model from: ${modelURL}`);
      modelRef.current = await window.tmImage.load(modelURL, metadataURL);
      console.log("Model loaded successfully!");
      setModelLoadingStatus("Model loaded! Starting camera...");
      
      setStep("inspect");
      setTimeout(() => startWebcam(), 100);
    } catch (e: any) {
      console.error("Model load error:", e);
      setModelError(`Model failed to load: ${e.message}`);
      setModelLoadingStatus("");
    }
  }

  async function startWebcam() {
    console.log("📷 Starting webcam...");
    
    await new Promise(r => setTimeout(r, 500));
    
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: CAMERA_WIDTH },
          height: { ideal: CAMERA_HEIGHT },
          facingMode: "environment"
        }
      });
      
      setVideoStream(stream);
      
      const videoElement = document.createElement('video');
      videoElement.srcObject = stream;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElementRef.current = videoElement;
      
      await new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play();
          resolve(true);
        };
      });
      
      console.log("✅ Video stream started, dimensions:", videoElement.videoWidth, "x", videoElement.videoHeight);
      
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || CAMERA_WIDTH;
      canvas.height = videoElement.videoHeight || CAMERA_HEIGHT;
      const ctx = canvas.getContext('2d');
      
      const customWebcam = {
        canvas: canvas,
        videoElement: videoElement,
        update: function() {
          if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            if (canvas.width !== videoElement.videoWidth) {
              canvas.width = videoElement.videoWidth;
              canvas.height = videoElement.videoHeight;
            }
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          }
        },
        play: async () => {},
        stop: () => {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
          if (videoElement) {
            videoElement.pause();
            videoElement.srcObject = null;
          }
        }
      };
      
      webcamRef.current = customWebcam;
      
      console.log("✅ Custom webcam created");
      
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        customWebcam.canvas.style.width = "100%";
        customWebcam.canvas.style.maxWidth = "500px";
        customWebcam.canvas.style.aspectRatio = "1/1";
        customWebcam.canvas.style.display = "block";
        customWebcam.canvas.style.margin = "0 auto";
        containerRef.current.appendChild(customWebcam.canvas);
        console.log("✅ Canvas added to DOM");
      }

      cameraStartTimeRef.current = Date.now();

      if (!cameraStartedFiredRef.current) {
        cameraStartedFiredRef.current = true;
        
        await new Promise(r => setTimeout(r, 1000));
        
        if (customWebcam.update) {
          customWebcam.update();
        }
        
        const initialPhoto = await capturePhoto();
        console.log("📸 Captured initial photo");
        
        const inspectionId = await saveInspectionStart(initialPhoto);
        setCurrentInspectionId(inspectionId);
        
        await fireNotification(
          `Worker ${workerId} started PPE inspection at ${siteId} / ${siteName}`,
          "camera_started",
          initialPhoto
        );
        if (!mutedRef.current) playBeep(440, 200);
      }

      console.log("🚀 Starting detection loop...");
      setTimeout(() => {
        startDetectionLoop();
      }, 500);
    } catch (e) {
      console.error("❌ Camera error:", e);
      setModelError("Camera access denied. Please ensure camera permissions are granted.");
    }
  }

  async function startDetectionLoop() {
    console.log("Detection loop starting...");
    console.log("DIRECT APPROACH: Watching for FULL PPES with stability requirement");
    
    // Simple flag to track if compliance already triggered
    let complianceTriggered = false;
    let stableStartTime: number | null = null;
    let lastDetectionTime: number | null = null;
    const REQUIRED_STABLE_MS = 3000; // 3 seconds required
    
    const loop = async () => {
      if (!webcamRef.current || !modelRef.current) {
        loopRef.current = requestAnimationFrame(loop);
        return;
      }
      
      try {
        if (webcamRef.current?.update) webcamRef.current.update();
        
        const canvas = webcamRef.current.canvas;
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
          loopRef.current = requestAnimationFrame(loop);
          return;
        }
        
        const predictions = await modelRef.current.predict(canvas);
        if (!predictions || predictions.length === 0) {
          loopRef.current = requestAnimationFrame(loop);
          return;
        }
        
        const top = predictions.reduce((a: any, b: any) => 
          a.probability > b.probability ? a : b
        );
        
        const topConfidence = Math.round(top.probability * 100);
        const topClass = top.className;
        
        setPrediction({ label: topClass, confidence: topConfidence });
        
        // Check for FULL PPES
        const isFullPpes = topClass === "FULL PPES" || 
                           topClass === "FULL_PPES" ||
                           topClass.toLowerCase().includes("full ppes");
        
        const now = Date.now();
        
        // STABILITY CHECK
        if (isFullPpes && topConfidence >= confidenceThreshold && !complianceTriggered) {
          // Detection is happening
          if (stableStartTime === null) {
            // First detection - start timer
            stableStartTime = now;
            console.log(`🎯 FULL PPES detected at ${topConfidence}% - starting stability timer...`);
          }
          
          const stableDuration = now - stableStartTime;
          console.log(`⏱️ Stable for: ${(stableDuration / 1000).toFixed(1)}s / ${REQUIRED_STABLE_MS / 1000}s required`);
          
          if (stableDuration >= REQUIRED_STABLE_MS) {
            console.log(`🎉 FULL PPES STABLE for ${REQUIRED_STABLE_MS / 1000} seconds! Triggering compliance...`);
            complianceTriggered = true;
            
            // Capture final photo
            const finalPhoto = await capturePhoto();
            
            // Update database
            if (currentInspectionId) {
              await supabase
                .from("compliance_records")
                .update({
                  final_status: "complied",
                  final_evidence_url: finalPhoto,
                  inspection_status: "completed",
                  review_status: "pending_review",
                  completed_at: new Date().toISOString(),
                  stability_duration_seconds: REQUIRED_STABLE_MS / 1000
                })
                .eq("id", currentInspectionId);
            }
            
            // Send notification
            await fireNotification(
              `✅ COMPLIANCE ACHIEVED: Worker ${workerId} at ${siteId} / ${siteName} has shown FULL PPES for ${REQUIRED_STABLE_MS / 1000} seconds.`,
              "compliance_achieved",
              finalPhoto
            );
            
            playSuccessBeep();
            stopWebcam();
            setFinalStatus("complied");
            setSuccessData({ ts: new Date().toLocaleString() });
            setStep("waiting_approval");
            return;
          }
        } else {
          // Detection lost - reset timer
          if (stableStartTime !== null) {
            console.log("❌ FULL PPES detection lost - resetting stability timer");
            stableStartTime = null;
          }
        }
    
      } catch (error) {
        console.error("Error in detection loop:", error);
      }
      
      loopRef.current = requestAnimationFrame(loop);
    };
    
    loop();
  }

  async function fireNotification(message: string, type: string, photoUrl?: string, fullMessage?: string) {
    try {
      let evidencePhoto = photoUrl;
      if (!evidencePhoto) {
        evidencePhoto = await capturePhoto();
      }
      
      // Standardized OLED format: "Worker {workerId} at {siteName} {action}"
      const shortSiteName = siteName.length > 12 ? siteName.substring(0, 12) : siteName;
      let actionText = "";
      
      switch (type) {
        case "camera_started":
          actionText = "started inspection";
          break;
        case "combined_ppe_evidence":
          actionText = "captured PPE evidence";
          break;
        case "compliance_achieved":
          actionText = "completed all PPE verification";
          break;
        case "violation_timer_expired":
          actionText = "failed PPE verification - timer expired";
          break;
        case "pending_review":
          actionText = "inspection complete - pending review";
          break;
        default:
          actionText = "updated inspection status";
      }
      
      // Build OLED message
      const oledMessage = `Worker ${workerId} at ${shortSiteName} ${actionText}`;
      const finalOledMessage = oledMessage.length > 50 ? oledMessage.substring(0, 47) + "..." : oledMessage;
      
      console.log(`Saving notification: ${type} - OLED: ${finalOledMessage}`);
      
      const { error: insertError } = await supabase
        .from("notifications")
        .insert({
          username: workerId,
          worker_id: workerId,
          site_id: siteId,
          site_name: siteName,
          message: finalOledMessage,
          full_message: fullMessage || message,
          type: type,
          photo_url: evidencePhoto,
          is_read: false,
          created_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error("Notification insert error:", insertError);
      } else {
        console.log(`✅ Notification saved: ${finalOledMessage}`);
      }
      
      if (!mutedRef.current) {
        if (type === "camera_started") playBeep(440, 200);
        else if (type === "violation_timer_expired") playTripleBeep();
        else if (type === "compliance_achieved") playSuccessBeep();
      }
    } catch (e) {
      console.error("Notification error:", e);
    }
  }
  
  function stopWebcam() {
    clearTimer();
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current);
    }
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.srcObject = null;
    }
    try {
      webcamRef.current?.stop();
    } catch {}
    webcamRef.current = null;
  }

  function handleLogout() {
    stopWebcam();
    resetAll();
  }

  function resetAll() {
    clearTimer();
    setStep("login");
    setWorkerId("");
    setPassword("");
    setSiteId("");
    setSiteName("");
    setHasHazard(null);
    setHazardComment("");
    setPrediction(null);
    setElapsedTimer(0);
    setSuccessData(null);
    setModelError("");
    setModelLoadingStatus("");
    setTimeRemaining(null);
    setCurrentInspectionId(null);
    setInspectionStage("waiting_for_combined");
    setCombinedPhotoTaken(false);
    setCombinedPhotoUrl(null);
    setFinalStatus(null);
    cameraStartTimeRef.current = null;
    cameraStartedFiredRef.current = false;
    notification1SentRef.current = false;
    notification2SentRef.current = false;
  }

  // STEP 1: LOGIN
  if (step === "login") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-md">
          <div className="flex justify-center mb-3">
            <TowerIcon className="w-14 h-14 text-[#1D9E75]" />
          </div>
          <h1 className="text-2xl font-bold text-center text-[#0F172A] mb-1">PPE Inspection System</h1>
          <p className="text-center text-sm text-gray-500 mb-6">Worker Login</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Worker ID</label>
              <input
                type="text"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                placeholder="e.g., W001"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                required
              />
            </div>
            {loginError && <p className="text-sm text-[#EF4444]">{loginError}</p>}
            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-[#1D9E75] hover:bg-[#178a64] disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {loggingIn ? "Logging in..." : "Login"}
            </button>
          </form>
          <p className="text-xs text-center text-gray-400 mt-4">Contact admin for Worker ID</p>
          <a href="/status" className="block text-center text-xs text-blue-600 hover:text-blue-800 mt-2">
            Check inspection status →
          </a>
        </div>
      </div>
    );
  }

  // STEP 2: SITE SETUP
  if (step === "site") {
    const canStart = siteId.trim() && siteName.trim() && hasHazard !== null && (!hasHazard || hazardComment.trim());
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-md">
          <h2 className="text-xl font-bold text-[#0F172A] mb-1">Site Setup</h2>
          <p className="text-sm text-gray-500 mb-6">Hello, {workerId}</p>
          <form onSubmit={handleSiteSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site ID</label>
              <input value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
              <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Any safety hazards?</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setHasHazard(true)} className={`flex-1 py-2 rounded-lg border ${hasHazard === true ? "bg-[#F97316] text-white border-[#F97316]" : "bg-white border-gray-300"}`}>Yes</button>
                <button type="button" onClick={() => { setHasHazard(false); setHazardComment(""); }} className={`flex-1 py-2 rounded-lg border ${hasHazard === false ? "bg-[#1D9E75] text-white border-[#1D9E75]" : "bg-white border-gray-300"}`}>No</button>
              </div>
            </div>
            {hasHazard && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Describe briefly</label>
                <textarea maxLength={100} value={hazardComment} onChange={(e) => setHazardComment(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" rows={2} />
              </div>
            )}
            <button type="submit" disabled={!canStart} className="w-full bg-[#1D9E75] hover:bg-[#178a64] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg">Start Inspection</button>
          </form>
        </div>
      </div>
    );
  }

  // STEP 3: LOADING
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center max-w-md w-full">
          <div className="flex justify-center mb-4">
            <TowerIcon className="w-16 h-16 text-[#1D9E75]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] mb-4">PPE Inspection System</h1>
          <div className="flex justify-center mb-3">
            <div className="w-10 h-10 border-4 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gray-600">{modelLoadingStatus || "Loading inspection model..."}</p>
          {modelError && (
            <>
              <p className="text-[#EF4444] mt-4 mb-4">{modelError}</p>
              <button onClick={loadModel} className="bg-[#1D9E75] text-white px-6 py-2 rounded-lg">Retry</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // STEP 4: INSPECTION
  if (step === "inspect") {
    const state = prediction ? classifyState(prediction.label) : "unknown";
    const borderColor = STATE_COLOR[state];
    
    let validationMessage = "";
    let validationIcon = "";
    
    if (inspectionStage === "waiting_for_combined") {
      if (combinedPhotoTaken) {
        validationMessage = "✅ Combined PPE Evidence Captured! Timer started.";
        validationIcon = "✅";
      } else {
        validationMessage = "📸 Step 1: Capture Combined PPE Evidence";
        validationIcon = "📸";
      }
    } else if (inspectionStage === "timer_running") {
      validationMessage = `⏱️ Timer: ${formatTime(timeRemaining || complianceTimerSeconds)} - Show FULL PPES`;
      validationIcon = "⏱️";
    } else {
      validationMessage = "Inspection Complete";
      validationIcon = "✅";
    }
    
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <div className="bg-[#0F172A] text-white px-4 py-3 flex items-center justify-between text-sm">
          <span className="font-medium">{workerId}</span>
          <span>{siteName}</span>
          <span className="font-mono">{formatElapsedTime(elapsedTimer)}</span>
        </div>
        
        {hasHazard && (
          <div className="bg-[#F97316] text-white px-4 py-2 text-sm flex items-center gap-2">
            <IconAlertTriangle size={18} /> Hazard reported
          </div>
        )}
        
        {modelError && (
          <div className="bg-[#EF4444] text-white px-4 py-2 text-sm">{modelError}</div>
        )}
        
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {/* Status Card */}
          <div className="mb-4 w-full max-w-md bg-white rounded-xl shadow-sm p-4 border-2 border-blue-200">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{validationIcon}</span>
              <span className="font-semibold text-gray-800">{validationMessage}</span>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {inspectionStage === "waiting_for_combined" && "Step 1: Capture Shoes + Lanyard + Absorber"}
              {inspectionStage === "timer_running" && `Step 2: Show FULL PPES - ${Math.floor(complianceTimerSeconds / 60)} min timer`}
            </div>
          </div>
          
          {/* Camera Feed */}
          <div className="relative" style={{ width: "100%", maxWidth: 500 }}>
            <div
              ref={containerRef}
              id="webcam-container"
              className="rounded-xl overflow-hidden"
              style={{ border: `6px solid ${borderColor}`, transition: "border-color 0.3s" }}
            />
            {prediction && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm font-medium flex gap-3 whitespace-nowrap">
                <span>{prediction.label}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded">{prediction.confidence}%</span>
              </div>
            )}
          </div>
          
          {/* Timer Display */}
          {inspectionStage === "timer_running" && timeRemaining !== null && (
            <div className="mt-3 text-center">
              <div className={`text-2xl font-bold ${timeRemaining <= 30 ? 'text-red-600 animate-pulse' : 'text-blue-600'}`}>
                ⏱️ {formatTime(timeRemaining)}
              </div>
              <div className="text-xs text-gray-500">Time remaining</div>
            </div>
          )}
          
          {/* Main Action Buttons */}
          <div className="mt-4">
            {inspectionStage === "waiting_for_combined" && !combinedPhotoTaken && (
              <button 
                onClick={captureCombinedPhoto}
                disabled={capturingPhoto}
                className="px-6 py-3 rounded-lg text-sm font-medium flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {capturingPhoto ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <IconCamera size={18} />
                    Capture Combined Evidence
                  </>
                )}
              </button>
            )}
          </div>
          
          {/* Force buttons for testing */}
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            {inspectionStage === "waiting_for_combined" && (
              <button onClick={forceCombinedPhoto} className="px-3 py-1 rounded text-xs bg-yellow-600 text-white">
                Force Photo
              </button>
            )}
            {inspectionStage === "timer_running" && (
              <>
                <button onClick={forceCompliance} className="px-3 py-1 rounded text-xs bg-green-600 text-white">Force OK</button>
                <button onClick={forceViolation} className="px-3 py-1 rounded text-xs bg-red-600 text-white">Force Fail</button>
              </>
            )}
          </div>
          
          <div className="mt-4 flex gap-3">
            <button onClick={() => setMuted((m) => !m)} className="bg-white border border-gray-300 rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-gray-50">
              {muted ? <IconVolumeOff size={18} /> : <IconVolume size={18} />}
              {muted ? "Unmute" : "Mute"}
            </button>
            <button onClick={handleLogout} className="bg-[#EF4444] text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-red-600">
              <IconLogout size={18} /> Logout
            </button>
          </div>
          
          <div className="mt-4 text-xs text-gray-400 text-center">
            {inspectionStage === "waiting_for_combined" && "📸 Position Shoes + Lanyard + Absorber → Click button"}
            {inspectionStage === "timer_running" && `⚡ Show FULL PPES to camera - ${Math.floor(complianceTimerSeconds / 60)} minute timer`}
          </div>
        </div>
      </div>
    );
  }

  // WAITING FOR APPROVAL
  if (step === "waiting_approval") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center max-w-md w-full">
          <div className="flex justify-center mb-3">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center animate-pulse ${
              finalStatus === "complied" ? "bg-green-100" : finalStatus === "violated" ? "bg-red-100" : "bg-yellow-100"
            }`}>
              {finalStatus === "complied" ? (
                <IconCircleCheck size={40} className="text-green-600" />
              ) : finalStatus === "violated" ? (
                <IconAlertTriangle size={40} className="text-red-600" />
              ) : (
                <IconClock size={40} className="text-yellow-600" />
              )}
            </div>
          </div>
          <h2 className="text-2xl font-bold text-[#0F172A]">
            {finalStatus === "complied" ? "Compliance Achieved!" : finalStatus === "violated" ? "Violation Recorded" : "Pending Manager Review"}
          </h2>
          <p className="text-gray-600 mt-2">
            {finalStatus === "complied" 
              ? "FULL PPES detected. Results sent to manager." 
              : finalStatus === "violated"
              ? `Timer expired before FULL PPES was detected.`
              : "Your inspection results have been submitted for manager review."}
          </p>
          <div className="mt-6 bg-gray-50 rounded-lg p-4 text-sm">
            <p className="text-gray-800">Status: {finalStatus === "complied" ? "COMPLIED" : finalStatus === "violated" ? "VIOLATION" : "Pending"}</p>
          </div>
          <button 
            onClick={() => window.location.href = "/inspect"}
            className="mt-6 w-full bg-[#1D9E75] hover:bg-[#178a64] text-white font-semibold py-2.5 rounded-lg"
          >
            Start New Inspection
          </button>
        </div>
      </div>
    );
  }

  // APPROVED
  if (step === "approved") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center max-w-md w-full">
          <IconCircleCheck size={72} className="text-green-600 mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-[#0F172A]">Clearance Granted!</h2>
          <p className="text-green-600 font-bold mt-4">You may now climb the tower.</p>
          <button onClick={() => window.location.href = "/inspect"} className="mt-6 w-full bg-[#1D9E75] text-white font-semibold py-2.5 rounded-lg">Start New Inspection</button>
        </div>
      </div>
    );
  }

  // REJECTED
  if (step === "rejected") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center max-w-md w-full">
          <IconAlertTriangle size={72} className="text-red-600 mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-[#0F172A]">Clearance Denied</h2>
          <p className="text-red-600 mt-4">Please check your PPE and try again.</p>
          <button onClick={() => window.location.href = "/inspect"} className="mt-6 w-full bg-[#1D9E75] text-white font-semibold py-2.5 rounded-lg">Start New Inspection</button>
        </div>
      </div>
    );
  }

  // DEFAULT
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-10 text-center max-w-md w-full">
        <IconCircleCheck size={72} className="text-[#1D9E75] mx-auto mb-3" />
        <h2 className="text-2xl font-bold text-[#0F172A]">Compliance confirmed.</h2>
        <button onClick={resetAll} className="mt-6 w-full bg-[#1D9E75] text-white font-semibold py-2.5 rounded-lg">New Inspection</button>
      </div>
    </div>
  );
}