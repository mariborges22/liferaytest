import "reflect-metadata";
import {createConnection, Connection} from "typeorm";
import {Request, Response} from "express";
import * as express from "express";
import * as bodyParser from "body-parser";
import {AppRoutes} from "./routes";
import {Post} from "./entity/Post";
import {Category} from "./entity/Category";

const PORT = parseInt(process.env.PORT || "3000", 10);
const dbHost = process.env.DB_HOST || process.env.TYPEORM_HOST || "localhost";
const dbPort = parseInt(process.env.DB_PORT || process.env.TYPEORM_PORT || "3306", 10);
const dbUser = process.env.DB_USER || process.env.TYPEORM_USERNAME || "test";
const dbPassword = process.env.DB_PASSWORD || process.env.TYPEORM_PASSWORD || "test";
const dbName = process.env.DB_NAME || process.env.TYPEORM_DATABASE || "test";
const dbSynchronize = process.env.DB_SYNCHRONIZE !== undefined
    ? process.env.DB_SYNCHRONIZE === "true"
    : (process.env.TYPEORM_SYNCHRONIZE === "true" || process.env.NODE_ENV !== "production");

let dbConnection: Connection | null = null;
let isShuttingDown = false;

const app = express();
app.use(bodyParser.json());

// Root endpoint
app.get("/", (request: Request, response: Response) => {
    response.status(200).json({
        service: "infrastructure-interview-test",
        version: "1.0.0",
        status: "running"
    });
});

// Liveness Probe: process is alive
app.get("/healthz", (request: Request, response: Response) => {
    if (isShuttingDown) {
        response.status(503).json({ status: "shutting_down" });
        return;
    }
    response.status(200).json({
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Readiness Probe: database is connected
app.get("/readyz", (request: Request, response: Response) => {
    if (isShuttingDown) {
        response.status(503).json({ status: "shutting_down" });
        return;
    }
    const isConnected = dbConnection && dbConnection.isConnected;
    if (isConnected) {
        response.status(200).json({
            status: "ready",
            database: "connected",
            timestamp: new Date().toISOString()
        });
    } else {
        response.status(503).json({
            status: "not_ready",
            database: "disconnected",
            timestamp: new Date().toISOString()
        });
    }
});

// Gate application routes if DB is not ready
app.use((request: Request, response: Response, next: Function) => {
    if (!dbConnection || !dbConnection.isConnected) {
        response.status(503).json({
            error: "Service unavailable: Database connection is not established yet."
        });
        return;
    }
    next();
});

// Register all application routes
AppRoutes.forEach(route => {
    app[route.method](route.path, (request: Request, response: Response, next: Function) => {
        route.action(request, response)
            .then(() => next)
            .catch(err => next(err));
    });
});

// Global error handler
app.use((err: any, request: Request, response: Response, next: Function) => {
    console.error("Unhandled error:", err);
    response.status(500).json({ error: "Internal Server Error" });
});

// Start HTTP server
const server = app.listen(PORT, () => {
    console.log(`Express application is up and running on port ${PORT}`);
});

// Database connection with retry mechanism
async function connectDatabase(maxRetries = 20, delayMs = 3000): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (isShuttingDown) return;
        try {
            console.log(`[Database] Attempting connection to ${dbHost}:${dbPort}/${dbName} (${attempt}/${maxRetries})...`);
            dbConnection = await createConnection({
                type: "mysql",
                host: dbHost,
                port: dbPort,
                username: dbUser,
                password: dbPassword,
                database: dbName,
                synchronize: dbSynchronize,
                logging: process.env.NODE_ENV === "development",
                entities: [Post, Category]
            });
            console.log("[Database] Successfully connected to database.");
            return;
        } catch (error) {
            console.warn(`[Database] Attempt ${attempt} failed: ${(error as Error).message}`);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    console.error("[Database] Failed to connect after multiple retries.");
}

connectDatabase();

// Graceful shutdown
async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
        console.log("[Shutdown] Closed incoming HTTP connections.");
        if (dbConnection && dbConnection.isConnected) {
            try {
                await dbConnection.close();
                console.log("[Shutdown] Closed database connection pool.");
            } catch (err) {
                console.error("[Shutdown] Error while closing database connection:", err);
            }
        }
        console.log("[Shutdown] Graceful shutdown complete. Exiting.");
        process.exit(0);
    });

    // Force termination if hanging
    setTimeout(() => {
        console.error("[Shutdown] Could not finish in time, force killing.");
        process.exit(1);
    }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
