import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface VideoPlayerProps {
  isTracking: boolean;
  onToggleTracking: () => void;
  onVideoFrame: (frameData: string) => void;
  videoSrc?: string;
  autoPlay?: boolean;
}

export function VideoPlayer({ 
  isTracking, 
  onToggleTracking,
  onVideoFrame,
  videoSrc = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  autoPlay = true
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState("00:00");
  const [duration, setDuration] = useState("00:00");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [usingWebcam, setUsingWebcam] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();
  
  // Start or stop webcam based on tracking state
  useEffect(() => {
    if (isTracking && !usingWebcam) {
      startWebcam();
    } else if (!isTracking && usingWebcam) {
      stopWebcam();
    }
  }, [isTracking]);
  
  const startWebcam = async () => {
    try {
      // First check if we have permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoInput = devices.some(device => device.kind === 'videoinput');
      
      if (!hasVideoInput) {
        throw new Error("No video input devices found");
      }
      
      // Set a timeout to catch hanging permission requests
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Camera access request timed out")), 10000);
      });
      
      // Try to get the camera stream with a timeout
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false 
        }),
        timeoutPromise
      ]) as MediaStream;
      
      mediaStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Handle video events properly
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play()
              .then(() => {
                setUsingWebcam(true);
                setIsPlaying(true);
              })
              .catch(err => {
                console.error("Failed to play webcam:", err);
                throw new Error("Failed to start webcam playback");
              });
          }
        };
        
        videoRef.current.onerror = (e) => {
          console.error("Video element error:", e);
          throw new Error("Video element encountered an error");
        };
      }
      
      toast({
        title: "Camera Active",
        description: "Your webcam is now being used for attention tracking",
      });
    } catch (error) {
      console.error("Error accessing webcam:", error);
      
      let errorMessage = "Please allow camera access for attention tracking";
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = "Camera access was denied. Please grant permission in your browser.";
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage = "No camera was found on your device.";
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage = "Your camera is already in use by another application.";
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Camera Access Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // If webcam fails, revert tracking state
      onToggleTracking();
    }
  };
  
  const stopWebcam = () => {
    // First, stop all tracks to release the camera
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            console.error("Error stopping track:", e);
          }
        });
        mediaStreamRef.current = null;
      } catch (e) {
        console.error("Error stopping media stream:", e);
      }
    }
    
    // Then clean up the video element
    if (videoRef.current) {
      try {
        // Clear event handlers
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onerror = null;
        
        // Remove the stream from the video element
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        
        // Restore video source after webcam is stopped
        videoRef.current.src = videoSrc;
        videoRef.current.load();
        
        // Only auto-play if the video was playing before
        if (isPlaying) {
          videoRef.current.play().catch(err => {
            console.warn("Failed to play video after webcam stop:", err);
          });
        }
      } catch (e) {
        console.error("Error resetting video element:", e);
      }
    }
    
    setUsingWebcam(false);
    
    toast({
      title: "Tracking Stopped",
      description: "Your webcam has been turned off",
    });
  };
  
  // Clean up webcam on unmount
  useEffect(() => {
    return () => {
      // Make sure to properly clean up on component unmount
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (e) {
              console.error("Error stopping track during cleanup:", e);
            }
          });
          mediaStreamRef.current = null;
        } catch (e) {
          console.error("Error cleaning up media stream:", e);
        }
      }

      // Also clean video element references
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onerror = null;
      }
    };
  }, []);
  
  // Video time tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const updateTime = () => {
      if (!usingWebcam) {
        const current = formatTime(video.currentTime);
        const total = formatTime(video.duration);
        setCurrentTime(current);
        setDuration(total);
      }
    };
    
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateTime);
    
    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateTime);
    };
  }, [usingWebcam]);
  
  // Camera capture for tracking
  useEffect(() => {
    if (!isTracking) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    const captureInterval = setInterval(() => {
      try {
        // Make sure video is playing and has dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.warn("Video has no dimensions, skipping frame capture");
          return;
        }
        
        const context = canvas.getContext('2d');
        if (!context) {
          console.error("Failed to get canvas context");
          return;
        }
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        try {
          // Draw video frame to canvas
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert canvas to data URL
          const frameData = canvas.toDataURL('image/jpeg', 0.7);
          
          // Send frame data to parent component for processing
          onVideoFrame(frameData);
        } catch (err) {
          console.error("Error during frame capture:", err);
        }
      } catch (err) {
        console.error("Frame capture error:", err);
      }
    }, 1000); // Capture every second
    
    return () => {
      clearInterval(captureInterval);
    };
  }, [isTracking, onVideoFrame]);
  
  const togglePlay = () => {
    if (usingWebcam) return; // Don't toggle play when using webcam
    
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };
  
  const toggleFullscreen = () => {
    const videoContainer = document.getElementById('video-container');
    if (!videoContainer) return;
    
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
  
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "00:00";
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div id="video-container" className="bg-black rounded-lg overflow-hidden shadow-lg relative" style={{ aspectRatio: "16/9" }}>
      <video 
        ref={videoRef}
        className="w-full h-full object-contain"
        src={videoSrc}
        autoPlay={autoPlay}
        playsInline
      />
      
      {/* Hidden canvas for video processing */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Video Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex justify-between items-center">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            className="text-white hover:text-primary-light mr-4 p-1 h-auto"
            onClick={togglePlay}
          >
            <span className="material-icons">
              {isPlaying ? "pause" : "play_arrow"}
            </span>
          </Button>
          
          <div className="text-white text-sm font-medium">
            <span>{currentTime}</span> / <span>{duration}</span>
          </div>
        </div>
        
        <div className="flex items-center">
          <Button 
            onClick={onToggleTracking}
            className={`px-3 py-1.5 rounded flex items-center transition-colors focus:outline-none focus:ring-2 ${
              isTracking 
                ? "bg-red-500 hover:bg-red-600 focus:ring-red-500/50" 
                : "bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-500/50"
            } text-white`}
          >
            <span className="material-icons mr-1">
              {isTracking ? "visibility_off" : "visibility"}
            </span>
            <span>
              {isTracking ? "Stop Tracking" : "Start Tracking"}
            </span>
          </Button>
          
          <Button 
            variant="ghost" 
            className="text-white hover:text-primary-light ml-4 p-1 h-auto"
            onClick={toggleFullscreen}
          >
            <span className="material-icons">
              {isFullscreen ? "fullscreen_exit" : "fullscreen"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
