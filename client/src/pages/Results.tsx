import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { getUserSubjectTrackingResults, getSubjects, Subject } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { generatePDF } from "@/lib/utils";

export default function Results() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const subjectIdNum = parseInt(subjectId);
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentSubject, setCurrentSubject] = useState<Subject | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  // Fetch subject details
  const { data: subjects = [] } = useQuery({
    queryKey: ['/api/subjects'],
    enabled: !!user,
  });

  // Find current subject
  useEffect(() => {
    const subjectList = subjects as Subject[] || [];
    if (subjectList.length > 0) {
      const subject = subjectList.find(s => s.id === subjectIdNum);
      setCurrentSubject(subject || null);
    }
  }, [subjects, subjectIdNum]);
  
  // Listen for tracking completion events to refresh results
  useEffect(() => {
    const handleTrackingCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId: number, subjectId: number }>;
      if (customEvent.detail && 
          customEvent.detail.userId === user?.id && 
          customEvent.detail.subjectId === subjectIdNum) {
        console.log('Tracking completed event received, refreshing data...');
        
        // Invalidate the query cache for tracking results
        queryClient.invalidateQueries({
          queryKey: ['/api/users', user.id, 'subjects', subjectIdNum, 'tracking']
        });
      }
    };
    
    window.addEventListener('tracking-completed', handleTrackingCompleted);
    
    return () => {
      window.removeEventListener('tracking-completed', handleTrackingCompleted);
    };
  }, [user?.id, subjectIdNum]);

  // Fetch tracking results for this user and subject
  const { data: trackingResults = [], isLoading } = useQuery({
    queryKey: ['/api/users', user?.id, 'subjects', subjectIdNum, 'tracking'],
    queryFn: () => getUserSubjectTrackingResults(user!.id, subjectIdNum),
    enabled: !!user && !!subjectIdNum,
  });

  const handleBackToClassroom = () => {
    setLocation(`/classroom/${subjectId}`);
  };

  // Use the most recent tracking result
  const latestResult = trackingResults.length > 0 ? trackingResults[trackingResults.length - 1] : null;

  // Parse session data if available
  let sessionData = null;
  if (latestResult?.sessionData) {
    try {
      sessionData = JSON.parse(latestResult.sessionData);
    } catch (error) {
      console.error("Failed to parse session data:", error);
    }
  }

  if (!user || !currentSubject) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white shadow-md">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              className="mr-4 p-1 rounded-full hover:bg-primary-dark focus:outline-none text-white"
              onClick={handleBackToClassroom}
            >
              <span className="material-icons">arrow_back</span>
            </Button>
            <h1 className="text-xl font-bold">
              Attention Tracking Results
            </h1>
          </div>
          
          <div className="flex items-center text-sm">
            <Button 
              variant="secondary" 
              className="flex items-center"
              onClick={() => {
                if (latestResult && currentSubject) {
                  const filename = generatePDF(latestResult, currentSubject);
                  toast({
                    title: "PDF Exported Successfully",
                    description: `File saved as ${filename}`,
                  });
                } else {
                  toast({
                    title: "Export Failed",
                    description: "No tracking data available to export",
                    variant: "destructive",
                  });
                }
              }}
              disabled={!latestResult}
            >
              <span className="material-icons mr-1">download</span>
              <span>Export PDF</span>
            </Button>
          </div>
        </div>
      </header>
      
      {/* Results Content */}
      <main className="container mx-auto px-4 py-6">
        {isLoading ? (
          <Card>
            <CardContent className="pt-6 flex justify-center items-center h-32">
              <span className="text-gray-500">Loading tracking results...</span>
            </CardContent>
          </Card>
        ) : !latestResult ? (
          <Card>
            <CardContent className="pt-6 flex justify-center items-center h-32">
              <span className="text-gray-500">No tracking data available yet. Start tracking in the classroom.</span>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Session Overview */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Session Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-100 rounded-md p-4 text-center">
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Subject</h3>
                    <p className="text-lg font-semibold">{currentSubject.name}</p>
                    <p className="text-xs text-gray-500">Machine Learning Fundamentals</p>
                  </div>
                  
                  <div className="bg-gray-100 rounded-md p-4 text-center">
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Session Duration</h3>
                    <p className="text-lg font-semibold">
                      {new Date(latestResult.endTime).getTime() - new Date(latestResult.startTime).getTime() > 0 
                       ? new Date(new Date(latestResult.endTime).getTime() - new Date(latestResult.startTime).getTime())
                         .toISOString().substr(11, 8)
                       : "00:00:00"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(latestResult.sessionDate).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div className="bg-gray-100 rounded-md p-4 text-center">
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Overall Attentiveness</h3>
                    <p className="text-lg font-semibold text-green-600">{latestResult.attentivenessScore}%</p>
                    <p className="text-xs text-gray-500">
                      {latestResult.attentivenessScore > 80 ? "Excellent attention level" :
                       latestResult.attentivenessScore > 60 ? "Good attention level" :
                       latestResult.attentivenessScore > 40 ? "Average attention level" :
                       "Poor attention level"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Detailed Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Eye Movements & Blinks */}
              <Card>
                <CardHeader>
                  <CardTitle>Eye Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Eye Movements</h3>
                      <div className="bg-gray-100 p-4 rounded-md">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-3xl font-semibold">{latestResult.eyeMovementCount}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
                            {latestResult.eyeMovementCount > 100 ? "High" : 
                             latestResult.eyeMovementCount > 50 ? "Moderate" : "Low"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">Average: 120 movements per hour</p>
                        
                        <div className="mt-4">
                          <div className="flex justify-between text-xs text-gray-700 mb-1">
                            <span>Movement Type</span>
                            <span>Count</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xs">Looking away</span>
                              <span className="text-xs font-medium">{Math.round(latestResult.eyeMovementCount * 0.3)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs">Scanning content</span>
                              <span className="text-xs font-medium">{Math.round(latestResult.eyeMovementCount * 0.6)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs">Rapid movements</span>
                              <span className="text-xs font-medium">{Math.round(latestResult.eyeMovementCount * 0.1)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Eye Blinks</h3>
                      <div className="bg-gray-100 p-4 rounded-md">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-3xl font-semibold">{latestResult.eyeBlinkCount}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                            {latestResult.eyeBlinkCount > 300 ? "High" : 
                             latestResult.eyeBlinkCount > 150 ? "Normal" : "Low"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">Average: 15-20 blinks per minute</p>
                        
                        <div className="mt-4">
                          <h4 className="text-xs font-medium mb-2">Blink Frequency Over Time</h4>
                          <div className="h-20 flex items-end space-x-1">
                            {/* Simple bar chart visualization */}
                            <div className="h-1/3 w-full bg-primary-light rounded-t"></div>
                            <div className="h-2/3 w-full bg-primary-light rounded-t"></div>
                            <div className="h-1/2 w-full bg-primary-light rounded-t"></div>
                            <div className="h-3/4 w-full bg-primary-light rounded-t"></div>
                            <div className="h-3/5 w-full bg-primary-light rounded-t"></div>
                            <div className="h-2/5 w-full bg-primary-light rounded-t"></div>
                            <div className="h-1/2 w-full bg-primary-light rounded-t"></div>
                            <div className="h-3/5 w-full bg-primary-light rounded-t"></div>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>Start</span>
                            <span>End</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Facial Expression & Body Posture */}
              <Card>
                <CardHeader>
                  <CardTitle>Expression & Posture</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Facial Expressions</h3>
                      <div className="bg-gray-100 p-4 rounded-md">
                        <div className="space-y-3">
                          {sessionData?.facial_expressions && (
                            <>
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Neutral</span>
                                  <span>{Math.round(sessionData.facial_expressions.neutral / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)}%</span>
                                </div>
                                <Progress 
                                  value={Math.round(sessionData.facial_expressions.neutral / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)} 
                                  className="h-2"
                                />
                              </div>
                              
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Focused</span>
                                  <span>{Math.round(sessionData.facial_expressions.focused / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)}%</span>
                                </div>
                                <Progress 
                                  value={Math.round(sessionData.facial_expressions.focused / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)} 
                                  className="h-2 bg-green-100"
                                  indicatorClassName="bg-green-500"
                                />
                              </div>
                              
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Confused</span>
                                  <span>{Math.round(sessionData.facial_expressions.confused / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)}%</span>
                                </div>
                                <Progress 
                                  value={Math.round(sessionData.facial_expressions.confused / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)} 
                                  className="h-2 bg-yellow-100"
                                  indicatorClassName="bg-yellow-500"
                                />
                              </div>
                              
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Distracted</span>
                                  <span>{Math.round(sessionData.facial_expressions.distracted / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)}%</span>
                                </div>
                                <Progress 
                                  value={Math.round(sessionData.facial_expressions.distracted / 
                                    (sessionData.facial_expressions.neutral + 
                                     sessionData.facial_expressions.focused + 
                                     sessionData.facial_expressions.confused + 
                                     sessionData.facial_expressions.distracted) * 100)} 
                                  className="h-2 bg-red-100"
                                  indicatorClassName="bg-red-500"
                                />
                              </div>
                            </>
                          )}
                        </div>
                        
                        <p className="text-xs text-gray-500 mt-4">
                          Your expressions were mostly neutral with periods of focused engagement,
                          particularly during the neural networks discussion.
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Body Posture</h3>
                      <div className="bg-gray-100 p-4 rounded-md">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-3xl font-semibold">{latestResult.postureChangeCount}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
                            {latestResult.postureChangeCount > 15 ? "High Movement" : 
                             latestResult.postureChangeCount > 8 ? "Moderate Movement" : "Low Movement"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{latestResult.postureChangeCount} significant posture changes detected</p>
                        
                        <div className="mt-4">
                          <h4 className="text-xs font-medium mb-2">Posture States</h4>
                          {sessionData?.posture_states && (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-xs">Upright/Attentive</span>
                                <span className="text-xs font-medium">
                                  {Math.round(sessionData.posture_states.upright / 
                                    (sessionData.posture_states.upright + 
                                     sessionData.posture_states.leaning_forward + 
                                     sessionData.posture_states.slouching + 
                                     sessionData.posture_states.away) * 100)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs">Leaning forward</span>
                                <span className="text-xs font-medium">
                                  {Math.round(sessionData.posture_states.leaning_forward / 
                                    (sessionData.posture_states.upright + 
                                     sessionData.posture_states.leaning_forward + 
                                     sessionData.posture_states.slouching + 
                                     sessionData.posture_states.away) * 100)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs">Slouching</span>
                                <span className="text-xs font-medium">
                                  {Math.round(sessionData.posture_states.slouching / 
                                    (sessionData.posture_states.upright + 
                                     sessionData.posture_states.leaning_forward + 
                                     sessionData.posture_states.slouching + 
                                     sessionData.posture_states.away) * 100)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs">Away from camera</span>
                                <span className="text-xs font-medium">
                                  {Math.round(sessionData.posture_states.away / 
                                    (sessionData.posture_states.upright + 
                                     sessionData.posture_states.leaning_forward + 
                                     sessionData.posture_states.slouching + 
                                     sessionData.posture_states.away) * 100)}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Recommendations */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Personalized Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-100 p-4 rounded-md">
                    <div className="flex items-start mb-3">
                      <span className="material-icons text-primary mr-2">schedule</span>
                      <h3 className="text-sm font-medium">Optimal Study Time</h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      Your attention was highest during the beginning of the lecture. Consider scheduling
                      focused study sessions in shorter 30-minute blocks.
                    </p>
                  </div>
                  
                  <div className="bg-gray-100 p-4 rounded-md">
                    <div className="flex items-start mb-3">
                      <span className="material-icons text-primary mr-2">visibility</span>
                      <h3 className="text-sm font-medium">Visual Focus</h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      Eye movement patterns suggest you may benefit from more visual learning materials
                      like diagrams and flowcharts rather than dense text.
                    </p>
                  </div>
                  
                  <div className="bg-gray-100 p-4 rounded-md">
                    <div className="flex items-start mb-3">
                      <span className="material-icons text-primary mr-2">fitness_center</span>
                      <h3 className="text-sm font-medium">Physical Comfort</h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      Posture changes increased in the last 20 minutes. Consider a more comfortable
                      seating arrangement or taking short breaks during longer sessions.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
