import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubjectCard } from "@/components/SubjectCard";
import { useAuth } from "@/hooks/useAuth";
import { getSubjects, getUserEnrollments, enrollUser, Subject } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [upcomingClass, setUpcomingClass] = useState<Subject | null>(null);
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      setLocation("/");
    }
  }, [user, setLocation]);
  
  // Update date and time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000); // every minute
    
    return () => clearInterval(interval);
  }, []);
  
  // Format date and time
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(currentDateTime);
  
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(currentDateTime);
  
  // Fetch all subjects
  const { data: subjects = [] } = useQuery({
    queryKey: ['/api/subjects'],
    enabled: !!user,
  });
  
  // Fetch user enrollments
  const { data: enrolledSubjects = [] } = useQuery({
    queryKey: ['/api/users', user?.id, 'enrollments'],
    queryFn: () => getUserEnrollments(user!.id),
    enabled: !!user,
  });
  
  // Enroll user in a subject
  const enrollMutation = useMutation({
    mutationFn: ({ userId, subjectId }: { userId: number, subjectId: number }) => 
      enrollUser(userId, subjectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'enrollments'] });
      toast({
        title: "Enrollment Successful",
        description: "You have been enrolled in the subject",
      });
    },
    onError: (error) => {
      toast({
        title: "Enrollment Failed",
        description: error instanceof Error ? error.message : "Failed to enroll in subject",
        variant: "destructive",
      });
    },
  });
  
  // Check if subject is in user's enrollments
  const isSubjectEnrolled = (subjectId: number) => {
    return enrolledSubjects.some(subject => subject.id === subjectId);
  };
  
  // Handle enroll button click
  const handleEnroll = (subjectId: number) => {
    if (!user) return;
    enrollMutation.mutate({ userId: user.id, subjectId });
  };
  
  if (!user) {
    return null; // Will redirect to login
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white shadow-md">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-xl font-bold">Virtual Learning Environment</h1>
          
          <div className="flex items-center mt-4 sm:mt-0">
            {/* Date & Time Display */}
            <div className="mr-6 text-sm">
              <span>{formattedDate}</span> | 
              <span className="ml-1">{formattedTime}</span>
            </div>
            
            {/* User Profile Menu */}
            <div className="relative group">
              <Button variant="ghost" className="text-white p-0">
                <span className="material-icons mr-1">account_circle</span>
                <span>{user.username}</span>
                <span className="material-icons">arrow_drop_down</span>
              </Button>
              
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 hidden group-hover:block">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={logout}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Subjects Section */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-gray-800">My Subjects</h2>
            
            {/* Schedule Alert - show if there's an upcoming class */}
            {upcomingClass && (
              <div className="bg-yellow-500 text-white text-sm px-4 py-2 rounded-md flex items-center">
                <span className="material-icons mr-2">schedule</span>
                <span>Upcoming: {upcomingClass.name} Class in 15 minutes</span>
              </div>
            )}
          </div>
          
          {/* Subjects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {subjects.map((subject: Subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                isEnrolled={isSubjectEnrolled(subject.id)}
                onEnroll={() => handleEnroll(subject.id)}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
