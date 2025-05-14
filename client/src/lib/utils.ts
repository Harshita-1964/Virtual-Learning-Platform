import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { TrackingResult, Subject } from "./api"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generatePDF(trackingResult: TrackingResult, subject: Subject) {
  // Create a new PDF document
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Add logo and header
  doc.setFontSize(22);
  doc.setTextColor(0, 128, 0);  // Green color for heading
  doc.text("Virtual Learning Environment", pageWidth / 2, 20, { align: "center" });
  
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);  // Reset to black color
  doc.text("Attention Tracking Results", pageWidth / 2, 30, { align: "center" });
  
  // Add session info section
  doc.setFontSize(12);
  doc.text(`Session Date: ${new Date(trackingResult.sessionDate).toLocaleDateString()}`, 20, 45);
  doc.text(`Subject: ${subject.name} (${subject.code})`, 20, 52);
  doc.text(`Faculty: ${subject.facultyName}`, 20, 59);
  
  // Calculate duration
  const startTime = new Date(trackingResult.startTime);
  const endTime = new Date(trackingResult.endTime);
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationStr = new Date(durationMs).toISOString().substr(11, 8);
  
  doc.text(`Duration: ${durationStr}`, 20, 66);
  doc.text(`Time: ${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`, 20, 73);
  
  // Add overall attentiveness score
  doc.setFillColor(240, 240, 240);
  doc.rect(20, 85, pageWidth - 40, 20, "F");
  doc.setFontSize(14);
  doc.text("Overall Attentiveness Score", pageWidth / 2, 95, { align: "center" });
  doc.setFontSize(24);
  doc.setTextColor(trackingResult.attentivenessScore >= 70 ? 0 : (trackingResult.attentivenessScore >= 40 ? 255 : 255), 
                 trackingResult.attentivenessScore >= 70 ? 128 : (trackingResult.attentivenessScore >= 40 ? 165 : 0), 
                 0);
  doc.text(`${trackingResult.attentivenessScore}%`, pageWidth / 2, 110, { align: "center" });
  
  // Reset color
  doc.setTextColor(0, 0, 0);
  
  // Add detailed metrics
  doc.setFontSize(14);
  doc.text("Detailed Metrics", 20, 130);
  
  // Create table with metrics
  autoTable(doc, {
    startY: 140,
    head: [['Metric', 'Count']],
    body: [
      ['Eye Movements', trackingResult.eyeMovementCount],
      ['Eye Blinks', trackingResult.eyeBlinkCount],
      ['Posture Changes', trackingResult.postureChangeCount]
    ],
    theme: 'grid',
    styles: { fontSize: 12, cellPadding: 5 },
    headStyles: { fillColor: [0, 128, 0] }
  });
  
  // Parse session data if available
  let sessionData = null;
  try {
    if (trackingResult.sessionData) {
      sessionData = JSON.parse(trackingResult.sessionData);
    }
  } catch (error) {
    console.error("Failed to parse session data for PDF:", error);
  }
  
  // Add facial expressions and posture states if available
  if (sessionData && sessionData.facialExpressions) {
    // Get the current Y position from the last table (using any to bypass type checking)
    const tableInfo = (doc as any).lastAutoTable;
    const yPos = tableInfo ? tableInfo.finalY + 20 : 200;
    doc.text("Facial Expression Distribution", 20, yPos);
    
    const expressionData = Object.entries(sessionData.facialExpressions).map(
      ([expression, count]) => [expression, count as string|number]
    );
    
    autoTable(doc, {
      startY: yPos + 10,
      head: [['Expression', 'Frequency']],
      body: expressionData as any,
      theme: 'grid',
      styles: { fontSize: 12, cellPadding: 5 },
      headStyles: { fillColor: [0, 100, 0] }
    });
  }
  
  // Add recommendations
  doc.setFontSize(14);
  // Get the current Y position from the last table (using any to bypass type checking)
  const tableInfo = (doc as any).lastAutoTable;
  const recommendationsY = tableInfo ? tableInfo.finalY + 20 : 200;
  doc.text("Recommendations", 20, recommendationsY);
  
  doc.setFontSize(12);
  let recommendations = [
    "Try to maintain consistent focus during study sessions",
    "Take regular breaks to prevent eye strain and fatigue",
    "Adjust your posture regularly to stay comfortable"
  ];
  
  if (trackingResult.attentivenessScore < 50) {
    recommendations.unshift("Work on improving your focus during lectures");
  }
  
  recommendations.forEach((rec, index) => {
    doc.text(`• ${rec}`, 25, recommendationsY + 10 + (index * 8));
  });
  
  // Add footer
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setFontSize(10);
  doc.text("Generated on " + new Date().toLocaleString(), pageWidth / 2, footerY, { align: "center" });
  
  // Save the PDF with subject code and date
  const filename = `${subject.code}_tracking_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
  
  return filename;
}
