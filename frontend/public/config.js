// Runtime configuration placeholder.
//
// This file is served as a static asset alongside the SPA. At deploy time, the
// CDK BucketDeployment overwrites it with the real API base URL, e.g.:
//
//   window.__API_BASE_URL__ = "https://abc123.execute-api.us-east-1.amazonaws.com";
//
// Leaving the value undefined (as below) makes the app fall back to the
// build-time VITE_API_BASE_URL and then to a local default. This lets the same
// static bundle be pointed at any deployed backend without a rebuild.
window.__API_BASE_URL__ = window.__API_BASE_URL__ || undefined;
