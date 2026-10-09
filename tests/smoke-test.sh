#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"

echo "=========================================="
echo " Running Smoke Tests against: ${APP_URL}"
echo "=========================================="

echo -n "1. Checking Liveness probe (/healthz)... "
STATUS_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/healthz")
if [ "$STATUS_HEALTH" -eq 200 ]; then
    echo "OK (HTTP 200)"
else
    echo "FAILED (HTTP ${STATUS_HEALTH})"
    exit 1
fi

echo -n "2. Checking Readiness probe (/readyz)... "
STATUS_READY=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/readyz")
if [ "$STATUS_READY" -eq 200 ]; then
    echo "OK (HTTP 200)"
else
    echo "FAILED (HTTP ${STATUS_READY})"
    exit 1
fi

echo -n "3. Testing GET /posts... "
STATUS_POSTS=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/posts")
if [ "$STATUS_POSTS" -eq 200 ]; then
    echo "OK (HTTP 200)"
else
    echo "FAILED (HTTP ${STATUS_POSTS})"
    exit 1
fi

echo -n "4. Testing POST /posts... "
CREATE_RESP=$(curl -s -X POST "${APP_URL}/posts" \
  -H "Content-Type: application/json" \
  -d '{"title":"Automated Test","text":"Smoke test execution"}')

POST_ID=$(echo "${CREATE_RESP}" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2 || true)

if [ -n "$POST_ID" ]; then
    echo "OK (Created ID: ${POST_ID})"
else
    echo "FAILED: ${CREATE_RESP}"
    exit 1
fi

echo -n "5. Testing GET /posts/${POST_ID}... "
GET_SINGLE=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/posts/${POST_ID}")
if [ "$GET_SINGLE" -eq 200 ]; then
    echo "OK (HTTP 200)"
else
    echo "FAILED (HTTP ${GET_SINGLE})"
    exit 1
fi

echo "=========================================="
echo " All smoke tests passed successfully!"
echo "=========================================="
