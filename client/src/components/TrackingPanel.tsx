import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { TrackingMetrics } from "@/hooks/useAttentionTracking";
import { useEffect, useState } from "react";

interface TrackingPanelProps {
  isTracking: boolean;
  metrics: TrackingMetrics | null;
  subjectId: number;
  onViewResults: () => void;
  onTrack: () => void;
  flaskServerAvailable?: boolean;
  error?: string | null;
}

export function TrackingPanel({ 
  isTracking, 
  metrics, 
  subjectId, 
  onViewResults,
  onTrack,
  flaskServerAvailable = true,
  error = null
}: TrackingPanelProps) {
  const [_, setLocation] = useLocation();
  const [webcamStatus, setWebcamStatus] = useState<'ready' | 'active' | 'error'>('ready');
  
  // Update webcam status based on tracking state
  useEffect(() => {
    if (isTracking) {
      setWebcamStatus('active');
    } else {
      setWebcamStatus('ready');
    }
    
    if (error) {
      setWebcamStatus('error');
    }
  }, [isTracking, error]);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold">Attention Tracking</CardTitle>
      </CardHeader>
      
      <CardContent>
        {/* Server Status */}
        {!flaskServerAvailable && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="text-sm">
              Attention tracking system is currently unavailable. Please try again later.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Tracking Status */}
        <div className="bg-gray-100 rounded-md p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <span 
                className={`material-icons mr-2 ${
                  isTracking ? "text-green-500" : "text-gray-500"
                }`}
              >
                {isTracking ? "visibility" : "pending"}
              </span>
              <span className="font-medium">
                {isTracking ? "Tracking Active" : "Not Tracking"}
              </span>
            </div>
            
            <Button 
              variant="link" 
              className="text-primary hover:text-primary-dark flex items-center p-0"
              disabled={!metrics}
              onClick={onViewResults}
            >
              <span>View Results</span>
              <span className="material-icons ml-1">analytics</span>
            </Button>
          </div>
          
          {/* System Status Indicators */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="flex items-center text-xs">
              <span className={`w-2 h-2 rounded-full mr-2 ${flaskServerAvailable ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span>OpenCV: {flaskServerAvailable ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="flex items-center text-xs">
              <span className={`w-2 h-2 rounded-full mr-2 ${
                webcamStatus === 'active' ? 'bg-green-500' : 
                webcamStatus === 'ready' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></span>
              <span>Webcam: {
                webcamStatus === 'active' ? 'Active' : 
                webcamStatus === 'ready' ? 'Ready' : 'Error'
              }</span>
            </div>
          </div>
        </div>
        
        {/* Error Message */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="text-sm">
              {error}
            </AlertDescription>
          </Alert>
        )}
        
        {/* Live Metrics (Hidden until tracking is active) */}
        {isTracking && metrics && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Eye Movement</h3>
              <Progress value={Math.min(metrics.eyeMovements / 2, 100)} className="h-2" />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Eye Blinks</h3>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-semibold">{metrics.eyeBlinks}</span>
                <span className="text-xs text-gray-500">Normal: 15-30 per min</span>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Posture Changes</h3>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-semibold">{metrics.postureChanges}</span>
                <span className="text-xs text-gray-500">
                  {metrics.facialExpression && `Expression: ${metrics.facialExpression}`}
                </span>
              </div>
            </div>
            
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Attentiveness Score</h3>
              <div className="flex items-center">
                <span className="text-3xl font-semibold text-green-600">{metrics.attentivenessScore}%</span>
                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                  {metrics.attentivenessScore > 80 ? "Excellent" : 
                   metrics.attentivenessScore > 60 ? "Good" : 
                   metrics.attentivenessScore > 40 ? "Average" : "Poor"}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* How Tracking Works */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">How Tracking Works</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start">
              <span className="material-icons mr-2 text-primary text-base">visibility</span>
              <span>We use computer vision to analyze your attention patterns</span>
            </li>
            <li className="flex items-start">
              <span className="material-icons mr-2 text-primary text-base">face</span>
              <span>Facial expressions and eye movements are analyzed in real-time</span>
            </li>
            <li className="flex items-start">
              <span className="material-icons mr-2 text-primary text-base">camera</span>
              <span>Your camera is only used during active tracking</span>
            </li>
            <li className="flex items-start">
              <span className="material-icons mr-2 text-primary text-base">lock</span>
              <span>All processing happens locally - your privacy is protected</span>
            </li>
          </ul>
        </div>
      </CardContent>
      
      <CardFooter className="pt-0">
        <Button 
          onClick={onTrack}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2"
          disabled={!flaskServerAvailable || webcamStatus === 'error'}
        >
          <span className="material-icons mr-2">assessment</span>
          Track My Attention
        </Button>
      </CardFooter>
    </Card>
  );
}
