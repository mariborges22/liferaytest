/**
 * Automated Smoke Test Suite
 * Tests basic application availability, health probes, and CRUD endpoints.
 * Usable against localhost, Kubernetes Ingress, or cloud deployment.
 * 
 * Usage:
 *   APP_URL=http://localhost:3000 node tests/smoke-test.js
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const BASE_URL = process.env.APP_URL || "http://127.0.0.1:3000";

const colors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    reset: "\x1b[0m"
};

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const fullUrl = new URL(path, BASE_URL);
        const isHttps = fullUrl.protocol === "https:";
        const client = isHttps ? https : http;

        const options = {
            hostname: fullUrl.hostname,
            port: fullUrl.port || (isHttps ? 443 : 80),
            path: fullUrl.pathname + fullUrl.search,
            method: method,
            headers: {
                "Accept": "application/json"
            },
            timeout: 5000
        };

        if (body) {
            const data = JSON.stringify(body);
            options.headers["Content-Type"] = "application/json";
            options.headers["Content-Length"] = Buffer.byteLength(data);
        }

        const req = client.request(options, res => {
            let resBody = "";
            res.on("data", chunk => { resBody += chunk; });
            res.on("end", () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(resBody);
                } catch {
                    parsed = resBody;
                }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on("error", err => reject(err));
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timed out after 5000ms"));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runSmokeTests() {
    console.log(`${colors.blue}=== STARTING SMOKE TESTS ===${colors.reset}`);
    console.log(`Target URL: ${colors.yellow}${BASE_URL}${colors.reset}\n`);

    let passed = 0;
    let failed = 0;
    let createdPostId = null;

    async function test(name, fn) {
        process.stdout.write(`• Testing ${name}... `);
        try {
            await fn();
            console.log(`${colors.green}PASSED${colors.reset}`);
            passed++;
        } catch (err) {
            console.log(`${colors.red}FAILED${colors.reset}`);
            console.error(`  ${colors.red}Error: ${err.message}${colors.reset}`);
            failed++;
        }
    }

    // 1. Health Probe (Liveness)
    await test("Liveness probe (GET /healthz)", async () => {
        const res = await request("GET", "/healthz");
        if (res.statusCode !== 200) {
            throw new Error(`Expected 200, got ${res.statusCode}`);
        }
        if (!res.body || res.body.status !== "healthy") {
            throw new Error(`Unexpected body: ${JSON.stringify(res.body)}`);
        }
    });

    // 2. Readiness Probe (Database connection)
    await test("Readiness probe (GET /readyz)", async () => {
        const res = await request("GET", "/readyz");
        if (res.statusCode !== 200) {
            throw new Error(`Expected 200, got ${res.statusCode} (Is database running?)`);
        }
        if (!res.body || res.body.status !== "ready") {
            throw new Error(`Unexpected body: ${JSON.stringify(res.body)}`);
        }
    });

    // 3. List posts
    await test("List posts (GET /posts)", async () => {
        const res = await request("GET", "/posts");
        if (res.statusCode !== 200) {
            throw new Error(`Expected 200, got ${res.statusCode}`);
        }
        if (!Array.isArray(res.body)) {
            throw new Error(`Expected array of posts, got ${typeof res.body}`);
        }
    });

    // 4. Create post
    await test("Create new post (POST /posts)", async () => {
        const payload = {
            title: `Smoke Test ${Date.now()}`,
            text: "Automated verification content from smoke test suite"
        };
        const res = await request("POST", "/posts", payload);
        if (res.statusCode !== 200 && res.statusCode !== 201) {
            throw new Error(`Expected 200/201, got ${res.statusCode}`);
        }
        if (!res.body || !res.body.id) {
            throw new Error(`Post not created properly: ${JSON.stringify(res.body)}`);
        }
        createdPostId = res.body.id;
    });

    // 5. Retrieve created post
    await test(`Retrieve created post (GET /posts/${createdPostId || 1})`, async () => {
        if (!createdPostId) {
            throw new Error("Skipped because post creation failed.");
        }
        const res = await request("GET", `/posts/${createdPostId}`);
        if (res.statusCode !== 200) {
            throw new Error(`Expected 200, got ${res.statusCode}`);
        }
        if (!res.body || res.body.id !== createdPostId) {
            throw new Error(`Expected post with id ${createdPostId}, got ${JSON.stringify(res.body)}`);
        }
    });

    console.log(`\n${colors.blue}=== TEST SUMMARY ===${colors.reset}`);
    console.log(`Passed: ${colors.green}${passed}${colors.reset}`);
    console.log(`Failed: ${failed > 0 ? colors.red : colors.green}${failed}${colors.reset}`);

    if (failed > 0) {
        console.error(`\n${colors.red}Smoke tests FAILED!${colors.reset}`);
        process.exit(1);
    } else {
        console.log(`\n${colors.green}All smoke tests PASSED successfully!${colors.reset}`);
        process.exit(0);
    }
}

runSmokeTests().catch(err => {
    console.error(`Unexpected test runner failure:`, err);
    process.exit(1);
});
