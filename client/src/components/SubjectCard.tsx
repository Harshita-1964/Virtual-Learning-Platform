import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Subject } from "@/lib/api";

interface SubjectCardProps {
  subject: Subject;
  isEnrolled: boolean;
  onEnroll: () => void;
}

export function SubjectCard({ subject, isEnrolled, onEnroll }: SubjectCardProps) {
  const [_, setLocation] = useLocation();

  const handleSubjectClick = () => {
    if (isEnrolled) {
      setLocation(`/classroom/${subject.id}`);
    }
  };

  const handleEnrollClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEnroll();
  };

  return (
    <Card 
      className={`rounded-lg shadow-md overflow-hidden border-t-4 ${
        isEnrolled ? "border-green-500" : "border-gray-400"
      } hover:shadow-lg transition-shadow duration-200`}
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">{subject.name}</h3>
          <Badge 
            variant={isEnrolled ? "default" : "secondary"}
            className={`${isEnrolled ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}
          >
            {isEnrolled ? "Enrolled" : "Not Enrolled"}
          </Badge>
        </div>
        
        <div className="text-sm text-gray-700 mb-4">
          <p><span className="font-medium">Faculty:</span> {subject.facultyName}</p>
          <p><span className="font-medium">Schedule:</span> {subject.schedule}</p>
        </div>
        
        {isEnrolled ? (
          <Button 
            variant="link" 
            className="p-0 h-auto text-primary hover:text-primary/80 flex items-center"
            onClick={handleSubjectClick}
          >
            <span>Enter Classroom</span>
            <span className="material-icons ml-1">arrow_forward</span>
          </Button>
        ) : (
          <Button 
            variant="ghost" 
            className="p-0 h-auto text-gray-500 hover:text-gray-700 flex items-center"
            onClick={handleEnrollClick}
          >
            <span>Enroll Now</span>
            <span className="material-icons ml-1">add_circle</span>
          </Button>
        )}
      </div>
    </Card>
  );
}
