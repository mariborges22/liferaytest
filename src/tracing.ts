import { Request, Response, NextFunction } from "express";
import * as crypto from "crypto";

export interface Span {
    traceId: string;
    spanId: string;
    name: string;
    startTime: [number, number];
    attributes: Record<string, any>;
    status?: { code: string; message?: string };
}

class TelemetryTracer {
    private serviceName: string;
    private otlpEndpoint?: string;
    private enabled: boolean;

    constructor() {
        this.serviceName = process.env.OTEL_SERVICE_NAME || "infrastructure-interview-app";
        this.otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
        this.enabled = process.env.OTEL_ENABLED !== "false";
    }

    public startSpan(name: string, parentTraceId?: string): Span {
        const traceId = parentTraceId || crypto.randomBytes(16).toString("hex");
        const spanId = crypto.randomBytes(8).toString("hex");
        return {
            traceId,
            spanId,
            name,
            startTime: process.hrtime(),
            attributes: {
                "service.name": this.serviceName,
                "telemetry.sdk.language": "nodejs",
                "telemetry.sdk.name": "opentelemetry-compatible-tracer"
            }
        };
    }

    public endSpan(span: Span, status: { code: "OK" | "ERROR"; message?: string } = { code: "OK" }) {
        if (!this.enabled) return;

        const diff = process.hrtime(span.startTime);
        const durationMs = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2);
        span.status = status;

        const logPayload = {
            trace_id: span.traceId,
            span_id: span.spanId,
            span_name: span.name,
            duration_ms: parseFloat(durationMs),
            status: span.status.code,
            attributes: span.attributes
        };

        // When OTLP collector is wired, this can forward JSON to OTEL Collector HTTP endpoint
        if (process.env.OTEL_LOG_SPANS === "true" || process.env.NODE_ENV === "development") {
            console.log(`[OpenTelemetry Span] ${JSON.stringify(logPayload)}`);
        }
    }
}

export const tracer = new TelemetryTracer();

// Middleware to inject W3C traceparent headers and track HTTP requests
export function telemetryMiddleware(req: Request, res: Response, next: NextFunction) {
    const rawTraceParent = req.headers["traceparent"] as string | undefined;
    let parentTraceId: string | undefined;

    if (rawTraceParent && rawTraceParent.startsWith("00-")) {
        const parts = rawTraceParent.split("-");
        if (parts.length >= 4) {
            parentTraceId = parts[1];
        }
    }

    const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`, parentTraceId);
    span.attributes["http.method"] = req.method;
    span.attributes["http.url"] = req.originalUrl || req.url;
    span.attributes["http.user_agent"] = req.headers["user-agent"] || "unknown";

    // Standard W3C Trace Context response header
    const traceParentHeader = `00-${span.traceId}-${span.spanId}-01`;
    res.setHeader("traceresponse", traceParentHeader);
    res.setHeader("x-trace-id", span.traceId);

    res.on("finish", () => {
        span.attributes["http.status_code"] = res.statusCode;
        const status = res.statusCode >= 500 ? "ERROR" : "OK";
        tracer.endSpan(span, { code: status });
    });

    next();
}
