import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "dist");
const sourceHeadersFile = path.join(projectRoot, "_headers");
const sourceRedirectsFile = path.join(projectRoot, "_redirects");
const distHeadersFile = path.join(distDir, "_headers");
const distRedirectsFile = path.join(distDir, "_redirects");

function ensureDist() {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
}

function copyRedirects() {
  if (!fs.existsSync(sourceRedirectsFile)) {
    console.log("_redirects missing at project root, skipping.");
    return;
  }

  fs.copyFileSync(sourceRedirectsFile, distRedirectsFile);
  console.log("Copied _redirects to dist.");
}

function copyHeadersWithOptionalAuthOverride() {
  if (!fs.existsSync(sourceHeadersFile)) {
    console.log("_headers missing at project root, skipping.");
    return;
  }

  let headersContent = fs.readFileSync(sourceHeadersFile, "utf8");
  const basicAuthCredentials = process.env.BASIC_AUTH_CREDENTIALS;

  if (basicAuthCredentials) {
    headersContent = headersContent.replace(
      /Basic-Auth:\s*CHANGE_ME_ADMIN:CHANGE_ME_PASSWORD/g,
      `Basic-Auth: ${basicAuthCredentials}`
    );
    console.log("Applied BASIC_AUTH_CREDENTIALS override in _headers.");
  } else {
    console.log("BASIC_AUTH_CREDENTIALS not set; keeping placeholder Basic-Auth values from _headers.");
  }

  fs.writeFileSync(distHeadersFile, headersContent, "utf8");
  console.log("Copied _headers to dist.");
}

ensureDist();
copyRedirects();
copyHeadersWithOptionalAuthOverride();
