/**
 * Shared CSMS application and server configuration.
 */

export const applicationConfig = Object.freeze({
  name: "Community Services Management System",
  shortName: "CSMS",
  version: "1.0.0",
  currentSprint: "Sprint 6 - Final Release",
  technology: "JavaScript with Express.js"
});

export const serverConfig = Object.freeze({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000)
});