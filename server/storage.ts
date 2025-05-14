import { 
    users, 
    subjects, 
    enrollments, 
    trackingResults,
    type User, 
    type InsertUser, 
    type Subject, 
    type InsertSubject,
    type Enrollment,
    type InsertEnrollment,
    type TrackingResult,
    type InsertTrackingResult
  } from "@shared/schema";
  
  export interface IStorage {
    // User methods
    getUser(id: number): Promise<User | undefined>;
    getUserByUsername(username: string): Promise<User | undefined>;
    getUserByEmail(email: string): Promise<User | undefined>;
    createUser(user: InsertUser): Promise<User>;
    
    // Subject methods
    getSubject(id: number): Promise<Subject | undefined>;
    getSubjectByCode(code: string): Promise<Subject | undefined>;
    getAllSubjects(): Promise<Subject[]>;
    createSubject(subject: InsertSubject): Promise<Subject>;
    
    // Enrollment methods
    getEnrollmentsByUserId(userId: number): Promise<Enrollment[]>;
    getEnrolledSubjectsByUserId(userId: number): Promise<Subject[]>;
    enrollUserInSubject(enrollment: InsertEnrollment): Promise<Enrollment>;
    isUserEnrolledInSubject(userId: number, subjectId: number): Promise<boolean>;
    
    // Tracking methods
    saveTrackingResult(result: InsertTrackingResult): Promise<TrackingResult>;
    getTrackingResultsByUserId(userId: number): Promise<TrackingResult[]>;
    getTrackingResultByUserAndSubject(userId: number, subjectId: number): Promise<TrackingResult[]>;
  }
  
  export class MemStorage implements IStorage {
    private users: Map<number, User>;
    private subjects: Map<number, Subject>;
    private enrollments: Map<number, Enrollment>;
    private trackingResults: Map<number, TrackingResult>;
    private userId: number;
    private subjectId: number;
    private enrollmentId: number;
    private trackingResultId: number;
  
    constructor() {
      this.users = new Map();
      this.subjects = new Map();
      this.enrollments = new Map();
      this.trackingResults = new Map();
      this.userId = 1;
      this.subjectId = 1;
      this.enrollmentId = 1;
      this.trackingResultId = 1;
      
      // Seed data - demo users
      this.seedUsers();
      this.seedSubjects();
      this.seedEnrollments();
    }
  
    private seedUsers() {
      const demoUsers = [
        { username: "john_doe", email: "john@vle.edu", password: "student123" },
        { username: "emma_smith", email: "emma@vle.edu", password: "student456" },
        { username: "mike_jones", email: "mike@vle.edu", password: "student789" },
        { username: "sara_wilson", email: "sara@vle.edu", password: "student012" },
        { username: "alex_brown", email: "alex@vle.edu", password: "student345" }
      ];
      
      demoUsers.forEach(user => {
        this.createUser(user);
      });
    }
  
    private seedSubjects() {
      const subjects = [
        { name: "Artificial Intelligence", code: "AI", facultyName: "Dr. Alan Turing", schedule: "Mon, Wed, Fri - 14:30-16:00" },
        { name: "Database Management Systems", code: "DBMS", facultyName: "Dr. Edgar Codd", schedule: "Tue, Thu - 10:00-11:30" },
        { name: "Operating Systems", code: "OS", facultyName: "Prof. Linus Torvalds", schedule: "Mon, Wed - 09:00-10:30" },
        { name: "Computer Networks", code: "CN", facultyName: "Dr. Vint Cerf", schedule: "Tue, Thu - 13:00-14:30" }
      ];
      
      subjects.forEach(subject => {
        this.createSubject(subject);
      });
    }
  
    private seedEnrollments() {
      // Enroll some users in subjects
      this.enrollUserInSubject({ userId: 1, subjectId: 1 }); // john_doe in AI
      this.enrollUserInSubject({ userId: 1, subjectId: 2 }); // john_doe in DBMS
      this.enrollUserInSubject({ userId: 2, subjectId: 1 }); // emma_smith in AI
      this.enrollUserInSubject({ userId: 3, subjectId: 2 }); // mike_jones in DBMS
      this.enrollUserInSubject({ userId: 3, subjectId: 3 }); // mike_jones in OS
      this.enrollUserInSubject({ userId: 4, subjectId: 4 }); // sara_wilson in CN
      this.enrollUserInSubject({ userId: 5, subjectId: 1 }); // alex_brown in AI
    }
  
    // User methods
    async getUser(id: number): Promise<User | undefined> {
      return this.users.get(id);
    }
  
    async getUserByUsername(username: string): Promise<User | undefined> {
      return Array.from(this.users.values()).find(
        (user) => user.username === username
      );
    }
    
    async getUserByEmail(email: string): Promise<User | undefined> {
      return Array.from(this.users.values()).find(
        (user) => user.email === email
      );
    }
  
    async createUser(insertUser: InsertUser): Promise<User> {
      const id = this.userId++;
      const user: User = { ...insertUser, id };
      this.users.set(id, user);
      return user;
    }
    
    // Subject methods
    async getSubject(id: number): Promise<Subject | undefined> {
      return this.subjects.get(id);
    }
    
    async getSubjectByCode(code: string): Promise<Subject | undefined> {
      return Array.from(this.subjects.values()).find(
        (subject) => subject.code === code
      );
    }
    
    async getAllSubjects(): Promise<Subject[]> {
      return Array.from(this.subjects.values());
    }
    
    async createSubject(insertSubject: InsertSubject): Promise<Subject> {
      const id = this.subjectId++;
      const subject: Subject = { ...insertSubject, id };
      this.subjects.set(id, subject);
      return subject;
    }
    
    // Enrollment methods
    async getEnrollmentsByUserId(userId: number): Promise<Enrollment[]> {
      return Array.from(this.enrollments.values()).filter(
        (enrollment) => enrollment.userId === userId
      );
    }
    
    async getEnrolledSubjectsByUserId(userId: number): Promise<Subject[]> {
      const enrollments = await this.getEnrollmentsByUserId(userId);
      const subjectIds = enrollments.map(enrollment => enrollment.subjectId);
      
      return Array.from(this.subjects.values()).filter(
        (subject) => subjectIds.includes(subject.id)
      );
    }
    
    async enrollUserInSubject(insertEnrollment: InsertEnrollment): Promise<Enrollment> {
      const id = this.enrollmentId++;
      const enrollment: Enrollment = { ...insertEnrollment, id };
      this.enrollments.set(id, enrollment);
      return enrollment;
    }
    
    async isUserEnrolledInSubject(userId: number, subjectId: number): Promise<boolean> {
      return Array.from(this.enrollments.values()).some(
        (enrollment) => enrollment.userId === userId && enrollment.subjectId === subjectId
      );
    }
    
    // Tracking methods
    async saveTrackingResult(insertResult: InsertTrackingResult): Promise<TrackingResult> {
      const id = this.trackingResultId++;
      const result: TrackingResult = { ...insertResult, id };
      this.trackingResults.set(id, result);
      return result;
    }
    
    async getTrackingResultsByUserId(userId: number): Promise<TrackingResult[]> {
      return Array.from(this.trackingResults.values()).filter(
        (result) => result.userId === userId
      );
    }
    
    async getTrackingResultByUserAndSubject(userId: number, subjectId: number): Promise<TrackingResult[]> {
      return Array.from(this.trackingResults.values()).filter(
        (result) => result.userId === userId && result.subjectId === subjectId
      );
    }
  }
  
  export const storage = new MemStorage();
  