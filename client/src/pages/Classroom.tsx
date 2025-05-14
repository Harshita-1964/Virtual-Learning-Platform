import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { VideoPlayer } from "@/components/VideoPlayer";
import { TrackingPanel } from "@/components/TrackingPanel";
import { useAuth } from "@/hooks/useAuth";
import { useAttentionTracking } from "@/hooks/useAttentionTracking";
import { Subject, getSubjects, isUserEnrolled } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Classroom() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const subjectIdNum = parseInt(subjectId);
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [currentSubject, setCurrentSubject] = useState<Subject | null>(null);

  const { 
    isTracking, 
    metrics, 
    error,
    flaskServerAvailable,
    toggleTracking, 
    processVideoFrame,
    checkFlaskServer
  } = useAttentionTracking(user?.id || 0, subjectIdNum);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      setLocation("/");
      return;
    }

    // Check if user is enrolled in this subject
    const checkEnrollment = async () => {
      try {
        const enrolled = await isUserEnrolled(user.id, subjectIdNum);
        setIsEnrolled(enrolled);
        
        if (!enrolled) {
          toast({
            title: "Access Denied",
            description: "You are not enrolled in this subject",
            variant: "destructive",
          });
          setLocation("/dashboard");
        }
      } catch (error) {
        console.error("Failed to check enrollment:", error);
        toast({
          title: "Error",
          description: "Failed to verify enrollment status",
          variant: "destructive",
        });
      }
    };
    
    checkEnrollment();
  }, [user, subjectIdNum, setLocation, toast]);

  // Fetch subject details
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ['/api/subjects'],
    enabled: !!user,
  });

  // Find current subject
  useEffect(() => {
    if (subjects && subjects.length > 0) {
      const subject = subjects.find((s) => s.id === subjectIdNum);
      setCurrentSubject(subject || null);
    }
  }, [subjects, subjectIdNum]);

  // Update date and time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000); // every minute
    
    return () => clearInterval(interval);
  }, []);

  const handleBackToDashboard = () => {
    setLocation("/dashboard");
  };

  const handleViewResults = () => {
    setLocation(`/results/${subjectId}`);
  };
  
  const handleTrackAttention = () => {
    // Start the tracking if not already tracking
    if (!isTracking) {
      toggleTracking();
    }
    // After a short delay, navigate to results page
    setTimeout(() => {
      setLocation(`/results/${subjectId}`);
    }, 500);
  };

  if (!user || !isEnrolled || !currentSubject) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-primary text-white shadow-md">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              className="mr-4 p-1 rounded-full hover:bg-primary-dark focus:outline-none text-white"
              onClick={handleBackToDashboard}
            >
              <span className="material-icons">arrow_back</span>
            </Button>
            <h1 className="text-xl font-bold">
              {currentSubject.name} - Live Class
            </h1>
          </div>
          
          <div className="flex items-center text-sm">
            <div className="flex items-center mr-4">
              <span className="material-icons mr-1 text-red-400">fiber_manual_record</span>
              <span>LIVE</span>
            </div>
            <div>
              <span>{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Classroom Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Video Stream (Main Content) */}
          <div className="lg:col-span-3">
            {/* Video Player */}
            <VideoPlayer 
              isTracking={isTracking}
              onToggleTracking={toggleTracking}
              onVideoFrame={processVideoFrame}
              videoSrc="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
              autoPlay={false}
            />
            
            {/* Lecture Information */}
            <Card className="mt-6">
              <CardContent className="pt-6">
                <h2 className="text-xl font-semibold mb-4">Current Lecture</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Machine Learning Fundamentals</h3>
                    <p className="text-gray-600">
                      Today we're covering the basic principles of machine learning, including supervised
                      and unsupervised learning techniques. We'll explore decision trees, neural networks,
                      and practical applications in Python.
                    </p>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="mr-6">
                      <span className="font-medium">Instructor:</span> {currentSubject.facultyName}
                    </div>
                    <div>
                      <span className="font-medium">Date:</span> {currentDateTime.toLocaleDateString()}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="pt-4">
                    <h4 className="font-medium mb-2">Resources</h4>
                    <ul className="space-y-2">
                      <li>
                        <Button variant="link" className="p-0 h-auto flex items-center text-primary">
                          <span className="material-icons mr-2 text-sm">description</span>
                          <span>Lecture Slides (PDF)</span>
                        </Button>
                      </li>
                      <li>
                        <Button variant="link" className="p-0 h-auto flex items-center text-primary">
                          <span className="material-icons mr-2 text-sm">code</span>
                          <span>Code Examples (GitHub)</span>
                        </Button>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Attentiveness Tracking Panel */}
          <div className="lg:col-span-1">
            <TrackingPanel 
              isTracking={isTracking}
              metrics={metrics}
              subjectId={subjectIdNum}
              onViewResults={handleViewResults}
              onTrack={handleTrackAttention}
              flaskServerAvailable={flaskServerAvailable}
              error={error}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
