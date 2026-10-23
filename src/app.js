import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { notFound } from "./middleware/notFound.js";
import mainRoutes from "./routes/index.js";
import { DEFAULT_DATABASE_PATH } from "./database/database.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

/**
 * Create and configure the CSMS Express application.
 *
 * @param {string} [databasePath] - Path to the SQLite database file.
 *   Defaults to the application's runtime database. Pass a temporary
 *   path in tests to keep each test suite isolated.
 * @returns {import("express").Express} Configured Express application.
 */
export function createApp(databasePath = DEFAULT_DATABASE_PATH) {
  const app = express();

  app.disable("x-powered-by");

  // Make the database path available to all controllers via req.app.locals.
  app.locals.databasePath = databasePath;

  app.set("views", path.join(currentDirectory, "views"));
  app.set("view engine", "ejs");

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(currentDirectory, "..", "public")));

  app.use(mainRoutes);

  app.use(notFound);

  return app;
}