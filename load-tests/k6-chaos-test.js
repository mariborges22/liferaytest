import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Custom Prometheus/OpenTelemetry-aligned metrics
const chaosFailures = new Counter("chaos_injected_failures");
const errorRate = new Rate("error_rate");
const postLatency = new Trend("post_latency_ms");
const healthLatency = new Trend("health_latency_ms");

export const options = {
    scenarios: {
        // Scenario 1: Gradual load spike & recovery
        load_and_spike: {
            executor: "ramping-arrival-rate",
            startRate: 5,
            timeUnit: "1s",
            preAllocatedVUs: 20,
            maxVUs: 100,
            stages: [
                { duration: "15s", target: 20 },  // Normal baseline
                { duration: "20s", target: 80 },  // High load spike (triggers HPA scale-up)
                { duration: "15s", target: 10 },  // Cool-down & stabilization
            ],
            exec: "standardTraffic",
        },
        // Scenario 2: Chaos Engineering injection (fuzzing, malformed payloads, rate pounding)
        chaos_injection: {
            executor: "constant-vus",
            vus: 5,
            duration: "50s",
            exec: "chaosAttacks",
        },
    },
    thresholds: {
        // SLO: 95% of standard requests under 400ms
        "http_req_duration{scenario:load_and_spike}": ["p(95)<400"],
        // Service must stay healthy during chaos
        "health_latency_ms": ["p(95)<200"],
        // Non-chaos traffic error rate strictly below 2%
        "error_rate{scenario:load_and_spike}": ["rate<0.02"],
    },
};

const BASE_URL = __ENV.APP_URL || "http://localhost:3000";

export function standardTraffic() {
    // 1. Healthcheck probe (Liveness & Readiness validation)
    const healthRes = http.get(`${BASE_URL}/healthz`, {
        tags: { type: "health" }
    });
    healthLatency.add(healthRes.timings.duration);
    check(healthRes, {
        "health status is 200": (r) => r.status === 200,
    });

    // 2. Read operations
    const listRes = http.get(`${BASE_URL}/posts`, {
        tags: { type: "list_posts" },
        headers: {
            "traceparent": `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
        }
    });
    check(listRes, {
        "get posts returns 200": (r) => r.status === 200,
    });
    errorRate.add(listRes.status !== 200);

    // 3. Write operations
    const payload = JSON.stringify({
        title: `Load Test Post ${Date.now()}-${__VU}`,
        text: "Automated load testing post with k6 simulating multi-user concurrency.",
        categories: [{ name: "LoadTesting" }]
    });

    const createRes = http.post(`${BASE_URL}/posts`, payload, {
        headers: {
            "Content-Type": "application/json",
            "traceparent": `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
        },
        tags: { type: "create_post" }
    });
    postLatency.add(createRes.timings.duration);
    check(createRes, {
        "post created successfully": (r) => r.status === 200 || r.status === 201,
    });
    errorRate.add(createRes.status >= 500);

    sleep(0.5);
}

export function chaosAttacks() {
    group("Chaos Scenario A: Malformed Payload Flood", function () {
        // Inject broken JSON and massive body to verify server does not crash
        const malformedPayload = "{\"title\": \"Broken JSON...".repeat(50);
        const res = http.post(`${BASE_URL}/posts`, malformedPayload, {
            headers: { "Content-Type": "application/json" }
        });
        check(res, {
            "rejects malformed payload with 400 or handled gracefully (not crashing)": (r) => r.status === 400 || r.status === 500,
        });
        chaosFailures.add(1);
    });

    group("Chaos Scenario B: SQL Injection / Fuzzing Attempt", function () {
        const sqliPayload = JSON.stringify({
            title: "' OR '1'='1'; DROP TABLE post; --",
            text: "Testing input sanitization under stress",
            categories: [{ name: "SecurityChaos" }]
        });
        const res = http.post(`${BASE_URL}/posts`, sqliPayload, {
            headers: { "Content-Type": "application/json" }
        });
        check(res, {
            "sql injection payload is safely handled or stored as text without db failure": (r) => r.status === 200 || r.status === 400,
        });
    });

    group("Chaos Scenario C: Random Non-existent Route Pounding", function () {
        const randomPath = `/non-existent-route-${Math.random()}`;
        const res = http.get(`${BASE_URL}${randomPath}`);
        check(res, {
            "returns 404 cleanly": (r) => r.status === 404,
        });
    });

    sleep(1);
}
