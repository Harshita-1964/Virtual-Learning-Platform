import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
});

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  facultyName: text("faculty_name").notNull(),
  schedule: text("schedule").notNull(),
});

export const enrollments = pgTable("enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
});

export const trackingResults = pgTable("tracking_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  sessionDate: timestamp("session_date").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  eyeMovementCount: integer("eye_movement_count").notNull(),
  eyeBlinkCount: integer("eye_blink_count").notNull(),
  postureChangeCount: integer("posture_change_count").notNull(),
  attentivenessScore: integer("attentiveness_score").notNull(),
  sessionData: text("session_data").notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users);
export const insertSubjectSchema = createInsertSchema(subjects);
export const insertEnrollmentSchema = createInsertSchema(enrollments);
export const insertTrackingResultSchema = createInsertSchema(trackingResults);

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Subject = typeof subjects.$inferSelect;

export type InsertEnrollment = z.infer<typeof insertEnrollmentSchema>;
export type Enrollment = typeof enrollments.$inferSelect;

export type InsertTrackingResult = z.infer<typeof insertTrackingResultSchema>;
export type TrackingResult = typeof trackingResults.$inferSelect;

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(6),
});

export type LoginCredentials = z.infer<typeof loginSchema>;

// Tracking data schema
export const trackingDataSchema = z.object({
  eyeMovements: z.number(),
  eyeBlinks: z.number(),
  postureChanges: z.number(),
  attentivenessScore: z.number(),
  facialExpressions: z.record(z.string(), z.number()),
  postureStates: z.record(z.string(), z.number()),
  sessionData: z.string(),
});

export type TrackingData = z.infer<typeof trackingDataSchema>;
