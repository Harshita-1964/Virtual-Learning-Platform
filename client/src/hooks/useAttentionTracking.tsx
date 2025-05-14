import { useState, useEffect, useCallback, useRef } from "react";
import { processFrame, getTrackingResults, resetTracking, saveTrackingResults, checkFlaskServer as apiCheckFlaskServer } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface TrackingMetrics {
  eyeMovements: number;
  eyeBlinks: number;
  postureChanges: number;
  attentivenessScore: number;
  facialExpression?: string;
}

export const useAttentionTracking = (userId: number, subjectId: number) => {
  const [isTracking, setIsTracking] = useState(false);
  const [metrics, setMetrics] = useState<TrackingMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flaskServerAvailable, setFlaskServerAvailable] = useState(false);
  const serverCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Check if Flask server is available via Express proxy
  const checkFlaskServer = useCallback(async () => {
    try {
      const isAvailable = await apiCheckFlaskServer();
      setFlaskServerAvailable(isAvailable);
      return isAvailable;
    } catch (err) {
      console.error("Flask server check failed:", err);
      setFlaskServerAvailable(false);
      return false;
    }
  }, []);

  // Check Flask server on component mount
  useEffect(() => {
    checkFlaskServer();
    
    // Periodically check server availability
    serverCheckTimeoutRef.current = setInterval(() => {
      checkFlaskServer();
    }, 10000); // Check every 10 seconds
    
    return () => {
      if (serverCheckTimeoutRef.current) {
        clearInterval(serverCheckTimeoutRef.current);
      }
    };
  }, [checkFlaskServer]);

  const startTracking = useCallback(async () => {
    try {
      // Check if Flask server is available before starting
      const isServerAvailable = await checkFlaskServer();
      
      if (!isServerAvailable) {
        throw new Error("Attention tracking server is not available. Please try again later.");
      }
      
      // Reset tracking before starting
      await resetTracking();
      setIsTracking(true);
      setError(null);
      setMetrics(null);
      
      toast({
        title: "Tracking Started",
        description: "Your attention metrics are now being monitored",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start tracking";
      setError(errorMessage);
      toast({
        title: "Tracking Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      return false;
    }
    
    return true;
  }, [toast, checkFlaskServer]);

  const stopTracking = useCallback(async () => {
    if (!isTracking) return;
    
    try {
      setIsTracking(false);
      
      // Get final tracking results
      const results = await getTrackingResults();
      
      console.log("Final tracking results:", results);
      
      // Save results to backend
      await saveTrackingResults(userId, subjectId, results);
      
      // Force a reload to update metrics display
      setTimeout(() => {
        // This will trigger a reload of tracking results on the Results page
        window.dispatchEvent(new CustomEvent('tracking-completed', { 
          detail: { userId, subjectId }
        }));
      }, 500);
      
      toast({
        title: "Tracking Stopped",
        description: "Your attention metrics have been saved",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to stop tracking";
      setError(errorMessage);
      toast({
        title: "Tracking Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [isTracking, userId, subjectId, toast]);

  const toggleTracking = useCallback(async () => {
    if (isTracking) {
      await stopTracking();
      return false;
    } else {
      return await startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  const processVideoFrame = useCallback(async (frameData: string) => {
    if (!isTracking || !frameData) return;
    
    try {
      const frameResults = await processFrame(frameData);
      
      // Update metrics with the results from the frame processing
      // Be more resilient to field name variations by providing fallbacks
      setMetrics({
        eyeMovements: frameResults.eye_movement_count || 0,
        eyeBlinks: frameResults.blink_count || 0,
        postureChanges: frameResults.posture_change_count || 0,
        attentivenessScore: frameResults.attentiveness_score || 85,
        facialExpression: frameResults.facial_expression || 'neutral',
      });
      
      // Log metrics for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('Current tracking metrics:', {
          eyeMovements: frameResults.eye_movement_count || 0,
          eyeBlinks: frameResults.blink_count || 0,
          postureChanges: frameResults.posture_change_count || 0,
        });
      }
    } catch (err) {
      console.error("Frame processing error:", err);
      // Don't show toast for every frame error to avoid spamming the user
    }
  }, [isTracking]);

  // Clean up tracking on unmount
  useEffect(() => {
    return () => {
      if (isTracking) {
        stopTracking();
      }
      
      if (serverCheckTimeoutRef.current) {
        clearInterval(serverCheckTimeoutRef.current);
      }
    };
  }, [isTracking, stopTracking]);

  return {
    isTracking,
    metrics,
    error,
    flaskServerAvailable,
    toggleTracking,
    processVideoFrame,
    stopTracking,
    checkFlaskServer,
  };
}
    